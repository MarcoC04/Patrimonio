import { describe, expect, it } from 'vitest';
import { applyChanges } from '../../data/dataset';
import type { Dataset } from '../../data/repository';
import type { Account } from '../../data/schema';
import { buildDefaultCategories } from '../../domain/defaultCategories';
import { totalsMinor } from '../../domain/ledger';
import { parseCsv } from '../csv';
import { buildImport, buildPlan } from '../plan';
import { tradeRepublicParser } from './tradeRepublic';

/**
 * Valori di `category`/`type` del CSV di Trade Republic, ricavati da progetti pubblici che
 * leggono lo stesso file (Wealthfolio importer, tr-portfolio-visualizer). Dati inventati.
 */
const HEADER =
  'datetime,"date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"';

function csv(...rows: Record<string, string>[]): string[][] {
  const columns = HEADER.replaceAll('"', '').split(',');
  const lines = rows.map((fields) => columns.map((name) => `"${fields[name] ?? ''}"`).join(','));
  return parseCsv([HEADER, ...lines].join(String.fromCharCode(10)), undefined, true);
}

const row = (category: string, type: string, extra: Record<string, string> = {}) => ({
  date: '2026-09-05',
  category,
  type,
  amount: '100.00',
  currency: 'EUR',
  transaction_id: `tx-${type}`,
  ...extra,
});

const parse = (category: string, type: string, extra: Record<string, string> = {}) => {
  const result = tradeRepublicParser.parse(csv(row(category, type, extra)));
  const parsed = result.rows[0];
  if (!parsed) throw new Error('riga non letta');
  return parsed;
};

describe('Trade Republic: tipi di movimento', () => {
  it.each([
    'CUSTOMER_INBOUND',
    'CUSTOMER_INPAYMENT',
    'CUSTOMER_OUTBOUND_REQUEST',
    'TRANSFER_INBOUND',
    'TRANSFER_INSTANT_INBOUND',
    'TRANSFER_DIRECT_DEBIT_INBOUND',
    'TRANSFER_OUTBOUND',
    'TRANSFER_INSTANT_OUTBOUND',
  ])('%s è un giroconto (non un’entrata o una spesa)', (type) => {
    const parsed = parse('CASH', type);
    expect(parsed.transfer).toBe(true);
    expect(parsed.warnings).toEqual([]); // pulita: si importa senza controlli
  });

  it.each([
    'INTEREST_PAYMENT',
    'DIVIDEND',
    'BENEFITS_SAVEBACK',
    'CARD_TRANSACTION',
    'CARD_TRANSACTION_INTERNATIONAL',
    'CARD_ORDERING_FEE',
    'MANUAL_CASH_TRANSFER',
  ])('%s è un normale movimento di liquidità', (type) => {
    const parsed = parse('CASH', type);
    expect(parsed.transfer).toBe(false);
    expect(parsed.warnings).toEqual([]);
  });

  it('STOCKPERK (CASH) e MIGRATION (DELIVERY) sono solo informative: escluse e segnalate', () => {
    expect(parse('CASH', 'STOCKPERK').warnings).toEqual(['informational']);
    expect(parse('DELIVERY', 'MIGRATION', { amount: '' }).warnings).toEqual(['informational']);
  });

  it('DELIVERY/FREE_RECEIPT (azioni regalate) resta "tipo non riconosciuto": nessun denaro, da controllare', () => {
    expect(parse('DELIVERY', 'FREE_RECEIPT', { amount: '' }).warnings).toContain('unknown_type');
  });
});

describe('giroconti importati da Trade Republic', () => {
  const account: Account = {
    id: 'acc-tr',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted: false,
    name: 'Deposito di prova',
    institution: '',
    type: 'savings',
    currency: 'EUR',
    opening_balance_minor: 0,
    opening_date: '2026-01-01',
    is_archived: false,
  };
  const dataset: Dataset = {
    accounts: [account],
    categories: buildDefaultCategories(),
    transactions: [],
    fxRates: [],
    assets: [],
    investmentTransactions: [],
    priceHistory: [],
    importBatches: [],
    categorizationRules: [],
    meta: {},
  };

  it('il bonifico in entrata sul deposito non gonfia le entrate, ma aumenta il saldo', async () => {
    const parsed = tradeRepublicParser.parse(
      csv(
        row('CASH', 'CUSTOMER_INPAYMENT', { amount: '500.00' }),
        row('CASH', 'INTEREST_PAYMENT', { amount: '10.00', transaction_id: 'tx-int' }),
      ),
    );
    const planned = await buildPlan({
      accountId: 'acc-tr',
      rows: parsed.rows,
      fileHash: 'h',
      dataset,
    });
    if (!planned.ok) throw new Error(planned.issue);
    const transferCategory = dataset.categories.find((c) => c.kind === 'transfer');
    expect(planned.plan.rows[0]).toMatchObject({
      transfer: true,
      categoryId: transferCategory?.id,
      include: true,
    });

    const built = buildImport({
      accountId: 'acc-tr',
      parserId: 'trade_republic',
      filename: 'tr.csv',
      fileHash: 'h',
      rows: planned.plan.rows,
      dataset,
      initialMinor: 0,
    });
    if (!built.ok) throw new Error('import non riuscito');
    const after = applyChanges(dataset, built.changes);

    const deposit = after.transactions.find((t) => t.dedupe_hash === 'ext:tx-CUSTOMER_INPAYMENT');
    expect(deposit?.transfer_group_id).toBeTruthy();
    expect(deposit?.category_id).toBe(transferCategory?.id);

    // Nei totali conta solo l'interesse: 10,00 € di entrate (i 500,00 € del bonifico no)
    expect(totalsMinor(after.transactions).incomeMinor).toBe(1000);
    // Il saldo invece sale di entrambi: 500,00 + 10,00
    const balance = after.transactions.reduce((n, t) => n + t.amount_minor, 0);
    expect(balance).toBe(51000);
  });
});
