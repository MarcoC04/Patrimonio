import type { Account, Category, Transaction } from '../data/schema';
import { isIsoDate } from './dates';
import { BASE_CURRENCY, parseMoney } from './money';
import { fail, type Result } from './result';
import { uuidv7 } from './uuid7';

export type MovementKind = 'expense' | 'income';

export type MovementIssue =
  | 'amount'
  | 'date'
  | 'account'
  | 'currency'
  | 'before_opening'
  | 'category'
  | 'transfer'
  | 'same_account';

export interface MovementInput {
  kind: MovementKind;
  /** Importo scritto dall'utente, sempre positivo ("12,34"): il segno lo decide `kind`. */
  amountText: string;
  date: string;
  accountId: string;
  categoryId: string | null;
  description: string;
  notes: string;
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amountText: string;
  date: string;
  description: string;
}

export interface MovementContext {
  /** Conti attivi (non cancellati). */
  accounts: readonly Account[];
  categories: readonly Category[];
}

type IdFactory = () => string;

/** Importo positivo in centesimi, o 'amount' tra i problemi. */
function checkAmount(text: string, issues: MovementIssue[]): number {
  const minor = parseMoney(text);
  if (minor === null || minor <= 0) {
    issues.push('amount');
    return 0;
  }
  return minor;
}

function checkAccount(
  accountId: string,
  date: string,
  ctx: MovementContext,
  issues: MovementIssue[],
): Account | null {
  const account = ctx.accounts.find((a) => a.id === accountId);
  if (!account) {
    issues.push('account');
    return null;
  }
  // Prima del cambio multi-valuta (Fase 1, passo E) si accettano solo conti in EUR.
  if (account.currency !== BASE_CURRENCY) issues.push('currency');
  else if (isIsoDate(date) && date < account.opening_date) issues.push('before_opening');
  return account;
}

function checkCategory(
  categoryId: string | null,
  kind: MovementKind,
  ctx: MovementContext,
  issues: MovementIssue[],
): void {
  if (categoryId === null) return; // vuoto = da categorizzare
  const category = ctx.categories.find((c) => c.id === categoryId);
  if (!category || category.kind !== kind) issues.push('category');
}

/** Campi modificabili di un movimento semplice, già validati e col segno giusto. */
function buildFields(
  input: MovementInput,
  ctx: MovementContext,
): Result<EditableFields, MovementIssue> {
  const issues: MovementIssue[] = [];
  const amountMinor = checkAmount(input.amountText, issues);
  if (!isIsoDate(input.date)) issues.push('date');
  const account = checkAccount(input.accountId, input.date, ctx, issues);
  checkCategory(input.categoryId, input.kind, ctx, issues);
  if (issues.length > 0 || !account) return fail(issues);

  const signed = input.kind === 'expense' ? -amountMinor : amountMinor;
  return {
    ok: true,
    value: {
      account_id: account.id,
      date: input.date,
      description: input.description.trim(),
      amount_minor: signed,
      // Solo EUR: lo snapshot in EUR coincide con l'importo e il tasso è 1.
      amount_base_minor: signed,
      currency: account.currency,
      fx_rate: '1',
      category_id: input.categoryId,
      notes: input.notes.trim(),
    },
  };
}

type EditableFields = Pick<
  Transaction,
  | 'account_id'
  | 'date'
  | 'description'
  | 'amount_minor'
  | 'amount_base_minor'
  | 'currency'
  | 'fx_rate'
  | 'category_id'
  | 'notes'
>;

/** Nuova spesa o entrata. L'importo si inserisce positivo; per le spese viene salvato negativo. */
export function createMovement(
  input: MovementInput,
  ctx: MovementContext,
  now: Date = new Date(),
  newId: IdFactory = () => uuidv7(now.getTime()),
): Result<Transaction, MovementIssue> {
  const fields = buildFields(input, ctx);
  if (!fields.ok) return fields;
  const timestamp = now.toISOString();
  return {
    ok: true,
    value: {
      id: newId(),
      created_at: timestamp,
      updated_at: timestamp,
      deleted: false,
      raw_description: '',
      transfer_group_id: null,
      recurring_rule_id: null,
      import_batch_id: null,
      dedupe_hash: null,
      ...fields.value,
    },
  };
}

/**
 * Modifica una spesa o entrata esistente: mantiene id, creazione e origine (import, ricorrenza).
 * I giroconti non si modificano: si elimina e si ricrea (issue 'transfer').
 */
export function updateMovement(
  existing: Transaction,
  input: MovementInput,
  ctx: MovementContext,
  now: Date = new Date(),
): Result<Transaction, MovementIssue> {
  if (existing.transfer_group_id !== null) return fail<MovementIssue>(['transfer']);
  const fields = buildFields(input, ctx);
  if (!fields.ok) return fields;
  return { ok: true, value: { ...existing, ...fields.value, updated_at: now.toISOString() } };
}

/**
 * Giroconto tra due conti: due movimenti (uscita dal primo, entrata nel secondo) con lo stesso
 * `transfer_group_id`. Sono esclusi dai totali di spese ed entrate.
 */
export function createTransfer(
  input: TransferInput,
  ctx: MovementContext,
  now: Date = new Date(),
  newId: IdFactory = () => uuidv7(now.getTime()),
): Result<[Transaction, Transaction], MovementIssue> {
  const issues: MovementIssue[] = [];
  const amountMinor = checkAmount(input.amountText, issues);
  if (!isIsoDate(input.date)) issues.push('date');
  if (input.fromAccountId === input.toAccountId) issues.push('same_account');
  const from = checkAccount(input.fromAccountId, input.date, ctx, issues);
  const to = checkAccount(input.toAccountId, input.date, ctx, issues);
  if (issues.length > 0 || !from || !to) return fail(issues);

  const timestamp = now.toISOString();
  const groupId = newId();
  const categoryId = ctx.categories.find((c) => c.kind === 'transfer')?.id ?? null;
  const side = (account: Account, signed: number): Transaction => ({
    id: newId(),
    created_at: timestamp,
    updated_at: timestamp,
    deleted: false,
    account_id: account.id,
    date: input.date,
    description: input.description.trim(),
    raw_description: '',
    amount_minor: signed,
    currency: account.currency,
    fx_rate: '1',
    amount_base_minor: signed,
    category_id: categoryId,
    transfer_group_id: groupId,
    recurring_rule_id: null,
    import_batch_id: null,
    dedupe_hash: null,
    notes: '',
  });
  return { ok: true, value: [side(from, -amountMinor), side(to, amountMinor)] };
}
