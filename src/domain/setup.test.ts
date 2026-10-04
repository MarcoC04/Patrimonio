import { describe, expect, it } from 'vitest';
import { categoriesTable } from '../data/schema';
import type { Account, Category } from '../data/schema';
import { createAccount, setArchived, updateAccount, type AccountInput } from './accounts';
import { createCategory, updateCategory } from './categories';
import { buildDefaultCategories, DEFAULT_CATEGORIES } from './defaultCategories';
import { accountUsage, categoryUsage } from './integrity';

const NOW = new Date('2026-03-20T10:00:00.000Z');
const TS = '2026-01-02T03:04:05.000Z';
const base = { created_at: TS, updated_at: TS, deleted: false };

const acc = (id: string, name: string): Account => ({
  ...base,
  id,
  name,
  institution: '',
  type: 'checking',
  currency: 'EUR',
  opening_balance_minor: 0,
  opening_date: '2026-01-01',
  is_archived: false,
});

const cat = (
  id: string,
  name: string,
  kind: Category['kind'],
  parent_id: string | null = null,
): Category => ({
  ...base,
  id,
  name,
  parent_id,
  kind,
  color: '',
  icon: '',
});

const accountInput = (overrides: Partial<AccountInput> = {}): AccountInput => ({
  name: ' Conto principale ',
  institution: 'Banca finta',
  type: 'checking',
  currency: 'EUR',
  openingBalanceText: '1.500,00',
  openingDate: '2026-01-01',
  ...overrides,
});

describe('createAccount', () => {
  it('crea un conto EUR con saldo iniziale in centesimi: "1.500,00" → 150000', () => {
    const result = createAccount(accountInput(), [], NOW, () => 'acc-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: 'acc-1',
      name: 'Conto principale',
      currency: 'EUR',
      opening_balance_minor: 150000,
      opening_date: '2026-01-01',
      is_archived: false,
      deleted: false,
    });
  });

  it('il saldo iniziale può essere negativo o vuoto (= 0)', () => {
    const negative = createAccount(accountInput({ openingBalanceText: '-250,50' }), [], NOW);
    expect(negative.ok && negative.value.opening_balance_minor).toBe(-25050);
    const empty = createAccount(accountInput({ openingBalanceText: '  ' }), [], NOW);
    expect(empty.ok && empty.value.opening_balance_minor).toBe(0);
  });

  it('rifiuta nome vuoto, saldo non valido e data inesistente, tutti insieme', () => {
    expect(
      createAccount(
        accountInput({ name: ' ', openingBalanceText: 'x', openingDate: '2026-02-30' }),
        [],
        NOW,
      ),
    ).toEqual({ ok: false, issues: ['name', 'opening_balance', 'opening_date'] });
  });

  it('rifiuta un nome già usato, ignorando maiuscole e spazi', () => {
    const existing = [acc('a', 'Conto Principale')];
    expect(createAccount(accountInput(), existing, NOW)).toEqual({
      ok: false,
      issues: ['name_taken'],
    });
  });
});

describe('conti in valuta estera', () => {
  it('crea un conto in USD', () => {
    const result = createAccount(accountInput({ currency: 'USD' }), [], NOW, () => 'usd-1');
    expect(result.ok && result.value).toMatchObject({
      id: 'usd-1',
      currency: 'USD',
      opening_balance_minor: 150000,
    });
  });

  it('rifiuta una valuta non supportata o scritta male', () => {
    for (const currency of ['XXX', 'usd', '', 'EURO']) {
      expect(createAccount(accountInput({ currency }), [], NOW)).toEqual({
        ok: false,
        issues: ['currency'],
      });
    }
  });

  it('il saldo iniziale si legge con i decimali della valuta: in yen "15000" sì, "150,5" no', () => {
    const ok = createAccount(
      accountInput({ currency: 'JPY', openingBalanceText: '15000' }),
      [],
      NOW,
    );
    expect(ok.ok && ok.value.opening_balance_minor).toBe(15000);
    expect(
      createAccount(accountInput({ currency: 'JPY', openingBalanceText: '150,5' }), [], NOW),
    ).toEqual({ ok: false, issues: ['opening_balance'] });
  });

  it('la valuta di un conto esistente non si cambia con la modifica', () => {
    const existing: Account = { ...acc('a', 'Conto dollari'), currency: 'USD' };
    const result = updateAccount(
      existing,
      accountInput({ name: 'Conto dollari', currency: 'EUR' }),
      [existing],
      NOW,
    );
    expect(result.ok && result.value.currency).toBe('USD');
  });
});

describe('updateAccount e setArchived', () => {
  it('conserva id e creazione; il proprio nome non conta come duplicato', () => {
    const existing = acc('a', 'Conto principale');
    const result = updateAccount(
      existing,
      accountInput({ openingBalanceText: '10' }),
      [existing],
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: 'a',
      created_at: TS,
      updated_at: '2026-03-20T10:00:00.000Z',
      opening_balance_minor: 1000,
    });
  });

  it('non permette di rinominare con il nome di un altro conto', () => {
    const a = acc('a', 'Uno');
    const b = acc('b', 'Due');
    expect(updateAccount(a, accountInput({ name: 'due' }), [a, b], NOW)).toEqual({
      ok: false,
      issues: ['name_taken'],
    });
  });

  it('archivia e ripristina senza toccare altro', () => {
    const a = acc('a', 'Uno');
    expect(setArchived(a, true, NOW)).toMatchObject({ id: 'a', is_archived: true });
    expect(setArchived(setArchived(a, true, NOW), false, NOW).is_archived).toBe(false);
  });
});

describe('categorie', () => {
  const all = [
    cat('cibo', 'Alimentari', 'expense'),
    cat('altro-s', 'Altro', 'expense'),
    cat('altro-e', 'Altro', 'income'),
    cat('bar', 'Bar', 'expense', 'cibo'),
  ];

  it('crea una categoria di primo livello', () => {
    const result = createCategory(
      { name: ' Auto ', kind: 'expense', parentId: null },
      all,
      NOW,
      () => 'c1',
    );
    expect(result.ok && result.value).toMatchObject({
      id: 'c1',
      name: 'Auto',
      parent_id: null,
      kind: 'expense',
    });
  });

  it('lo stesso nome è ammesso in tipi diversi, non nello stesso tipo', () => {
    expect(createCategory({ name: 'Altro', kind: 'transfer', parentId: null }, all, NOW).ok).toBe(
      true,
    );
    expect(createCategory({ name: 'altro', kind: 'expense', parentId: null }, all, NOW)).toEqual({
      ok: false,
      issues: ['name_taken'],
    });
  });

  it('nome vuoto non valido', () => {
    expect(createCategory({ name: ' ', kind: 'expense', parentId: null }, all, NOW)).toEqual({
      ok: false,
      issues: ['name'],
    });
  });

  it('la categoria madre deve esistere, essere di primo livello e dello stesso tipo', () => {
    const make = (parentId: string) =>
      createCategory({ name: 'Nuova', kind: 'expense', parentId }, all, NOW);
    expect(make('cibo').ok).toBe(true);
    expect(make('inesistente')).toEqual({ ok: false, issues: ['parent'] });
    expect(make('bar')).toEqual({ ok: false, issues: ['parent'] }); // 'bar' è già figlia di 'cibo': la madre deve essere di primo livello
    expect(make('altro-e')).toEqual({ ok: false, issues: ['parent'] }); // tipo diverso
  });

  it('una categoria con figlie non può diventare figlia; non può essere madre di se stessa', () => {
    const cibo = all[0];
    if (!cibo) throw new Error('dati di prova');
    expect(
      updateCategory(cibo, { name: 'Alimentari', kind: 'expense', parentId: 'altro-s' }, all, NOW),
    ).toEqual({
      ok: false,
      issues: ['parent'],
    });
    expect(
      updateCategory(cibo, { name: 'Alimentari', kind: 'expense', parentId: 'cibo' }, all, NOW),
    ).toEqual({
      ok: false,
      issues: ['parent'],
    });
  });

  it('rinominare mantiene id e creazione', () => {
    const cibo = all[0];
    if (!cibo) throw new Error('dati di prova');
    const result = updateCategory(
      cibo,
      { name: 'Spesa', kind: 'expense', parentId: null },
      all,
      NOW,
    );
    expect(result.ok && result.value).toMatchObject({ id: 'cibo', name: 'Spesa', created_at: TS });
  });
});

describe('integrità', () => {
  it('conta i movimenti che usano un conto', () => {
    expect(accountUsage('a', [{ account_id: 'a' }, { account_id: 'b' }, { account_id: 'a' }])).toBe(
      2,
    );
    expect(accountUsage('x', [{ account_id: 'a' }])).toBe(0);
  });

  it('conta movimenti e figlie di una categoria', () => {
    const txs = [{ category_id: 'c' }, { category_id: null }, { category_id: 'c' }];
    const cats = [{ parent_id: 'c' }, { parent_id: null }];
    expect(categoryUsage('c', txs, cats)).toEqual({ transactions: 2, children: 1 });
    expect(categoryUsage('zzz', txs, cats)).toEqual({ transactions: 0, children: 0 });
  });
});

describe('categorie predefinite', () => {
  it('11 spese, 4 entrate e 1 giroconto, con Shopping e Rimborsi', () => {
    const count = (kind: Category['kind']) =>
      DEFAULT_CATEGORIES.filter((c) => c.kind === kind).length;
    expect(count('expense')).toBe(11);
    expect(count('income')).toBe(4);
    expect(count('transfer')).toBe(1);
    expect(DEFAULT_CATEGORIES).toContainEqual({ name: 'Shopping', kind: 'expense' });
    expect(DEFAULT_CATEGORIES).toContainEqual({ name: 'Rimborsi', kind: 'income' });
  });

  it('genera righe valide per il foglio, con id diversi', () => {
    const categories = buildDefaultCategories(NOW);
    expect(new Set(categories.map((c) => c.id)).size).toBe(categories.length);
    for (const category of categories) {
      const row = categoriesTable.toRow(category);
      const parsed = categoriesTable.parse(
        Object.fromEntries(categoriesTable.headers.map((h, i) => [h, row[i] ?? ''])),
      );
      expect(parsed.ok).toBe(true);
    }
  });

  it('non ci sono nomi duplicati nello stesso tipo', () => {
    const keys = DEFAULT_CATEGORIES.map((c) => `${c.kind}:${c.name.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
