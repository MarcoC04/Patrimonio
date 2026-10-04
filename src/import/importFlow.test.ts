import { describe, expect, it } from 'vitest';
import type { Dataset } from '../data/repository';
import { ScriptClient } from '../data/scriptClient';
import { ScriptRepository } from '../data/scriptRepository';
import { createScript, TEST_SECRET } from '../data/testing/fakeAppsScript';
import { createAccount } from '../domain/accounts';
import { buildDefaultCategories } from '../domain/defaultCategories';
import { createTrade, quantityAt } from '../domain/investments';
import { buildImport, buildPlan } from './plan';
import { processStatement } from './process';
import type { ParserId } from './types';
import { buildUndo, undoKey } from './undo';

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

const REVOLUT_HEADER = REVOLUT.split(String.fromCharCode(10))[0] ?? '';
const joinLines = (...parts: string[]) => parts.join(String.fromCharCode(10));

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
  initialMinor: number | null = null,
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
    declaredMinor: planned.plan.endBalanceMinor,
    initialMinor,
    anchorDate: planned.plan.anchorDate,
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

const balanceOf = (data: Dataset, accountId: string) => {
  const account = data.accounts.find((a) => a.id === accountId);
  return (
    (account?.opening_balance_minor ?? 0) +
    data.transactions
      .filter((t) => t.account_id === accountId)
      .reduce((n, t) => n + t.amount_minor, 0)
  );
};

describe('saldo ricavato dagli estratti (Revolut)', () => {
  it('il saldo del conto diventa quello dell’estratto, senza averlo mai scritto', async () => {
    const { repo, accountId } = await setup(); // conto creato con saldo 0 e apertura 2026-01-01
    const { data } = await importFile(repo, accountId, 'revolut', REVOLUT, 'rev.csv');
    // Ultima riga completata: saldo 612,79 € (la riga in sospeso non conta)
    expect(balanceOf(data, accountId)).toBe(61279);
    // Saldo iniziale ricavato: 612,79 + 9,31 + 9,31 = 631,41 €
    expect(data.accounts[0]?.opening_balance_minor).toBe(63141);
    expect(data.meta[`balance_anchored:${accountId}`]).toBe('1');
  });

  it('un secondo estratto coerente aggiorna il saldo da solo', async () => {
    const { repo, accountId } = await setup();
    await importFile(repo, accountId, 'revolut', REVOLUT, 'settembre.csv');
    const next = [
      REVOLUT.split('\n')[0],
      // +50,00 € il 10/09 (saldo 662,79 €), −12,00 € il 12/09 (saldo 650,79 €)
      'Trasferimento,Attuale,2026-09-10 10:00:00,2026-09-10 10:00:05,Da Mario Rossi,50.00,0.00,EUR,COMPLETATO,662.79',
      'Pagamento con carta,Attuale,2026-09-12 10:00:00,2026-09-12 10:00:05,Negozio Due,-12.00,0.00,EUR,COMPLETATO,650.79',
    ].join('\n');
    const { data } = await importFile(repo, accountId, 'revolut', next, 'seconda-parte.csv');
    expect(balanceOf(data, accountId)).toBe(65079);
    // Il saldo iniziale non è cambiato: l'estratto era coerente
    expect(data.accounts[0]?.opening_balance_minor).toBe(63141);
  });

  it('un estratto di un periodo precedente non cambia il saldo attuale e non viene rifiutato', async () => {
    const { repo, accountId } = await setup(); // apertura 01/01/2026
    await importFile(repo, accountId, 'revolut', REVOLUT, 'settembre.csv');
    const older = joinLines(
      REVOLUT_HEADER,
      // dicembre 2025: +100,00 € il 20/12; saldo dopo = 631,41 € (quello da cui parte il 2026)
      'Trasferimento,Attuale,2025-12-20 10:00:00,2025-12-20 10:00:05,Da Mario Rossi,100.00,0.00,EUR,COMPLETATO,631.41',
    );
    const { data } = await importFile(repo, accountId, 'revolut', older, 'dicembre.csv');
    expect(data.transactions).toHaveLength(3);
    expect(data.accounts[0]?.opening_date).toBe('2025-12-20');
    // Nuovo saldo iniziale: 631,41 − 100,00 = 531,41 €; il saldo attuale resta 612,79 €
    expect(data.accounts[0]?.opening_balance_minor).toBe(53141);
    expect(balanceOf(data, accountId)).toBe(61279);
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

async function undoLatest(repo: ScriptRepository, batchIndex = -1) {
  const data = await repo.load();
  const batches = [...data.importBatches]
    .filter((b) => b.status === 'committed')
    .sort((a, b) => a.imported_at.localeCompare(b.imported_at));
  const batch = batches.at(batchIndex);
  if (!batch) throw new Error('nessun lotto');
  const built = buildUndo(data, batch.id);
  if (built.ok) await repo.save(built.changes);
  return { built, data: await repo.load(), batchId: batch.id };
}

describe('annulla importazione', () => {
  it('Revolut: toglie i movimenti e riporta il conto com’era; il file si può reimportare', async () => {
    const { repo, accountId } = await setup();
    await importFile(repo, accountId, 'revolut', REVOLUT, 'rev.csv');
    const { built, data } = await undoLatest(repo);

    expect(built.ok && built.summary).toMatchObject({
      transactions: 2,
      accountRestored: true,
      noRecord: false,
    });
    expect(data.transactions).toHaveLength(0);
    expect(data.accounts[0]).toMatchObject({
      opening_balance_minor: 0,
      opening_date: '2026-01-01',
    });
    expect(data.meta[`balance_anchored:${accountId}`]).toBe('0');
    expect(data.importBatches[0]?.status).toBe('discarded');

    // dopo l'annullo lo stesso file non risulta più importato e si può riportare dentro
    const again = await importFile(repo, accountId, 'revolut', REVOLUT, 'rev.csv');
    expect(again.data.transactions).toHaveLength(2);
    expect(balanceOf(again.data, accountId)).toBe(61279);
  });

  it('riporta indietro anche l’apertura retrodatata', async () => {
    const { repo, accountId } = await setup(); // apertura 01/01/2026
    const early = joinLines(
      REVOLUT_HEADER,
      'Trasferimento,Attuale,2025-12-20 10:00:00,2025-12-20 10:00:05,Da Mario Rossi,100.00,0.00,EUR,COMPLETATO,100.00',
    );
    await importFile(repo, accountId, 'revolut', early, 'dic.csv');
    expect((await repo.load()).accounts[0]?.opening_date).toBe('2025-12-20');
    const { data } = await undoLatest(repo);
    expect(data.accounts[0]).toMatchObject({
      opening_date: '2026-01-01',
      opening_balance_minor: 0,
    });
  });

  it('Trade Republic: tolgono anche operazioni di investimento e asset creati dall’import', async () => {
    const { repo, accountId } = await setup();
    await importFile(repo, accountId, 'trade_republic', TRADE_REPUBLIC, 'tr.csv');
    const { built, data } = await undoLatest(repo);
    expect(built.ok && built.summary).toMatchObject({
      transactions: 3,
      operations: 2,
      assets: 1,
    });
    expect(data.transactions).toHaveLength(0);
    expect(data.investmentTransactions).toHaveLength(0);
    expect(data.assets).toHaveLength(0);
  });

  it('un asset che ha altre operazioni non viene eliminato', async () => {
    const { repo, accountId } = await setup();
    await importFile(repo, accountId, 'trade_republic', TRADE_REPUBLIC, 'tr.csv');
    const before = await repo.load();
    const asset = before.assets[0];
    if (!asset) throw new Error('asset mancante');
    // acquisto manuale successivo: non appartiene a nessun lotto
    const manual = createTrade(
      {
        assetId: asset.id,
        type: 'buy',
        date: '2026-09-20',
        quantityText: '1',
        unitPriceText: '80',
        feesText: '',
        accountId: null,
      },
      {
        assets: before.assets,
        operations: before.investmentTransactions,
        accounts: before.accounts,
      },
    );
    if (!manual.ok) throw new Error('acquisto manuale non valido');
    await repo.save({ investmentTransactions: { insert: [manual.value] } });
    const result = await undoLatest(repo);
    expect(result.built.ok && result.built.summary.assets).toBe(0);
    expect(result.data.assets).toHaveLength(1);
    expect(result.data.investmentTransactions).toHaveLength(1); // resta solo l'acquisto manuale
  });

  it('una vendita manuale successiva, senza le quote importate, blocca l’annullo', async () => {
    const { repo, accountId } = await setup();
    // solo l'acquisto del file (intestazione + interessi + acquisto)
    const buyOnly = TRADE_REPUBLIC.split(String.fromCharCode(10))
      .slice(0, 3)
      .join(String.fromCharCode(10));
    await importFile(repo, accountId, 'trade_republic', buyOnly, 'tr-acquisto.csv');
    const data = await repo.load();
    const asset = data.assets[0];
    if (!asset) throw new Error('asset mancante');
    const sell = createTrade(
      {
        assetId: asset.id,
        type: 'sell',
        date: '2026-09-25',
        quantityText: '1',
        unitPriceText: '80',
        feesText: '',
        accountId: null,
      },
      { assets: data.assets, operations: data.investmentTransactions, accounts: data.accounts },
    );
    if (!sell.ok) throw new Error('vendita manuale non valida');
    await repo.save({ investmentTransactions: { insert: [sell.value] } });
    const { built } = await undoLatest(repo);
    expect(built).toEqual({ ok: false, issue: 'holdings' });
  });

  it('solo l’ultima importazione di un conto ripristina il saldo: prima le più recenti', async () => {
    const { repo, accountId } = await setup();
    await importFile(repo, accountId, 'revolut', REVOLUT, 'settembre.csv');
    const next = joinLines(
      REVOLUT_HEADER,
      'Trasferimento,Attuale,2026-09-10 10:00:00,2026-09-10 10:00:05,Da Mario Rossi,50.00,0.00,EUR,COMPLETATO,662.79',
    );
    await importFile(repo, accountId, 'revolut', next, 'seconda.csv');

    const first = await undoLatest(repo, 0); // la più vecchia
    expect(first.built).toEqual({ ok: false, issue: 'not_latest' });

    const second = await undoLatest(repo, -1); // la più recente
    expect(second.built.ok).toBe(true);
    expect(balanceOf(second.data, accountId)).toBe(61279); // come dopo il primo import

    const third = await undoLatest(repo, -1); // ora è lei l'ultima
    expect(third.built.ok).toBe(true);
    expect(third.data.transactions).toHaveLength(0);
    expect(third.data.accounts[0]?.opening_balance_minor).toBe(0);
  });

  it('un import senza stato registrato (fatto prima di questa funzione) toglie i movimenti ma non tocca il conto', async () => {
    const { repo, accountId } = await setup();
    await importFile(repo, accountId, 'revolut', REVOLUT, 'rev.csv');
    let data = await repo.load();
    const batchId = data.importBatches[0]?.id ?? '';
    await repo.save({ meta: { [undoKey(batchId)]: '' } }); // come se non fosse mai stato scritto
    data = await repo.load();
    const built = buildUndo(data, batchId);
    if (!built.ok) throw new Error('annullo non riuscito');
    expect(built.summary).toMatchObject({
      transactions: 2,
      accountRestored: false,
      noRecord: true,
    });
    await repo.save(built.changes);
    data = await repo.load();
    expect(data.transactions).toHaveLength(0);
    expect(data.accounts[0]?.opening_balance_minor).toBe(63141); // invariato: da controllare a mano
  });

  it('non si annulla due volte la stessa importazione', async () => {
    const { repo, accountId } = await setup();
    await importFile(repo, accountId, 'revolut', REVOLUT, 'rev.csv');
    const { batchId } = await undoLatest(repo);
    expect(buildUndo(await repo.load(), batchId)).toEqual({ ok: false, issue: 'not_found' });
  });
});

describe('Trade Republic: saldo iniziale scritto dall’utente', () => {
  it('parte dal saldo iniziale, somma i movimenti e il saldo prosegue da solo', async () => {
    const { repo, accountId } = await setup();
    // Saldo iniziale 1.000,00 €. Movimenti del file: interessi +21,13, acquisto −101,00,
    // vendita +41,00 → netto −38,87 → saldo finale 961,13 €
    const { data } = await importFile(
      repo,
      accountId,
      'trade_republic',
      TRADE_REPUBLIC,
      'tr.csv',
      100000,
    );
    expect(data.accounts[0]?.opening_balance_minor).toBe(100000);
    expect(balanceOf(data, accountId)).toBe(96113);
    expect(data.meta[`balance_anchored:${accountId}`]).toBe('1');

    // Mese dopo, senza scrivere nessun saldo: +50,00 € di interessi → 1.011,13 €
    const next = joinLines(
      TR_HEADER,
      trRow({
        date: '2026-10-01',
        category: 'CASH',
        type: 'INTEREST_PAYMENT',
        amount: '50.00',
        currency: 'EUR',
        description: 'Interessi di prova',
        transaction_id: 'tx-int-2',
      }),
    );
    const second = await importFile(repo, accountId, 'trade_republic', next, 'tr-ottobre.csv');
    expect(balanceOf(second.data, accountId)).toBe(101113);
    expect(second.data.accounts[0]?.opening_balance_minor).toBe(100000); // invariato
  });

  it('annullare l’import riporta il conto al saldo precedente', async () => {
    const { repo, accountId } = await setup();
    await importFile(repo, accountId, 'trade_republic', TRADE_REPUBLIC, 'tr.csv', 100000);
    const { data } = await undoLatest(repo);
    expect(data.accounts[0]?.opening_balance_minor).toBe(0);
    expect(data.transactions).toHaveLength(0);
  });
});
