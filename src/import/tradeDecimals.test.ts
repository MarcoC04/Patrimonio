import { describe, expect, it } from 'vitest';
import type { Dataset } from '../data/repository';
import type { Account } from '../data/schema';
import { buildDefaultCategories } from '../domain/defaultCategories';
import { buildImport, buildPlan } from './plan';
import type { ImportedRow } from './types';

/**
 * Prezzi e quantità con esattamente tre decimali ("112.345", "1.234") sembrano numeri con il
 * separatore delle migliaia: la lettura per l'utente li rifiuta di proposito. Nell'import i
 * valori arrivano già in formato tecnico (punto decimale) e non devono mai essere rifiutati.
 */

const STAMP = '2026-01-01T00:00:00.000Z';
const NOW = new Date('2026-10-04T10:00:00.000Z');
let n = 0;
const newId = () => `d-${++n}`;

const account: Account = {
  id: 'acc-tr',
  created_at: STAMP,
  updated_at: STAMP,
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
  categories: buildDefaultCategories(NOW, newId),
  transactions: [],
  fxRates: [],
  assets: [],
  investmentTransactions: [],
  priceHistory: [],
  importBatches: [],
  categorizationRules: [],
  meta: {},
};

const buy = (
  quantity: string,
  unitPrice: string,
  amountMinor: number,
  id: string,
): ImportedRow => ({
  line: 2,
  date: '2026-09-02',
  amountMinor,
  currency: 'EUR',
  description: 'Acquisto ETF MSCI World finto',
  rawDescription: '',
  externalId: id,
  trade: {
    type: 'buy',
    name: 'ETF MSCI World finto',
    symbol: 'IE00TEST0001',
    assetClass: 'FUND',
    quantity,
    unitPrice,
    feeMinor: 100,
  },
  balanceMinor: null,
  warnings: [],
});

async function importRows(rows: ImportedRow[]) {
  const planned = await buildPlan({ accountId: 'acc-tr', rows, fileHash: 'h', dataset });
  if (!planned.ok) throw new Error(planned.issue);
  return buildImport(
    {
      accountId: 'acc-tr',
      parserId: 'trade_republic',
      filename: 'tr.csv',
      fileHash: 'h',
      rows: planned.plan.rows,
      dataset,
    },
    NOW,
    newId,
  );
}

describe('import di acquisti con tre decimali', () => {
  it('prezzo 112.345 e quantità 1.234 non sono più rifiutati', async () => {
    // 1,234 quote × 112,345 € = 138,63373 € → 138,63 €; + 1,00 € di commissione = 139,63 €
    const built = await importRows([buy('1.234', '112.345', -13963, 'tx-1')]);
    if (!built.ok) throw new Error(`import rifiutato: ${JSON.stringify(built.rowIssues)}`);
    const op = built.changes.investmentTransactions?.insert?.[0];
    expect(op).toMatchObject({
      quantity: '1.234', // esatto, non 1234
      unit_price: '112.345', // esatto, non 112345
      fees_minor: 100,
      amount_base_minor: 13963,
    });
  });

  it('i valori restano esatti con qualsiasi numero di decimali', async () => {
    const built = await importRows([
      buy('0.5', '99.9', -5095, 'tx-a'), // 0,5 × 99,9 = 49,95 + 1,00 = 50,95
      buy('2', '1234.5678', -246914, 'tx-b'), // 2 × 1234,5678 = 2469,1356 → 2469,14 + 1,00 = 2470,14
      buy('12.345', '10.5', -13062, 'tx-c'), // 12,345 × 10,5 = 129,6225 → 129,62 + 1,00 = 130,62
    ]);
    if (!built.ok) throw new Error(`import rifiutato: ${JSON.stringify(built.rowIssues)}`);
    const ops = built.changes.investmentTransactions?.insert ?? [];
    expect(ops.map((o) => [o.quantity, o.unit_price])).toEqual([
      ['0.5', '99.9'],
      ['2', '1234.5678'],
      ['12.345', '10.5'],
    ]);
    expect(ops.map((o) => o.amount_base_minor)).toEqual([5095, 247014, 13062]);
  });
});
