import { describe, expect, it } from 'vitest';
import {
  accountBalanceMinor,
  filterTransactions,
  isTransfer,
  sortNewestFirst,
  totalsMinor,
  UNCATEGORIZED,
} from './ledger';

// Dati sintetici. Ogni movimento: conto, data, importo in centesimi (con segno), categoria.
const tx = (
  id: string,
  account_id: string,
  date: string,
  amount: number,
  category_id: string | null = null,
  transfer_group_id: string | null = null,
  created_at = '2026-01-01T00:00:00.000Z',
) => ({
  id,
  account_id,
  date,
  created_at,
  amount_minor: amount,
  amount_base_minor: amount,
  category_id,
  transfer_group_id,
});

describe('accountBalanceMinor', () => {
  const account = { id: 'A', opening_balance_minor: 150000 }; // 1.500,00 €

  it('saldo = iniziale + movimenti del conto: 1.500,00 − 12,34 + 500,00 = 1.987,66 €', () => {
    const txs = [
      tx('1', 'A', '2026-02-01', -1234),
      tx('2', 'A', '2026-02-02', 50000),
      tx('3', 'B', '2026-02-03', -99999), // altro conto: ignorato
    ];
    expect(accountBalanceMinor(account, txs)).toBe(198766);
  });

  it('senza movimenti il saldo è quello iniziale (anche negativo)', () => {
    expect(accountBalanceMinor(account, [])).toBe(150000);
    expect(accountBalanceMinor({ id: 'A', opening_balance_minor: -5000 }, [])).toBe(-5000);
  });

  it('un giroconto sposta il denaro: −100,00 sul conto A, +100,00 sul conto B', () => {
    const txs = [
      tx('1', 'A', '2026-02-01', -10000, null, 'g1'),
      tx('2', 'B', '2026-02-01', 10000, null, 'g1'),
    ];
    expect(accountBalanceMinor({ id: 'A', opening_balance_minor: 50000 }, txs)).toBe(40000);
    expect(accountBalanceMinor({ id: 'B', opening_balance_minor: 0 }, txs)).toBe(10000);
  });
});

describe('totalsMinor', () => {
  it('entrate 2.000,00 e spese 50,00 + 12,34 = 62,34; netto 1.937,66 €', () => {
    const txs = [
      tx('1', 'A', '2026-02-01', 200000),
      tx('2', 'A', '2026-02-02', -5000),
      tx('3', 'A', '2026-02-03', -1234),
    ];
    expect(totalsMinor(txs)).toEqual({
      incomeMinor: 200000,
      expenseMinor: 6234,
      netMinor: 193766,
    });
  });

  it('i giroconti sono esclusi dai totali (entrambi i lati)', () => {
    const txs = [
      tx('1', 'A', '2026-02-01', -10000, null, 'g1'),
      tx('2', 'B', '2026-02-01', 10000, null, 'g1'),
      tx('3', 'A', '2026-02-02', -500),
    ];
    expect(totalsMinor(txs)).toEqual({ incomeMinor: 0, expenseMinor: 500, netMinor: -500 });
  });

  it('senza movimenti i totali sono zero', () => {
    expect(totalsMinor([])).toEqual({ incomeMinor: 0, expenseMinor: 0, netMinor: 0 });
  });

  it('usa lo snapshot in EUR, non l’importo nella valuta originale', () => {
    // 10,00 USD registrati a 9,20 € → in EUR conta 9,20
    const txs = [{ amount_base_minor: -920, transfer_group_id: null }];
    expect(totalsMinor(txs).expenseMinor).toBe(920);
  });
});

describe('filterTransactions', () => {
  const txs = [
    tx('1', 'A', '2026-01-31', -100, 'cibo'),
    tx('2', 'A', '2026-02-01', -200, 'casa'),
    tx('3', 'B', '2026-02-15', -300, 'cibo'),
    tx('4', 'A', '2026-02-28', -400, null),
    tx('5', 'A', '2026-03-01', -500, 'svago'),
  ];
  const ids = (list: { id: string }[]) => list.map((t) => t.id);

  it('senza filtri restituisce tutto', () => {
    expect(ids(filterTransactions(txs, {}))).toEqual(['1', '2', '3', '4', '5']);
  });

  it('le date sono incluse agli estremi: febbraio = dal 01/02 al 28/02', () => {
    expect(ids(filterTransactions(txs, { from: '2026-02-01', to: '2026-02-28' }))).toEqual([
      '2',
      '3',
      '4',
    ]);
  });

  it('solo data minima o solo data massima', () => {
    expect(ids(filterTransactions(txs, { from: '2026-02-28' }))).toEqual(['4', '5']);
    expect(ids(filterTransactions(txs, { to: '2026-01-31' }))).toEqual(['1']);
  });

  it('uno o più conti (OR tra i conti); vuoto = tutti', () => {
    expect(ids(filterTransactions(txs, { accountIds: ['B'] }))).toEqual(['3']);
    expect(ids(filterTransactions(txs, { accountIds: ['A', 'B'] }))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(ids(filterTransactions(txs, { accountIds: [] }))).toEqual(['1', '2', '3', '4', '5']);
  });

  it('i conti si combinano con date e categorie (AND)', () => {
    expect(
      ids(
        filterTransactions(txs, { accountIds: ['A'], from: '2026-02-01', categoryIds: ['casa'] }),
      ),
    ).toEqual(['2']);
  });

  it('più categorie insieme (OR tra le categorie)', () => {
    expect(ids(filterTransactions(txs, { categoryIds: ['cibo', 'svago'] }))).toEqual([
      '1',
      '3',
      '5',
    ]);
  });

  it('UNCATEGORIZED seleziona i movimenti senza categoria', () => {
    expect(ids(filterTransactions(txs, { categoryIds: [UNCATEGORIZED] }))).toEqual(['4']);
    expect(ids(filterTransactions(txs, { categoryIds: [UNCATEGORIZED, 'casa'] }))).toEqual([
      '2',
      '4',
    ]);
  });

  it('un elenco di categorie vuoto significa nessun filtro', () => {
    expect(filterTransactions(txs, { categoryIds: [] })).toHaveLength(5);
  });

  it('i filtri si combinano (AND): febbraio + cibo + conto B', () => {
    expect(
      ids(
        filterTransactions(txs, {
          from: '2026-02-01',
          to: '2026-02-28',
          categoryIds: ['cibo'],
          accountId: 'B',
        }),
      ),
    ).toEqual(['3']);
  });
});

describe('sortNewestFirst', () => {
  it('ordina per data decrescente, poi per creazione, senza modificare l’originale', () => {
    const txs = [
      tx('a', 'A', '2026-02-01', 1, null, null, '2026-02-01T08:00:00.000Z'),
      tx('b', 'A', '2026-03-01', 1, null, null, '2026-03-01T08:00:00.000Z'),
      tx('c', 'A', '2026-02-01', 1, null, null, '2026-02-01T09:00:00.000Z'),
    ];
    expect(sortNewestFirst(txs).map((t) => t.id)).toEqual(['b', 'c', 'a']);
    expect(txs.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('isTransfer', () => {
  it('è un giroconto solo se ha transfer_group_id', () => {
    expect(isTransfer({ transfer_group_id: 'g1' })).toBe(true);
    expect(isTransfer({ transfer_group_id: null })).toBe(false);
  });
});
