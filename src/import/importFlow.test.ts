import { describe, expect, it } from 'vitest';
import type { Dataset } from '../data/repository';
import { ScriptClient } from '../data/scriptClient';
import { ScriptRepository } from '../data/scriptRepository';
import { createScript, TEST_SECRET } from '../data/testing/fakeAppsScript';
import { createAccount } from '../domain/accounts';
import { buildDefaultCategories } from '../domain/defaultCategories';
import { quantityAt } from '../domain/investments';
import { buildImport, buildPlan } from './plan';
import { processStatement } from './process';
import type { ParserId } from './types';

/**
 * Flusso completo sullo script finto: file → lettura → piano → salvataggio atomico (una
 * richiesta) → rilettura dal foglio → lo stesso file viene riconosciuto come già importato.
 * Tutti i dati sono inventati.
 */

const REVOLUT = [
  'Tipo,Prodotto,Data di inizio,Data di completamento,Descrizione,Importo,Costo,Valuta,State,Saldo',
  'Pagamento con carta,Attuale,2026-08-29 21:28:10,2026-09-01 03:14:14,Negozio Uno,-9.31,0.00,EUR,COMPLETATO,622.10',
  'Pagamento con carta,Attuale,2026-09-02 09:00:00,2026-09-02 09:00:05,Negozio Uno,-9.31,0.00,EUR,COMPLETATO,612.79',
  'Pagamento con carta,Attuale,2026-09-03 09:00:00,,Sospeso Srl,-5.00,0.00,EUR,IN SOSPESO,607.79',
].join('\n');

const TR_HEADER =
  'datetime,"date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"';
function trRow(fields: Record<string, string>): string {
  return TR_HEADER.replaceAll('"', '')
    .split(',')
    .map((name) => `"${fields[name] ?? ''}"`)
    .join(',');
}
const TRADE_REPUBLIC = [
  TR_HEADER,
  trRow({
    date: '2026-09-01',
    category: 'CASH',
    type: 'INTEREST_PAYMENT',
    amount: '28.55',
    tax: '-7.42',
    currency: 'EUR',
    description: 'Interessi di prova',
    transaction_id: 'tx-int-1',
  }),
  trRow({
    date: '2026-09-02',
    category: 'TRADING',
    type: 'BUY',
    asset_class: 'FUND',
    name: 'ETF Esempio Mondo',
    symbol: 'IE0000000001',
    shares: '1.234567',
    price: '81.0000',
    amount: '-100.00',
    fee: '-1.00',
    currency: 'EUR',
    description: 'Piano di accumulo',
    transaction_id: 'tx-buy-1',
  }),
  trRow({
    date: '2026-09-03',
    category: 'TRADING',
    type: 'SELL',
    asset_class: 'FUND',
    name: 'ETF Esempio Mondo',
    symbol: 'IE0000000001',
    shares: '-0.5',
    price: '82.00',
    amount: '41.00',
    currency: 'EUR',
    description: 'Vendita di prova',
    transaction_id: 'tx-sell-1',
  }),
].join('\n');

async function setup() {
  const script = createScript();
  let requests = 0;
  const client = new ScriptClient({
    url: 'https://script.google.com/macros/s/TEST/exec',
    getKey: () => TEST_SECRET,
    fetchFn: (input, init) => {
      requests++;
      return script.fetchFn(input, init);
    },
    sleep: async () => {},
  });
  const repo = new ScriptRepository(client);
  await repo.init();
  await repo.load();
  const account = createAccount(
    {
      name: 'Conto di prova',
      institution: '',
      type: 'checking',
      currency: 'EUR',
      openingBalanceText: '0',
      openingDate: '2026-01-01',
    },
    [],
  );
  if (!account.ok) throw new Error('conto di prova non valido');
  await repo.save({
    accounts: { insert: [account.value] },
    categories: { insert: buildDefaultCategories() },
  });
  return { repo, accountId: account.value.id, requestCount: () => requests };
}

async function importFile(
  repo: ScriptRepository,
  accountId: string,
  parserId: ParserId,
  text: string,
  filename: string,
): Promise<{ data: Dataset; summary: ReturnType<typeof buildImport> }> {
  const data = await repo.load();
  const parsed = await processStatement(new TextEncoder().encode(text), parserId);
  const planned = await buildPlan({
    accountId,
    rows: parsed.rows,
    fileHash: parsed.fileHash,
    dataset: data,
  });
  if (!planned.ok) throw new Error(planned.issue);
  const built = buildImport({
    accountId,
    parserId,
    filename,
    fileHash: parsed.fileHash,
    rows: planned.plan.rows,
    dataset: data,
  });
  if (built.ok) await repo.save(built.changes);
  return { data: await repo.load(), summary: built };
}

describe('import di un estratto Revolut', () => {
  it('salva i movimenti completati, esclude quelli in sospeso e ricorda il formato', async () => {
    const { repo, accountId } = await setup();
    const { data, summary } = await importFile(repo, accountId, 'revolut', REVOLUT, 'rev.csv');
    expect(summary.ok).toBe(true);

    // 2 completati importati; il "in sospeso" è escluso di default
    expect(data.transactions.map((t) => t.amount_minor)).toEqual([-931, -931]);
    expect(data.transactions.every((t) => t.import_batch_id !== null)).toBe(true);
    expect(data.importBatches).toHaveLength(1);
    expect(data.importBatches[0]).toMatchObject({ filename: 'rev.csv', row_count: 2 });
    expect(data.meta[`import_format:${accountId}`]).toBe('revolut');
  });

  it('due righe identiche nello stesso estratto restano due movimenti, e il reimport non ne aggiunge', async () => {
    const { repo, accountId } = await setup();
    const sameDay = REVOLUT.replace(
      '2026-09-02 09:00:00,2026-09-02 09:00:05',
      '2026-09-01 10:00:00,2026-09-01 10:00:05',
    );
    const first = await importFile(repo, accountId, 'revolut', sameDay, 'a.csv');
    expect(first.data.transactions).toHaveLength(2); // stesso giorno, stesso importo, stessa descrizione

    const second = await importFile(repo, accountId, 'revolut', sameDay, 'a.csv');
    // Tutte duplicate: nessuna riga selezionata → il piano le esclude e il batch non ha righe nuove
    expect(second.data.transactions).toHaveLength(2);
  });

  it('un estratto che si sovrappone aggiunge solo le righe nuove', async () => {
    const { repo, accountId } = await setup();
    const [header, firstRow, secondRow] = REVOLUT.split('\n');
    await importFile(repo, accountId, 'revolut', [header, firstRow].join('\n'), 'mese-1.csv');
    const overlap = await importFile(
      repo,
      accountId,
      'revolut',
      [header, firstRow, secondRow].join('\n'),
      'mese-1-2.csv',
    );
    expect(overlap.data.transactions).toHaveLength(2);
  });
});

describe('import di un estratto Trade Republic', () => {
  it('registra interessi, acquisto e vendita; l’acquisto riduce il deposito e crea l’investimento', async () => {
    const { repo, accountId, requestCount } = await setup();
    const before = requestCount();
    const { data, summary } = await importFile(
      repo,
      accountId,
      'trade_republic',
      TRADE_REPUBLIC,
      'tr.csv',
    );
    expect(summary.ok).toBe(true);
    // lettura iniziale + parsing nel flusso + UNA sola scrittura + rilettura finale
    expect(requestCount() - before).toBe(3);

    // Interessi netti: 28,55 − 7,42 = 21,13 €
    const byDescription = (text: string) => data.transactions.find((t) => t.description === text);
    expect(byDescription('Interessi di prova')?.amount_minor).toBe(2113);

    // Acquisto: −100,00 € − 1,00 € di commissione = −101,00 € sul deposito
    const buy = data.transactions.find((t) => t.dedupe_hash === 'ext:tx-buy-1');
    expect(buy?.amount_minor).toBe(-10100);
    expect(buy?.transfer_group_id).not.toBeNull();
    const sell = data.transactions.find((t) => t.dedupe_hash === 'ext:tx-sell-1');
    expect(sell?.amount_minor).toBe(4100);

    expect(data.assets).toHaveLength(1);
    expect(data.assets[0]).toMatchObject({ isin: 'IE0000000001', asset_class: 'etf' });
    // Quote: 1,234567 − 0,5 = 0,734567 (decimali esatti)
    const asset = data.assets[0];
    expect(quantityAt(asset?.id ?? '', data.investmentTransactions, '2026-12-31')).toBe('0.734567');
  });

  it('reimportando lo stesso file non si crea nulla di nuovo (anche per gli acquisti)', async () => {
    const { repo, accountId } = await setup();
    await importFile(repo, accountId, 'trade_republic', TRADE_REPUBLIC, 'tr.csv');
    const again = await importFile(repo, accountId, 'trade_republic', TRADE_REPUBLIC, 'tr.csv');
    expect(again.data.transactions).toHaveLength(3);
    expect(again.data.investmentTransactions).toHaveLength(2);
    expect(again.data.assets).toHaveLength(1);
  });
});
