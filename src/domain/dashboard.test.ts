import { describe, expect, it } from 'vitest';
import {
  balanceAtMinor,
  currentMonth,
  limitSpend,
  liquidityMinor,
  liquiditySeries,
  monthBounds,
  monthEndDates,
  netWorthMinor,
  percentOf,
  shiftMonth,
  spendByCategory,
} from './dashboard';

// Dati sintetici inventati. Importi in centesimi, con segno.
const account = (
  id: string,
  opening: number,
  type: 'checking' | 'savings' | 'cash' | 'brokerage' = 'checking',
  opening_date = '2026-01-01',
) => ({ id, opening_balance_minor: opening, opening_date, type });

const tx = (account_id: string, date: string, amount: number) => ({
  account_id,
  date,
  amount_minor: amount,
});

describe('balanceAtMinor', () => {
  const a = account('A', 100000, 'checking', '2026-01-10'); // 1.000,00 € dal 10 gennaio
  const txs = [
    tx('A', '2026-01-15', -5000),
    tx('A', '2026-02-05', 20000),
    tx('B', '2026-01-20', -999),
  ];

  it('prima della data iniziale il conto non esiste: 0', () => {
    expect(balanceAtMinor(a, txs, '2026-01-05')).toBe(0);
  });
  it('il giorno del saldo iniziale vale il saldo iniziale', () => {
    expect(balanceAtMinor(a, txs, '2026-01-10')).toBe(100000);
  });
  it('conta solo i movimenti del conto fino alla data (inclusa): 1.000 − 50 = 950 €', () => {
    expect(balanceAtMinor(a, txs, '2026-01-31')).toBe(95000);
    expect(balanceAtMinor(a, txs, '2026-01-15')).toBe(95000); // il giorno stesso è incluso
    expect(balanceAtMinor(a, txs, '2026-01-14')).toBe(100000);
  });
  it('a fine febbraio: 1.000 − 50 + 200 = 1.150 €', () => {
    expect(balanceAtMinor(a, txs, '2026-02-28')).toBe(115000);
  });
});

describe('patrimonio e liquidità', () => {
  const accounts = [
    account('C', 100000), // conto corrente 1.000,00 €
    account('S', 20000, 'savings'), // risparmio 200,00 €
    account('B', 500000, 'brokerage'), // broker 5.000,00 €
  ];

  it('patrimonio = tutti i conti: 1.000 + 200 + 5.000 = 6.200 €', () => {
    expect(netWorthMinor(accounts, [], '2026-06-01')).toBe(620000);
  });

  it('la liquidità esclude i conti broker: 1.000 + 200 = 1.200 €', () => {
    expect(liquidityMinor(accounts, [], '2026-06-01')).toBe(120000);
  });

  it('una spesa riduce entrambi', () => {
    const txs = [tx('C', '2026-03-01', -2500)];
    expect(netWorthMinor(accounts, txs, '2026-06-01')).toBe(617500);
    expect(liquidityMinor(accounts, txs, '2026-06-01')).toBe(117500);
  });

  it('un giroconto tra conti liquidi non cambia nulla', () => {
    const txs = [tx('C', '2026-03-01', -10000), tx('S', '2026-03-01', 10000)];
    expect(netWorthMinor(accounts, txs, '2026-06-01')).toBe(620000);
    expect(liquidityMinor(accounts, txs, '2026-06-01')).toBe(120000);
  });

  it('un giroconto verso il broker lascia il patrimonio ma riduce la liquidità di 100,00 €', () => {
    const txs = [tx('C', '2026-03-01', -10000), tx('B', '2026-03-01', 10000)];
    expect(netWorthMinor(accounts, txs, '2026-06-01')).toBe(620000);
    expect(liquidityMinor(accounts, txs, '2026-06-01')).toBe(110000);
  });

  it('senza conti vale 0', () => {
    expect(netWorthMinor([], [], '2026-06-01')).toBe(0);
    expect(liquidityMinor([], [], '2026-06-01')).toBe(0);
  });
});

describe('liquiditySeries', () => {
  it('un punto per data, con i saldi di quel giorno: 1.000 € poi 1.000 − 300 = 700 €', () => {
    const accounts = [account('C', 100000)];
    const txs = [tx('C', '2026-02-10', -30000)];
    expect(liquiditySeries(accounts, txs, ['2026-01-31', '2026-02-28'])).toEqual([
      { date: '2026-01-31', balanceMinor: 100000 },
      { date: '2026-02-28', balanceMinor: 70000 },
    ]);
  });
});

describe('mesi', () => {
  it('currentMonth usa la data locale', () => {
    expect(currentMonth(new Date(2026, 2, 20))).toBe('2026-03');
  });

  it('shiftMonth passa correttamente da un anno all’altro', () => {
    expect(shiftMonth('2026-03', 0)).toBe('2026-03');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-03', -14)).toBe('2025-01');
    expect(shiftMonth('2026-03', 22)).toBe('2028-01');
  });

  it('monthBounds: ultimo giorno corretto, anche per febbraio bisestile', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthBounds('2026-04')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('monthEndDates: fine mese per i mesi passati, oggi per quello in corso', () => {
    expect(monthEndDates(new Date(2026, 2, 20), 3)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-20',
    ]);
    expect(monthEndDates(new Date(2024, 2, 10), 2)).toEqual(['2024-02-29', '2024-03-10']);
  });

  it('monthEndDates attraversa l’anno e ne produce esattamente `count`, in ordine', () => {
    expect(monthEndDates(new Date(2026, 0, 15), 3)).toEqual([
      '2025-11-30',
      '2025-12-31',
      '2026-01-15',
    ]);
    const twelve = monthEndDates(new Date(2026, 5, 30), 12);
    expect(twelve).toHaveLength(12);
    expect(twelve[0]).toBe('2025-07-31');
    expect(twelve[11]).toBe('2026-06-30');
    expect([...twelve].sort()).toEqual(twelve);
  });
});

describe('spendByCategory', () => {
  const categories = [
    { id: 'cibo', parent_id: null },
    { id: 'bar', parent_id: 'cibo' }, // sottocategoria di cibo
    { id: 'svago', parent_id: null },
    { id: 'stipendio', parent_id: null },
  ];
  const t = (
    date: string,
    amount: number,
    category_id: string | null,
    transfer_group_id: string | null = null,
  ) => ({ date, amount_base_minor: amount, category_id, transfer_group_id });
  const march = { from: '2026-03-01', to: '2026-03-31' };

  const txs = [
    t('2026-03-02', -3000, 'cibo'), // 30,00
    t('2026-03-05', -1200, 'bar'), // 12,00 → confluisce in "cibo"
    t('2026-03-10', -5000, 'svago'), // 50,00
    t('2026-03-12', -700, null), // 7,00 da categorizzare
    t('2026-03-15', 100000, 'stipendio'), // entrata: ignorata
    t('2026-03-20', -20000, null, 'g1'), // giroconto: ignorato
    t('2026-02-28', -9999, 'svago'), // fuori intervallo
    t('2026-04-01', -9999, 'svago'), // fuori intervallo
    t('2026-03-31', -100, 'svago'), // ultimo giorno: incluso
    t('2026-03-01', -50, 'cibo'), // primo giorno: incluso
  ];

  it('somma per categoria madre e ordina dal più alto: svago 50,00+1,00 > cibo 30+12+0,50 > altro', () => {
    expect(spendByCategory(txs, categories, march)).toEqual([
      { categoryId: 'svago', amountMinor: 5100 }, // 5000 + 100
      { categoryId: 'cibo', amountMinor: 4250 }, // 3000 + 1200 + 50
      { categoryId: null, amountMinor: 700 },
    ]);
  });

  it('esclude entrate, giroconti e movimenti fuori intervallo', () => {
    const result = spendByCategory(txs, categories, march);
    expect(result.find((r) => r.categoryId === 'stipendio')).toBeUndefined();
    expect(result.reduce((s, r) => s + r.amountMinor, 0)).toBe(5100 + 4250 + 700);
  });

  it('una categoria sconosciuta (cancellata) conta come da categorizzare', () => {
    const result = spendByCategory([t('2026-03-02', -400, 'cancellata')], categories, march);
    expect(result).toEqual([{ categoryId: null, amountMinor: 400 }]);
  });

  it('nessuna spesa → elenco vuoto', () => {
    expect(spendByCategory([], categories, march)).toEqual([]);
  });

  it('a parità di importo l’ordine è deterministico', () => {
    const tied = [t('2026-03-02', -100, 'svago'), t('2026-03-02', -100, 'cibo')];
    expect(spendByCategory(tied, categories, march).map((r) => r.categoryId)).toEqual([
      'cibo',
      'svago',
    ]);
  });
});

describe('limitSpend e percentOf', () => {
  const items = [
    { categoryId: 'a', amountMinor: 5000 },
    { categoryId: 'b', amountMinor: 3000 },
    { categoryId: 'c', amountMinor: 1500 },
    { categoryId: 'd', amountMinor: 500 },
  ];

  it('prime voci + somma del resto: 15,00 + 5,00 = 20,00 €', () => {
    const { top, othersMinor } = limitSpend(items, 2);
    expect(top.map((i) => i.categoryId)).toEqual(['a', 'b']);
    expect(othersMinor).toBe(2000);
  });

  it('con meno voci del massimo non c’è "altre"', () => {
    expect(limitSpend(items, 10)).toEqual({ top: items, othersMinor: 0 });
  });

  it.each([
    [5000, 9900, 51], // 50,505 % → 51
    [4200, 9900, 42], // 42,42 % → 42
    [700, 9900, 7], // 7,07 % → 7
    [1, 2, 50],
    [1, 3, 33],
    [2, 3, 67],
    [1, 200, 1], // 0,5 % → 1 (mezzo verso l'alto)
    [0, 100, 0],
    [100, 100, 100],
  ])('percentOf(%i, %i) = %i %%', (part, total, expected) => {
    expect(percentOf(part, total)).toBe(expected);
  });

  it('con totale 0 vale 0 (nessuna divisione per zero)', () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(5, 0)).toBe(0);
  });
});
