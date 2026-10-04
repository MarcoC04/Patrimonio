import type { Account, Category, Transaction } from '../data/schema';
import { isIsoDate } from './dates';
import { toBaseMinor } from './fx';
import { BASE_CURRENCY, minorExponent, parseMoney } from './money';
import { fail, type Result } from './result';
import { uuidv7 } from './uuid7';

export type MovementKind = 'expense' | 'income';

export type MovementIssue =
  | 'amount'
  | 'date'
  | 'account'
  | 'currency'
  | 'currency_mismatch'
  | 'fx_rate'
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
  /**
   * Tasso "1 EUR = fxRate unità della valuta del conto" alla data del movimento (testo decimale).
   * Obbligatorio per i conti non in EUR; ignorato per quelli in EUR.
   */
  fxRate?: string;
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amountText: string;
  date: string;
  description: string;
  /** Come in MovementInput: obbligatorio se i due conti non sono in EUR. */
  fxRate?: string;
}

export interface MovementContext {
  /** Conti attivi (non cancellati). */
  accounts: readonly Account[];
  categories: readonly Category[];
}

type IdFactory = () => string;

/** Ordine dei messaggi: quello dei campi del modulo, non quello in cui il codice li scopre. */
const ISSUE_ORDER: readonly MovementIssue[] = [
  'amount',
  'date',
  'account',
  'same_account',
  'currency',
  'currency_mismatch',
  'fx_rate',
  'before_opening',
  'category',
  'transfer',
];

function failWith(issues: MovementIssue[]) {
  return fail([...issues].sort((a, b) => ISSUE_ORDER.indexOf(a) - ISSUE_ORDER.indexOf(b)));
}

const POSITIVE_DECIMAL = /^\d+(\.\d+)?$/;

/** Senza conto non si sa quanti decimali ha la valuta: si controlla almeno che sia un importo positivo. */
function amountLooksInvalid(text: string): boolean {
  const minor = parseMoney(text);
  return minor === null || minor <= 0;
}

function exponentOf(currency: string): number | null {
  try {
    return minorExponent(currency);
  } catch {
    // Codice valuta non riconosciuto (dato rovinato nel foglio): il movimento non si può registrare.
    return null;
  }
}

function checkAccount(
  accountId: string,
  date: string,
  ctx: MovementContext,
  issues: MovementIssue[],
): { account: Account; exponent: number } | null {
  const account = ctx.accounts.find((a) => a.id === accountId);
  if (!account) {
    issues.push('account');
    return null;
  }
  const exponent = exponentOf(account.currency);
  if (exponent === null) {
    issues.push('currency');
    return null;
  }
  if (isIsoDate(date) && date < account.opening_date) issues.push('before_opening');
  return { account, exponent };
}

/** Importo positivo in centesimi della valuta del conto (con i suoi decimali), o 'amount'. */
function checkAmount(text: string, exponent: number, issues: MovementIssue[]): number {
  const minor = parseMoney(text, exponent);
  if (minor === null || minor <= 0) {
    issues.push('amount');
    return 0;
  }
  return minor;
}

/** Tasso da salvare: '1' per l'EUR; per le altre valute quello fornito, che deve essere valido. */
function checkRate(currency: string, fxRate: string | undefined, issues: MovementIssue[]): string {
  if (currency === BASE_CURRENCY) return '1';
  if (fxRate === undefined || !POSITIVE_DECIMAL.test(fxRate) || !/[1-9]/.test(fxRate)) {
    issues.push('fx_rate');
    return '1';
  }
  return fxRate;
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

/** Campi modificabili di un movimento semplice, già validati, col segno giusto e con lo snapshot in EUR. */
function buildFields(
  input: MovementInput,
  ctx: MovementContext,
): Result<EditableFields, MovementIssue> {
  const issues: MovementIssue[] = [];
  if (!isIsoDate(input.date)) issues.push('date');
  const checked = checkAccount(input.accountId, input.date, ctx, issues);
  checkCategory(input.categoryId, input.kind, ctx, issues);
  if (!checked) {
    // Senza conto non si può leggere l'importo (dipende dai decimali della valuta).
    return failWith(amountLooksInvalid(input.amountText) ? [...issues, 'amount'] : issues);
  }
  const { account, exponent } = checked;
  const amountMinor = checkAmount(input.amountText, exponent, issues);
  const rate = checkRate(account.currency, input.fxRate, issues);
  if (issues.length > 0) return failWith(issues);

  const signed = input.kind === 'expense' ? -amountMinor : amountMinor;
  return {
    ok: true,
    value: {
      account_id: account.id,
      date: input.date,
      description: input.description.trim(),
      amount_minor: signed,
      // Snapshot in EUR al tasso della data: i report storici non cambiano retroattivamente.
      amount_base_minor: toBaseMinor(signed, rate, exponent),
      currency: account.currency,
      fx_rate: rate,
      category_id: input.categoryId,
      notes: input.notes.trim(),
    },
  };
}

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
 * Giroconto tra due conti nella stessa valuta: due movimenti (uscita dal primo, entrata nel
 * secondo) con lo stesso `transfer_group_id`. Sono esclusi dai totali di spese ed entrate.
 * Tra valute diverse servirebbero due importi: per ora non è previsto ('currency_mismatch').
 */
export function createTransfer(
  input: TransferInput,
  ctx: MovementContext,
  now: Date = new Date(),
  newId: IdFactory = () => uuidv7(now.getTime()),
): Result<[Transaction, Transaction], MovementIssue> {
  const issues: MovementIssue[] = [];
  if (!isIsoDate(input.date)) issues.push('date');
  if (input.fromAccountId === input.toAccountId) issues.push('same_account');
  const from = checkAccount(input.fromAccountId, input.date, ctx, issues);
  const to = checkAccount(input.toAccountId, input.date, ctx, issues);
  if (from && to && from.account.currency !== to.account.currency) issues.push('currency_mismatch');
  if (!from || !to) {
    return failWith(amountLooksInvalid(input.amountText) ? [...issues, 'amount'] : issues);
  }
  const amountMinor = checkAmount(input.amountText, from.exponent, issues);
  const rate = checkRate(from.account.currency, input.fxRate, issues);
  if (issues.length > 0) return failWith(issues);

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
    fx_rate: rate,
    // L'arrotondamento è simmetrico: le due basi in EUR si annullano esattamente.
    amount_base_minor: toBaseMinor(signed, rate, from.exponent),
    category_id: categoryId,
    transfer_group_id: groupId,
    recurring_rule_id: null,
    import_batch_id: null,
    dedupe_hash: null,
    notes: '',
  });
  return { ok: true, value: [side(from.account, -amountMinor), side(to.account, amountMinor)] };
}
