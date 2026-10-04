import { describe, expect, it } from 'vitest';
import type { Asset, InvestmentTransaction, PricePoint } from '../data/schema';
import { netWorthYearSeries, wealthAt, wealthByKind } from './dashboard';
import type { Portfolio } from './investments';

// Dati sintetici inventati. Importi in centesimi.
const TS = '2026-01-02T03:04:05.000Z';

const account = (
  id: string,
  opening: number,
  type: 'checking' | 'savings' | 'cash' | 'brokerage' = 'checking',
) => ({
  id,
  opening_balance_minor: opening,
  opening_date: '2026-01-01',
  type,
  currency: 'EUR',
});

const asset = (id: string, currency = 'EUR'): Asset => ({
  id,
  created_at: TS,
  updated_at: TS,
  deleted: false,
  name: id,
  symbol: '',
  isin: '',
  asset_class: 'etf',
  currency,
  price_source: 'manual',
});

const buy = (
  asset_id: string,
  date: string,
  quantity: string,
  unit_price: string,
): InvestmentTransaction => ({
  id: `op-${asset_id}-${date}`,
  created_at: TS,
  updated_at: TS,
  deleted: false,
  account_id: null,
  asset_id,
  type: 'buy',
  date,
  quantity,
  unit_price,
  fees_minor: 0,
  currency: 'EUR',
  fx_rate: '1',
  amount_base_minor: 0,
});

const price = (asset_id: string, date: string, value: string): PricePoint => ({
  id: `p-${asset_id}-${date}`,
  created_at: TS,
  updated_at: TS,
  deleted: false,
  asset_id,
  date,
  price: value,
  currency: 'EUR',
  source: 'manual',
});

const empty: Portfolio = { assets: [], operations: [], prices: [] };

describe('wealthAt: conti + investimenti', () => {
  const accounts = [
    account('C', 100000), // conto corrente 1.000,00 €
    account('S', 50000, 'savings'), // conto deposito 500,00 €
    account('B', 20000, 'brokerage'), // liquidità del conto di investimento 200,00 €
  ];
  // 10 quote comprate il 10/02 a 12,50 €; il 5/03 il prezzo è 14,00 €
  const portfolio: Portfolio = {
    assets: [asset('A')],
    operations: [buy('A', '2026-02-10', '10', '12.5')],
    prices: [price('A', '2026-03-05', '14')],
  };

  it('patrimonio = 1.700,00 € di conti + 140,00 € di investimenti (10 × 14,00) = 1.840,00 €', () => {
    expect(wealthAt(accounts, [], portfolio, '2026-03-20', {})).toEqual({
      accountsMinor: 170000,
      investmentsMinor: 14000,
      totalMinor: 184000,
      missing: [],
      unpriced: [],
    });
  });

  it('prima dell’acquisto gli investimenti non contano', () => {
    const wealth = wealthAt(accounts, [], portfolio, '2026-02-09', {});
    expect(wealth.investmentsMinor).toBe(0);
    expect(wealth.totalMinor).toBe(170000);
  });

  it('senza investimenti il patrimonio coincide con quello dei conti', () => {
    expect(wealthAt(accounts, [], empty, '2026-03-20', {}).totalMinor).toBe(170000);
  });

  it('cambio o prezzo mancanti: la posizione è esclusa e segnalata, non inventata', () => {
    const withMissing: Portfolio = {
      assets: [asset('A'), asset('U', 'USD'), asset('N')],
      operations: [
        buy('A', '2026-02-10', '10', '12.5'),
        buy('U', '2026-02-10', '10', '12.5'), // in USD, senza cambio
        buy('N', '2026-02-10', '3', '0'), // senza alcun prezzo
      ],
      prices: [],
    };
    expect(wealthAt(accounts, [], withMissing, '2026-03-20', {})).toEqual({
      accountsMinor: 170000,
      investmentsMinor: 12500, // solo l'asset in EUR: 10 × 12,50
      totalMinor: 182500,
      missing: ['USD'],
      unpriced: ['N'],
    });
  });

  it('con il cambio, un asset in dollari entra nel patrimonio: 125,00 USD a 1,25 = 100,00 €', () => {
    const usd: Portfolio = {
      assets: [asset('U', 'USD')],
      operations: [buy('U', '2026-02-10', '10', '12.5')],
      prices: [],
    };
    expect(wealthAt([], [], usd, '2026-03-20', { USD: '1.25' }).investmentsMinor).toBe(10000);
  });
});

describe('netWorthYearSeries con gli investimenti', () => {
  const now = new Date(2026, 2, 20);

  it('ogni fine mese vale conti + investimenti con l’ultimo prezzo noto a quella data', () => {
    const portfolio: Portfolio = {
      assets: [asset('A')],
      operations: [buy('A', '2026-02-10', '10', '12.5')],
      prices: [price('A', '2026-03-05', '14')],
    };
    const { points, missing, unpriced } = netWorthYearSeries(
      [account('C', 100000)],
      [],
      2026,
      {},
      now,
      portfolio,
    );
    expect(points.map((p) => p.balanceMinor)).toEqual([
      100000, // 31/01: l'acquisto è del 10/02
      112500, // 28/02: 1.000 + 10 × 12,50 (prezzo dell'acquisto)
      114000, // 20/03: 1.000 + 10 × 14,00 (prezzo inserito il 5/03)
    ]);
    expect(missing).toEqual([]);
    expect(unpriced).toEqual([]);
  });

  it('senza portafoglio resta il solo patrimonio dei conti (come prima)', () => {
    const { points } = netWorthYearSeries([account('C', 100000)], [], 2026, {}, now);
    expect(points.map((p) => p.balanceMinor)).toEqual([100000, 100000, 100000]);
  });

  it('segnala gli asset senza prezzo in tutta la serie', () => {
    const portfolio: Portfolio = {
      assets: [asset('N')],
      operations: [buy('N', '2026-01-05', '3', '0')],
      prices: [],
    };
    const { unpriced } = netWorthYearSeries([account('C', 100000)], [], 2026, {}, now, portfolio);
    expect(unpriced).toEqual(['N']);
  });
});

describe('wealthByKind (la torta conti / investimenti)', () => {
  const accounts = [
    account('C', 100000), // corrente 1.000,00 €
    account('S', 50000, 'savings'), // deposito 500,00 €
    account('B', 20000, 'brokerage'), // liquidità conto investimento 200,00 €
  ];
  const portfolio: Portfolio = {
    assets: [asset('A')],
    operations: [buy('A', '2026-02-10', '10', '12.5')],
    prices: [price('A', '2026-03-05', '14')],
  };

  it('un pezzo per tipo di conto più "investimenti", dal più grande: 1.000 > 500 > 200 > 140 €', () => {
    const split = wealthByKind(accounts, [], portfolio, '2026-03-20', {});
    expect(split.items).toEqual([
      { kind: 'checking', amountMinor: 100000 },
      { kind: 'savings', amountMinor: 50000 },
      { kind: 'brokerage', amountMinor: 20000 },
      { kind: 'investments', amountMinor: 14000 },
    ]);
    expect(split.accountsMinor).toBe(170000);
    expect(split.investmentsMinor).toBe(14000);
    expect(split.totalMinor).toBe(184000);
  });

  it('la somma dei pezzi coincide con il patrimonio totale', () => {
    const split = wealthByKind(accounts, [], portfolio, '2026-03-20', {});
    const wealth = wealthAt(accounts, [], portfolio, '2026-03-20', {});
    expect(split.totalMinor).toBe(wealth.totalMinor);
  });

  it('senza investimenti non c’è il pezzo "investimenti"', () => {
    const split = wealthByKind(accounts, [], empty, '2026-03-20', {});
    expect(split.items.map((i) => i.kind)).toEqual(['checking', 'savings', 'brokerage']);
    expect(split.investmentsMinor).toBe(0);
  });

  it('gli investimenti possono essere più dei conti: tornano in cima', () => {
    const big: Portfolio = {
      assets: [asset('A')],
      operations: [buy('A', '2026-02-10', '1000', '10')],
      prices: [],
    };
    const split = wealthByKind(accounts, [], big, '2026-03-20', {});
    expect(split.items[0]).toEqual({ kind: 'investments', amountMinor: 1000000 }); // 1000 × 10,00 € = 10.000,00 €
  });

  it('un conto in rosso non è un’attività e non compare', () => {
    const split = wealthByKind(
      [account('C', -5000), account('S', 50000, 'savings')],
      [],
      empty,
      '2026-03-20',
      {},
    );
    expect(split.items).toEqual([{ kind: 'savings', amountMinor: 50000 }]);
  });

  it('segnala cambi e prezzi mancanti', () => {
    const withMissing: Portfolio = {
      assets: [asset('U', 'USD'), asset('N')],
      operations: [buy('U', '2026-02-10', '10', '12.5'), buy('N', '2026-02-10', '3', '0')],
      prices: [],
    };
    const split = wealthByKind(accounts, [], withMissing, '2026-03-20', {});
    expect(split.missing).toEqual(['USD']);
    expect(split.unpriced).toEqual(['N']);
    expect(split.items.some((i) => i.kind === 'investments')).toBe(false);
  });
});
