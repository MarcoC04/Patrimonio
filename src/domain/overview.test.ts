import { describe, expect, it } from 'vitest';
import type { Account, Asset, InvestmentTransaction, PricePoint } from '../data/schema';
import {
  changeOf,
  earliestDate,
  flowSummary,
  monthComparison,
  monthlyFlowRange,
  portfolioForAccounts,
  sampleDates,
  selectAccounts,
  topMerchants,
  uncategorizedCount,
  wealthByAccount,
  wealthSeries,
} from './overview';

const STAMP = '2026-01-01T00:00:00.000Z';

const account = (id: string, type: Account['type'], opening: number): Account => ({
  id,
  created_at: STAMP,
  updated_at: STAMP,
  deleted: false,
  name: `Conto ${id}`,
  institution: '',
  type,
  currency: 'EUR',
  opening_balance_minor: opening,
  opening_date: '2026-01-01',
  is_archived: false,
});

let n = 0;
const tx = (
  accountId: string,
  date: string,
  amount: number,
  description = 'Movimento',
  category: string | null = 'cat',
  transfer: string | null = null,
) => ({
  account_id: accountId,
  date,
  description,
  amount_minor: amount,
  amount_base_minor: amount,
  category_id: category,
  transfer_group_id: transfer,
  id: `t${++n}`,
});

const EMPTY = { assets: [], operations: [], prices: [] };

describe('selectAccounts e portfolioForAccounts', () => {
  const accounts = [account('A', 'checking', 0), account('B', 'savings', 0)];

  it('nessuna scelta = tutti i conti', () => {
    expect(selectAccounts(accounts, []).map((a) => a.id)).toEqual(['A', 'B']);
    expect(selectAccounts(accounts, ['B']).map((a) => a.id)).toEqual(['B']);
  });

  it('gli investimenti seguono il conto in cui sono detenuti', () => {
    const op = (id: string, accountId: string | null): InvestmentTransaction => ({
      id,
      created_at: STAMP,
      updated_at: STAMP,
      deleted: false,
      account_id: accountId,
      asset_id: 'x',
      type: 'buy',
      date: '2026-02-01',
      quantity: '1',
      unit_price: '10',
      fees_minor: 0,
      currency: 'EUR',
      fx_rate: '1',
      amount_base_minor: 1000,
    });
    const portfolio = {
      assets: [],
      prices: [],
      operations: [op('1', 'A'), op('2', 'B'), op('3', null)],
    };
    expect(portfolioForAccounts(portfolio, []).operations).toHaveLength(3);
    expect(portfolioForAccounts(portfolio, ['B']).operations.map((o) => o.id)).toEqual(['2']);
    // le operazioni senza conto compaiono solo quando non si filtra
    expect(portfolioForAccounts(portfolio, ['A', 'B']).operations.map((o) => o.id)).toEqual([
      '1',
      '2',
    ]);
  });
});

describe('earliestDate', () => {
  it('la data più antica tra aperture e movimenti', () => {
    expect(
      earliestDate(
        [{ opening_date: '2026-03-01' }],
        [{ date: '2026-02-10' }, { date: '2026-05-01' }],
      ),
    ).toBe('2026-02-10');
    expect(earliestDate([], [])).toBeNull();
  });
});

describe('sampleDates', () => {
  it('fino a 40 giorni: un punto al giorno', () => {
    const dates = sampleDates('2026-09-01', '2026-09-10');
    expect(dates).toHaveLength(10);
    expect(dates[0]).toBe('2026-09-01');
    expect(dates[9]).toBe('2026-09-10');
  });

  it('circa 3 mesi: ogni 7 giorni e sempre l’ultimo giorno', () => {
    // dal 08/07 al 06/10 = 90 giorni: 0, 7, …, 84 → 13 punti, più il 06/10 → 14
    const dates = sampleDates('2026-07-08', '2026-10-06');
    expect(dates).toHaveLength(14);
    expect(dates[1]).toBe('2026-07-15');
    expect(dates[13]).toBe('2026-10-06');
  });

  it('oltre i 6 mesi: a fine mese, con il primo giorno e oggi', () => {
    // 15/01 → 05/10: 15/01, fine mese da gennaio a settembre (9), 05/10 → 11 punti
    const dates = sampleDates('2026-01-15', '2026-10-05');
    expect(dates).toHaveLength(11);
    expect(dates.slice(0, 3)).toEqual(['2026-01-15', '2026-01-31', '2026-02-28']);
    expect(dates[9]).toBe('2026-09-30');
    expect(dates[10]).toBe('2026-10-05');
  });

  it('se la fine coincide con la fine del mese non si duplica', () => {
    const dates = sampleDates('2026-01-01', '2026-09-30');
    expect(dates[dates.length - 1]).toBe('2026-09-30');
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('inizio dopo la fine: solo la fine', () => {
    expect(sampleDates('2026-10-05', '2026-10-01')).toEqual(['2026-10-01']);
  });
});

describe('changeOf', () => {
  it('+500 su 1.000 = +50,0 %', () => {
    expect(changeOf(1500, 1000)).toEqual({ deltaMinor: 500, tenthsPercent: 500 });
  });
  it('calo: 900 su 1.000 = −10,0 %', () => {
    expect(changeOf(900, 1000)).toEqual({ deltaMinor: -100, tenthsPercent: -100 });
  });
  it('partenza da zero: nessuna percentuale', () => {
    expect(changeOf(500, 0)).toEqual({ deltaMinor: 500, tenthsPercent: null });
  });
  it('partenza negativa: la percentuale è rispetto al valore assoluto', () => {
    // da −1.000 a −500: migliorato di 500 → +50,0 %
    expect(changeOf(-500, -1000)).toEqual({ deltaMinor: 500, tenthsPercent: 500 });
  });
});

describe('wealthByAccount e wealthSeries', () => {
  const accounts = [
    account('A', 'checking', 100000),
    account('B', 'savings', 50000),
    account('C', 'checking', -30000), // in rosso: non è un'attività
  ];
  const transactions = [tx('A', '2026-06-10', -20000)];

  it('un pezzo per conto con saldo positivo, dal più grande', () => {
    // A: 1.000,00 − 200,00 = 800,00; B: 500,00; C escluso
    const result = wealthByAccount(accounts, transactions, EMPTY, '2026-07-01');
    expect(result.slices).toEqual([
      { accountId: 'A', amountMinor: 80000 },
      { accountId: 'B', amountMinor: 50000 },
    ]);
    expect(result.totalMinor).toBe(130000);
  });

  it('aggiunge gli investimenti con il valore attuale (quantità × ultimo prezzo)', () => {
    const asset: Asset = {
      id: 'etf',
      created_at: STAMP,
      updated_at: STAMP,
      deleted: false,
      name: 'ETF di prova',
      symbol: '',
      isin: '',
      asset_class: 'etf',
      currency: 'EUR',
      price_source: 'manual',
    };
    const buy: InvestmentTransaction = {
      id: 'op',
      created_at: STAMP,
      updated_at: STAMP,
      deleted: false,
      account_id: 'B',
      asset_id: 'etf',
      type: 'buy',
      date: '2026-02-01',
      quantity: '2.5',
      unit_price: '10',
      fees_minor: 0,
      currency: 'EUR',
      fx_rate: '1',
      amount_base_minor: 2500,
    };
    const price: PricePoint = {
      id: 'p',
      created_at: STAMP,
      updated_at: STAMP,
      deleted: false,
      asset_id: 'etf',
      date: '2026-06-01',
      price: '12',
      currency: 'EUR',
      source: 'manual',
    };
    // 2,5 quote × 12,00 € = 30,00 €
    const result = wealthByAccount(
      accounts,
      transactions,
      { assets: [asset], operations: [buy], prices: [price] },
      '2026-07-01',
    );
    expect(result.slices.at(-1)).toEqual({ accountId: null, amountMinor: 3000 });
    expect(result.totalMinor).toBe(133000);
  });

  it('serie: stesso conto a due date, prima e dopo una spesa', () => {
    const { points } = wealthSeries([accounts[0] as Account], transactions, EMPTY, [
      '2026-06-01',
      '2026-07-01',
    ]);
    expect(points.map((p) => p.totalMinor)).toEqual([100000, 80000]);
    expect(points.map((p) => p.investmentsMinor)).toEqual([0, 0]);
  });
});

describe('flowSummary', () => {
  const txs = [
    tx('A', '2026-09-05', 200000, 'Stipendio'),
    tx('A', '2026-09-10', -30000, 'Affitto'),
    tx('A', '2026-09-20', -15000, 'Spesa'),
    tx('A', '2026-09-25', -50000, 'Bonifico a deposito', 'transfer', 'g1'), // giroconto: escluso
    tx('B', '2026-09-12', -5000, 'Altro conto'),
  ];
  const sept = { from: '2026-09-01', to: '2026-09-30' };

  it('entrate, spese, risparmio e tasso (giroconti esclusi)', () => {
    // Entrate 2.000,00; spese 300 + 150 + 50 = 500,00; risparmio 1.500,00 = 75,0 % delle entrate
    expect(flowSummary(txs, sept, [])).toEqual({
      incomeMinor: 200000,
      expenseMinor: 50000,
      savingsMinor: 150000,
      savingsRateTenths: 750,
      avgMonthlyExpenseMinor: 50000, // un mese
    });
  });

  it('solo i conti scelti', () => {
    // Conto B: nessuna entrata, spese 50,00; tasso non calcolabile
    expect(flowSummary(txs, sept, ['B'])).toMatchObject({
      incomeMinor: 0,
      expenseMinor: 5000,
      savingsMinor: -5000,
      savingsRateTenths: null,
    });
  });

  it('spesa media mensile su tre mesi: 500,00 / 3 = 166,67', () => {
    const result = flowSummary(txs, { from: '2026-07-01', to: '2026-09-30' }, []);
    expect(result.avgMonthlyExpenseMinor).toBe(16667);
  });

  it('il periodo esclude i movimenti fuori dalle date (estremi inclusi)', () => {
    expect(flowSummary(txs, { from: '2026-09-10', to: '2026-09-20' }, []).expenseMinor).toBe(
      50000 - 0 - 0,
    );
    expect(flowSummary(txs, { from: '2026-09-11', to: '2026-09-19' }, []).expenseMinor).toBe(5000);
  });

  it('senza inizio (Max) i mesi si contano dal primo movimento', () => {
    // dal 05/09 al 30/09: 26 giorni → 1 mese
    expect(flowSummary(txs, { from: null, to: '2026-09-30' }, []).avgMonthlyExpenseMinor).toBe(
      50000,
    );
  });
});

describe('monthlyFlowRange', () => {
  it('un elemento per mese, con i movimenti tagliati sul periodo', () => {
    const txs = [
      tx('A', '2026-08-10', -1000), // prima del 15/08: fuori
      tx('A', '2026-08-20', -2000),
      tx('A', '2026-09-05', 300000),
      tx('A', '2026-09-06', -4000),
    ];
    expect(monthlyFlowRange(txs, { from: '2026-08-15', to: '2026-10-05' }, [])).toEqual([
      { month: '2026-08', incomeMinor: 0, expenseMinor: 2000 },
      { month: '2026-09', incomeMinor: 300000, expenseMinor: 4000 },
      { month: '2026-10', incomeMinor: 0, expenseMinor: 0 },
    ]);
  });

  it('senza movimenti e senza inizio non ci sono mesi', () => {
    expect(monthlyFlowRange([], { from: null, to: '2026-10-05' }, [])).toEqual([]);
  });
});

describe('topMerchants', () => {
  const txs = [
    tx('A', '2026-09-01', -5000, 'Esselunga'),
    tx('A', '2026-09-08', -3000, 'ESSELUNGA'),
    tx('A', '2026-09-09', -1299, 'Netflix'),
    tx('A', '2026-09-10', 200000, 'Stipendio'), // entrata: esclusa
    tx('A', '2026-09-11', -9000, 'Bonifico a Trade Republic', 'transfer', 'g'), // giroconto: escluso
  ];
  const range = { from: '2026-09-01', to: '2026-09-30' };

  it('raggruppa per esercente e ordina per spesa', () => {
    // Esselunga 50,00 + 30,00 = 80,00 (2 volte); Netflix 12,99
    expect(topMerchants(txs, range, [], 5)).toEqual([
      { key: 'esselunga', name: 'Esselunga', amountMinor: 8000, count: 2 },
      { key: 'netflix', name: 'Netflix', amountMinor: 1299, count: 1 },
    ]);
  });

  it('rispetta il limite', () => {
    expect(topMerchants(txs, range, [], 1)).toHaveLength(1);
  });
});

describe('uncategorizedCount', () => {
  it('conta i movimenti senza categoria, non i giroconti', () => {
    const txs = [
      tx('A', '2026-09-01', -100, 'a', null),
      tx('A', '2026-09-02', -100, 'b', null),
      tx('A', '2026-09-03', -100, 'c', 'cat'),
      tx('A', '2026-09-04', -100, 'd', null, 'g'), // giroconto
      tx('A', '2026-08-31', -100, 'e', null), // fuori periodo
    ];
    expect(uncategorizedCount(txs, { from: '2026-09-01', to: '2026-09-30' }, [])).toBe(2);
  });
});

describe('monthComparison', () => {
  it('mese in corso fino a oggi, mese scorso a parità di giorni e intero', () => {
    const txs = [
      tx('A', '2026-10-03', -10000),
      tx('A', '2026-10-15', -5000),
      tx('A', '2026-09-02', -8000),
      tx('A', '2026-09-15', -2000),
      tx('A', '2026-09-20', -4000), // dopo il giorno 15: solo nel mese intero
      tx('A', '2026-10-10', 500000), // entrata: non conta
    ];
    expect(monthComparison(txs, '2026-10-15', [])).toEqual({
      currentMinor: 15000,
      previousToDateMinor: 10000,
      previousFullMinor: 14000,
    });
  });
});
