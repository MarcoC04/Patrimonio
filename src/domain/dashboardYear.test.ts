import { describe, expect, it } from 'vitest';
import {
  assetsByAccountType,
  availableYears,
  incomeByCategory,
  monthlyFlow,
  netWorthYearSeries,
  spendByCategory,
  yearEndDates,
  yearRange,
  yearSummary,
} from './dashboard';

// Dati sintetici inventati. Importi in centesimi, con segno.
const flowTx = (date: string, amount: number, transfer_group_id: string | null = null) => ({
  date,
  amount_base_minor: amount,
  transfer_group_id,
});

describe('availableYears', () => {
  it('anni con movimenti o conti aperti, più quello in corso, in ordine crescente', () => {
    const years = availableYears(
      [{ date: '2025-01-02' }, { date: '2023-05-10' }, { date: '2025-06-01' }],
      [{ opening_date: '2024-03-01' }],
      new Date(2026, 2, 20),
    );
    expect(years).toEqual([2023, 2024, 2025, 2026]);
  });

  it('senza dati compare solo l’anno in corso', () => {
    expect(availableYears([], [], new Date(2026, 2, 20))).toEqual([2026]);
  });
});

describe('yearRange', () => {
  it('dal primo gennaio al 31 dicembre', () => {
    expect(yearRange(2024)).toEqual({ from: '2024-01-01', to: '2024-12-31' });
  });
});

describe('monthlyFlow e yearSummary', () => {
  const txs = [
    flowTx('2025-01-10', 300000), // entrata di 3.000,00 a gennaio
    flowTx('2025-01-15', -50000), // spesa di 500,00
    flowTx('2025-01-20', -12000), // spesa di 120,00
    flowTx('2025-03-05', -7000), // spesa di 70,00 a marzo
    flowTx('2025-02-01', 100000, 'g1'), // giroconto: escluso
    flowTx('2024-12-31', 999), // altro anno: escluso
    flowTx('2026-01-01', -888), // altro anno: escluso
  ];

  it('12 mesi dell’anno; gennaio: entrate 3.000 − spese 620 = flusso 2.380 €', () => {
    const flow = monthlyFlow(txs, 2025);
    expect(flow).toHaveLength(12);
    expect(flow[0]).toEqual({
      month: '2025-01',
      incomeMinor: 300000,
      expenseMinor: 62000, // 500 + 120
      netMinor: 238000,
    });
    expect(flow[11]?.month).toBe('2025-12');
  });

  it('un mese senza movimenti vale zero; marzo ha solo spese: flusso −70 €', () => {
    const flow = monthlyFlow(txs, 2025);
    expect(flow[1]).toEqual({ month: '2025-02', incomeMinor: 0, expenseMinor: 0, netMinor: 0 });
    expect(flow[2]).toEqual({
      month: '2025-03',
      incomeMinor: 0,
      expenseMinor: 7000,
      netMinor: -7000,
    });
  });

  it('i giroconti e gli altri anni non entrano nel flusso', () => {
    const flow = monthlyFlow(txs, 2025);
    expect(flow[1]?.incomeMinor).toBe(0); // il giroconto di febbraio è escluso
    const total = flow.reduce((s, m) => s + m.incomeMinor + m.expenseMinor, 0);
    expect(total).toBe(300000 + 62000 + 7000);
  });

  it('riepilogo annuo: entrate 3.000, spese 690 (620 + 70), risparmio 2.310 €', () => {
    expect(yearSummary(txs, 2025)).toEqual({
      incomeMinor: 300000,
      expenseMinor: 69000,
      savingsMinor: 231000,
    });
  });

  it('un anno senza movimenti ha tutto a zero; il risparmio può essere negativo', () => {
    expect(yearSummary(txs, 2030)).toEqual({ incomeMinor: 0, expenseMinor: 0, savingsMinor: 0 });
    expect(yearSummary([flowTx('2025-05-01', -2500)], 2025).savingsMinor).toBe(-2500);
  });

  it('niente -0 quando non ci sono spese', () => {
    const summary = yearSummary([flowTx('2025-05-01', 1000)], 2025);
    expect(Object.is(summary.expenseMinor, 0)).toBe(true);
  });
});

describe('yearEndDates', () => {
  const now = new Date(2026, 2, 20); // 20 marzo 2026

  it('anno in corso: fine di gennaio e febbraio, poi oggi', () => {
    expect(yearEndDates(2026, now)).toEqual(['2026-01-31', '2026-02-28', '2026-03-20']);
  });

  it('anno passato: dodici fine mese, con febbraio bisestile', () => {
    const dates = yearEndDates(2025, now);
    expect(dates).toHaveLength(12);
    expect(dates[1]).toBe('2025-02-28');
    expect(dates[11]).toBe('2025-12-31');
    expect(yearEndDates(2024, now)[1]).toBe('2024-02-29');
  });

  it('anno futuro: nessuna data', () => {
    expect(yearEndDates(2027, now)).toEqual([]);
  });

  it('il primo giorno dell’anno c’è già il mese di gennaio, che termina oggi', () => {
    expect(yearEndDates(2026, new Date(2026, 0, 1))).toEqual(['2026-01-01']);
  });
});

describe('netWorthYearSeries', () => {
  const now = new Date(2026, 2, 20);
  const account = (
    id: string,
    opening: number,
    opening_date: string,
    currency = 'EUR',
    type: 'checking' | 'savings' | 'cash' | 'brokerage' = 'checking',
  ) => ({ id, opening_balance_minor: opening, opening_date, currency, type });

  it('un conto vale zero prima della sua apertura, poi il saldo, poi i movimenti', () => {
    // Conto da 1.000 € aperto il 10 marzo 2025; spesa di 200 € il 5 aprile
    const accounts = [account('A', 100000, '2025-03-10')];
    const txs = [{ account_id: 'A', date: '2025-04-05', amount_minor: -20000 }];
    const { points, missing } = netWorthYearSeries(accounts, txs, 2025, {}, now);
    expect(points.map((p) => p.balanceMinor)).toEqual([
      0, // gennaio
      0, // febbraio
      100000, // marzo
      80000, // aprile: 1.000 − 200
      80000,
      80000,
      80000,
      80000,
      80000,
      80000,
      80000,
      80000,
    ]);
    expect(missing).toEqual([]);
  });

  it('con un conto in valuta estera converte ogni punto con lo stesso tasso: 500 USD a 1,25 = 400 €', () => {
    const accounts = [account('A', 100000, '2025-01-01'), account('D', 50000, '2025-01-01', 'USD')];
    const { points } = netWorthYearSeries(accounts, [], 2025, { USD: '1.25' }, now);
    expect(points.every((p) => p.balanceMinor === 140000)).toBe(true); // 1.000 + 400
  });

  it('senza il tasso segnala la valuta e non la inventa', () => {
    const accounts = [account('A', 100000, '2025-01-01'), account('D', 50000, '2025-01-01', 'USD')];
    const { points, missing } = netWorthYearSeries(accounts, [], 2025, {}, now);
    expect(points[0]?.balanceMinor).toBe(100000);
    expect(missing).toEqual(['USD']);
  });

  it('anno in corso: solo i mesi trascorsi; anno futuro: nessun punto', () => {
    const accounts = [account('A', 100000, '2025-01-01')];
    expect(netWorthYearSeries(accounts, [], 2026, {}, now).points.map((p) => p.date)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-20',
    ]);
    expect(netWorthYearSeries(accounts, [], 2027, {}, now).points).toEqual([]);
  });
});

describe('assetsByAccountType', () => {
  const account = (
    id: string,
    opening: number,
    type: 'checking' | 'savings' | 'cash' | 'brokerage',
    currency = 'EUR',
    opening_date = '2025-01-01',
  ) => ({ id, opening_balance_minor: opening, opening_date, currency, type });
  const day = '2026-03-20';

  it('somma per tipo e ordina dal più alto: investimenti 2.500 > conti correnti 1.500 > deposito 800', () => {
    const accounts = [
      account('C1', 100000, 'checking'),
      account('C2', 50000, 'checking'),
      account('S', 80000, 'savings'),
      account('B', 250000, 'brokerage'),
      account('X', 0, 'cash'), // saldo zero: omesso
    ];
    expect(assetsByAccountType(accounts, [], day)).toEqual({
      items: [
        { type: 'brokerage', amountMinor: 250000 },
        { type: 'checking', amountMinor: 150000 },
        { type: 'savings', amountMinor: 80000 },
      ],
      totalMinor: 480000,
      missing: [],
    });
  });

  it('un conto in rosso non è un’attività: escluso', () => {
    const accounts = [account('C1', 100000, 'checking'), account('C2', -20000, 'checking')];
    expect(assetsByAccountType(accounts, [], day).items).toEqual([
      { type: 'checking', amountMinor: 100000 },
    ]);
  });

  it('converte i conti esteri: deposito 800 € + 500 USD a 1,25 (400 €) = 1.200 €', () => {
    const accounts = [account('S1', 80000, 'savings'), account('S2', 50000, 'savings', 'USD')];
    expect(assetsByAccountType(accounts, [], day, { USD: '1.25' }).items).toEqual([
      { type: 'savings', amountMinor: 120000 },
    ]);
  });

  it('una valuta senza tasso è segnalata e non entra nel totale', () => {
    const accounts = [account('C', 100000, 'checking'), account('Y', 1500000, 'savings', 'JPY')];
    const result = assetsByAccountType(accounts, [], day, {});
    expect(result.missing).toEqual(['JPY']);
    expect(result.totalMinor).toBe(100000);
  });

  it('un conto non ancora aperto alla data non conta', () => {
    const accounts = [account('F', 100000, 'checking', 'EUR', '2027-01-01')];
    expect(assetsByAccountType(accounts, [], day).items).toEqual([]);
  });

  it('i movimenti spostano il saldo: 1.000 − 300 = 700 €', () => {
    const accounts = [account('C', 100000, 'checking')];
    const txs = [{ account_id: 'C', date: '2026-01-10', amount_minor: -30000 }];
    expect(assetsByAccountType(accounts, txs, day).totalMinor).toBe(70000);
  });
});

describe('incomeByCategory', () => {
  const categories = [
    { id: 'stip', parent_id: null },
    { id: 'bonus', parent_id: 'stip' }, // sottocategoria
    { id: 'rimb', parent_id: null },
  ];
  const t = (
    date: string,
    amount: number,
    category_id: string | null,
    transfer_group_id: string | null = null,
  ) => ({ date, amount_base_minor: amount, category_id, transfer_group_id });
  const march = { from: '2025-03-01', to: '2025-03-31' };

  it('somma le entrate per categoria madre: stipendio 2.000 + bonus 300 = 2.300 > rimborsi 50 €', () => {
    const txs = [
      t('2025-03-01', 200000, 'stip'),
      t('2025-03-15', 30000, 'bonus'), // confluisce in "stip"
      t('2025-03-20', 5000, 'rimb'),
    ];
    expect(incomeByCategory(txs, categories, march)).toEqual([
      { categoryId: 'stip', amountMinor: 230000 },
      { categoryId: 'rimb', amountMinor: 5000 },
    ]);
  });

  it('esclude spese, giroconti e movimenti fuori intervallo', () => {
    const txs = [
      t('2025-03-01', 200000, 'stip'),
      t('2025-03-21', -999, 'stip'), // spesa
      t('2025-03-22', 1000, null, 'g1'), // giroconto
      t('2025-04-01', 7777, 'stip'), // fuori intervallo
    ];
    expect(incomeByCategory(txs, categories, march)).toEqual([
      { categoryId: 'stip', amountMinor: 200000 },
    ]);
  });

  it('un’entrata senza categoria è "da categorizzare" (null)', () => {
    expect(incomeByCategory([t('2025-03-05', 4000, null)], categories, march)).toEqual([
      { categoryId: null, amountMinor: 4000 },
    ]);
  });

  it('spendByCategory e incomeByCategory sono complementari sugli stessi movimenti', () => {
    const txs = [t('2025-03-01', 5000, 'rimb'), t('2025-03-02', -3000, 'rimb')];
    expect(incomeByCategory(txs, categories, march)).toEqual([
      { categoryId: 'rimb', amountMinor: 5000 },
    ]);
    expect(spendByCategory(txs, categories, march)).toEqual([
      { categoryId: 'rimb', amountMinor: 3000 },
    ]);
  });
});
