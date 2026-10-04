import { describe, expect, it } from 'vitest';
import type { Account, Category, Transaction } from '../data/schema';
import { totalsMinor } from './ledger';
import {
  createMovement,
  createTransfer,
  updateMovement,
  type MovementInput,
  type MovementContext,
} from './movements';

const NOW = new Date('2026-03-20T10:00:00.000Z');
const TS = '2026-01-02T03:04:05.000Z';
const common = { created_at: TS, updated_at: TS, deleted: false };

const account = (id: string, overrides: Partial<Account> = {}): Account => ({
  ...common,
  id,
  name: `Conto ${id}`,
  institution: '',
  type: 'checking',
  currency: 'EUR',
  opening_balance_minor: 0,
  opening_date: '2026-01-01',
  is_archived: false,
  ...overrides,
});

const category = (id: string, kind: Category['kind']): Category => ({
  ...common,
  id,
  name: id,
  parent_id: null,
  kind,
  color: '',
  icon: '',
});

const ctx: MovementContext = {
  accounts: [account('A'), account('B'), account('USD', { currency: 'USD' })],
  categories: [
    category('cibo', 'expense'),
    category('stipendio', 'income'),
    category('giro', 'transfer'),
  ],
};

const input = (overrides: Partial<MovementInput> = {}): MovementInput => ({
  kind: 'expense',
  amountText: '12,34',
  date: '2026-03-15',
  accountId: 'A',
  categoryId: 'cibo',
  description: '  Spesa di prova  ',
  notes: '',
  ...overrides,
});

let counter = 0;
const newId = () => `id-${++counter}`;

describe('createMovement', () => {
  it('una spesa di 12,34 € si salva come −1234 centesimi, con snapshot EUR e tasso 1', () => {
    const result = createMovement(input(), ctx, NOW, () => 'tx-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: 'tx-1',
      account_id: 'A',
      date: '2026-03-15',
      amount_minor: -1234,
      amount_base_minor: -1234,
      currency: 'EUR',
      fx_rate: '1',
      category_id: 'cibo',
      transfer_group_id: null,
      deleted: false,
      created_at: '2026-03-20T10:00:00.000Z',
      updated_at: '2026-03-20T10:00:00.000Z',
    });
    expect(result.value.description).toBe('Spesa di prova'); // spazi tolti
  });

  it('un’entrata di 1.000,00 € si salva positiva: +100000', () => {
    const result = createMovement(
      input({ kind: 'income', amountText: '1.000,00', categoryId: 'stipendio' }),
      ctx,
      NOW,
    );
    expect(result.ok && result.value.amount_minor).toBe(100000);
  });

  it('senza categoria è valido (resta "da categorizzare")', () => {
    const result = createMovement(input({ categoryId: null }), ctx, NOW);
    expect(result.ok && result.value.category_id).toBeNull();
  });

  it.each([[''], ['0'], ['0,00'], ['-5'], ['abc'], ['12,345']])(
    'importo "%s" non valido',
    (amountText) => {
      expect(createMovement(input({ amountText }), ctx, NOW)).toEqual({
        ok: false,
        issues: ['amount'],
      });
    },
  );

  it('data inesistente non valida', () => {
    expect(createMovement(input({ date: '2026-02-30' }), ctx, NOW)).toEqual({
      ok: false,
      issues: ['date'],
    });
  });

  it('data precedente al saldo iniziale del conto non valida', () => {
    expect(createMovement(input({ date: '2025-12-31' }), ctx, NOW)).toEqual({
      ok: false,
      issues: ['before_opening'],
    });
    expect(createMovement(input({ date: '2026-01-01' }), ctx, NOW).ok).toBe(true); // il giorno stesso va bene
  });

  it('conto inesistente non valido', () => {
    expect(createMovement(input({ accountId: 'zzz' }), ctx, NOW)).toEqual({
      ok: false,
      issues: ['account'],
    });
  });

  it('conto in valuta diversa da EUR rifiutato per ora', () => {
    expect(createMovement(input({ accountId: 'USD' }), ctx, NOW)).toEqual({
      ok: false,
      issues: ['currency'],
    });
  });

  it('una spesa non può avere una categoria di entrata, né viceversa', () => {
    expect(createMovement(input({ categoryId: 'stipendio' }), ctx, NOW)).toEqual({
      ok: false,
      issues: ['category'],
    });
    expect(createMovement(input({ kind: 'income', categoryId: 'cibo' }), ctx, NOW)).toEqual({
      ok: false,
      issues: ['category'],
    });
    expect(createMovement(input({ categoryId: 'inesistente' }), ctx, NOW).ok).toBe(false);
  });

  it('segnala tutti i campi sbagliati insieme, senza ripetizioni', () => {
    const result = createMovement(
      input({ amountText: 'x', date: 'oggi', accountId: 'zzz', categoryId: 'giro' }),
      ctx,
      NOW,
    );
    expect(result).toEqual({ ok: false, issues: ['amount', 'date', 'account', 'category'] });
  });
});

describe('updateMovement', () => {
  const existing = (): Transaction => {
    const created = createMovement(
      input(),
      ctx,
      new Date('2026-03-16T08:00:00.000Z'),
      () => 'tx-1',
    );
    if (!created.ok) throw new Error('movimento di prova non valido');
    return {
      ...created.value,
      dedupe_hash: 'h1',
      import_batch_id: 'imp-1',
      raw_description: 'RAW',
    };
  };

  it('mantiene id, creazione e origine; aggiorna importo, segno e updated_at', () => {
    const result = updateMovement(
      existing(),
      input({ kind: 'income', amountText: '50', categoryId: 'stipendio' }),
      ctx,
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: 'tx-1',
      created_at: '2026-03-16T08:00:00.000Z',
      updated_at: '2026-03-20T10:00:00.000Z',
      amount_minor: 5000,
      amount_base_minor: 5000,
      category_id: 'stipendio',
      dedupe_hash: 'h1',
      import_batch_id: 'imp-1',
      raw_description: 'RAW',
    });
  });

  it('non modifica i giroconti', () => {
    const transfer = { ...existing(), transfer_group_id: 'g1' };
    expect(updateMovement(transfer, input(), ctx, NOW)).toEqual({
      ok: false,
      issues: ['transfer'],
    });
  });

  it('applica le stesse validazioni della creazione', () => {
    expect(updateMovement(existing(), input({ amountText: '0' }), ctx, NOW)).toEqual({
      ok: false,
      issues: ['amount'],
    });
  });
});

describe('createTransfer', () => {
  const transferInput = {
    fromAccountId: 'A',
    toAccountId: 'B',
    amountText: '100,00',
    date: '2026-03-15',
    description: 'Giroconto di prova',
  };

  it('crea due lati con lo stesso gruppo: −100,00 da A, +100,00 su B, somma zero', () => {
    counter = 0;
    const result = createTransfer(transferInput, ctx, NOW, newId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [out, into] = result.value;
    expect(out).toMatchObject({ account_id: 'A', amount_minor: -10000, amount_base_minor: -10000 });
    expect(into).toMatchObject({ account_id: 'B', amount_minor: 10000, amount_base_minor: 10000 });
    expect(out.transfer_group_id).toBe(into.transfer_group_id);
    expect(out.transfer_group_id).not.toBeNull();
    expect(out.id).not.toBe(into.id);
    expect(out.amount_minor + into.amount_minor).toBe(0);
    expect(out.category_id).toBe('giro'); // categoria "Trasferimento"
  });

  it('i due lati non compaiono nei totali di spese ed entrate', () => {
    const result = createTransfer(transferInput, ctx, NOW);
    if (!result.ok) throw new Error('giroconto di prova non valido');
    expect(totalsMinor(result.value)).toEqual({ incomeMinor: 0, expenseMinor: 0, netMinor: 0 });
  });

  it('stesso conto di partenza e arrivo non valido', () => {
    expect(createTransfer({ ...transferInput, toAccountId: 'A' }, ctx, NOW)).toEqual({
      ok: false,
      issues: ['same_account'],
    });
  });

  it('importo, data e conti vengono controllati', () => {
    expect(
      createTransfer(
        { ...transferInput, amountText: '0', date: 'x', toAccountId: 'zzz' },
        ctx,
        NOW,
      ),
    ).toEqual({ ok: false, issues: ['amount', 'date', 'account'] });
  });

  it('senza una categoria "giroconto" il campo resta vuoto', () => {
    const noTransferCategory = { ...ctx, categories: [category('cibo', 'expense')] };
    const result = createTransfer(transferInput, noTransferCategory, NOW);
    expect(result.ok && result.value[0].category_id).toBeNull();
  });
});
