import type { Account } from '../data/schema';
import { isSupportedCurrency } from './currencies';
import { isIsoDate } from './dates';
import { minorExponent, parseMoney } from './money';
import { fail, type Result } from './result';
import { uuidv7 } from './uuid7';

export type AccountIssue = 'name' | 'name_taken' | 'currency' | 'opening_balance' | 'opening_date';

export interface AccountInput {
  name: string;
  institution: string;
  type: Account['type'];
  /** Codice a 3 lettere (EUR, USD, …). Si sceglie alla creazione e poi non cambia. */
  currency: string;
  /** Saldo iniziale scritto dall'utente ("1.500,00", anche negativo); vuoto = 0. */
  openingBalanceText: string;
  openingDate: string;
}

function resolve(
  input: AccountInput,
  others: readonly Account[],
): Result<
  Pick<
    Account,
    'name' | 'institution' | 'type' | 'currency' | 'opening_balance_minor' | 'opening_date'
  >,
  AccountIssue
> {
  const issues: AccountIssue[] = [];
  const name = input.name.trim();
  if (name === '') issues.push('name');
  else if (others.some((a) => a.name.trim().toLowerCase() === name.toLowerCase())) {
    issues.push('name_taken');
  }

  if (!isSupportedCurrency(input.currency)) issues.push('currency');

  // Il saldo si legge con i decimali della valuta del conto (JPY: nessuno).
  const exponent = isSupportedCurrency(input.currency) ? minorExponent(input.currency) : 2;
  const balanceText = input.openingBalanceText.trim();
  const balance = balanceText === '' ? 0 : parseMoney(balanceText, exponent);
  if (balance === null) issues.push('opening_balance');
  if (!isIsoDate(input.openingDate)) issues.push('opening_date');
  if (issues.length > 0 || balance === null) return fail(issues);

  return {
    ok: true,
    value: {
      name,
      institution: input.institution.trim(),
      type: input.type,
      currency: input.currency,
      opening_balance_minor: balance,
      opening_date: input.openingDate,
    },
  };
}

/** `existing`: conti attivi, per controllare che il nome non sia già usato. */
export function createAccount(
  input: AccountInput,
  existing: readonly Account[],
  now: Date = new Date(),
  newId: () => string = () => uuidv7(now.getTime()),
): Result<Account, AccountIssue> {
  const fields = resolve(input, existing);
  if (!fields.ok) return fields;
  const timestamp = now.toISOString();
  return {
    ok: true,
    value: {
      id: newId(),
      created_at: timestamp,
      updated_at: timestamp,
      deleted: false,
      is_archived: false,
      ...fields.value,
    },
  };
}

/**
 * Modifica un conto. La valuta non cambia mai: i movimenti già registrati sono nella sua valuta
 * e il loro snapshot in EUR è calcolato con i tassi di allora.
 */
export function updateAccount(
  account: Account,
  input: AccountInput,
  existing: readonly Account[],
  now: Date = new Date(),
): Result<Account, AccountIssue> {
  const fields = resolve(
    { ...input, currency: account.currency },
    existing.filter((a) => a.id !== account.id),
  );
  if (!fields.ok) return fields;
  return { ok: true, value: { ...account, ...fields.value, updated_at: now.toISOString() } };
}

/** Archivia o ripristina: un conto archiviato sparisce dalle scelte ma i suoi movimenti restano. */
export function setArchived(account: Account, archived: boolean, now: Date = new Date()): Account {
  return { ...account, is_archived: archived, updated_at: now.toISOString() };
}
