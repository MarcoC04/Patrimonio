import type { Account, Transaction } from '../data/schema';
import { sumMinor } from './money';

/** Valore speciale nel filtro per categoria: i movimenti "da categorizzare". */
export const UNCATEGORIZED = '__none__';

/** I giroconti (due lati con lo stesso transfer_group_id) non sono spese né entrate. */
export function isTransfer(transaction: Pick<Transaction, 'transfer_group_id'>): boolean {
  return transaction.transfer_group_id !== null;
}

/**
 * Saldo di un conto = saldo iniziale + somma di tutti i suoi movimenti (giroconti compresi:
 * spostano denaro tra conti). Importi in centesimi, nella valuta del conto.
 */
export function accountBalanceMinor(
  account: Pick<Account, 'id' | 'opening_balance_minor'>,
  transactions: readonly Pick<Transaction, 'account_id' | 'amount_minor'>[],
): number {
  return sumMinor([
    account.opening_balance_minor,
    ...transactions.filter((t) => t.account_id === account.id).map((t) => t.amount_minor),
  ]);
}

export interface Totals {
  /** Somma delle entrate, in centesimi EUR. */
  incomeMinor: number;
  /** Somma delle spese come valore POSITIVO, in centesimi EUR. */
  expenseMinor: number;
  /** Entrate − spese. */
  netMinor: number;
}

/**
 * Entrate e spese in EUR (snapshot `amount_base_minor`), **esclusi i giroconti**.
 * Un importo positivo è un'entrata, uno negativo una spesa.
 */
export function totalsMinor(
  transactions: readonly Pick<Transaction, 'amount_base_minor' | 'transfer_group_id'>[],
): Totals {
  const real = transactions.filter((t) => !isTransfer(t));
  const incomeMinor = sumMinor(
    real.filter((t) => t.amount_base_minor > 0).map((t) => t.amount_base_minor),
  );
  // Si sommano le spese già rese positive: negare la somma darebbe -0 quando non ce ne sono.
  const expenseMinor = sumMinor(
    real.filter((t) => t.amount_base_minor < 0).map((t) => -t.amount_base_minor),
  );
  return { incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor };
}

export interface TransactionFilter {
  /** Data minima inclusa (YYYY-MM-DD). */
  from?: string;
  /** Data massima inclusa (YYYY-MM-DD). */
  to?: string;
  /** Una o più categorie; UNCATEGORIZED per i movimenti senza categoria. Vuoto o assente = tutte. */
  categoryIds?: readonly string[];
  /** Un solo conto (per compatibilità); per più conti usa `accountIds`. */
  accountId?: string;
  /** Uno o più conti. Vuoto o assente = tutti. */
  accountIds?: readonly string[];
}

/** Applica i filtri insieme (AND). Le date ISO si confrontano come testo. */
export function filterTransactions<
  T extends Pick<Transaction, 'date' | 'category_id' | 'account_id'>,
>(transactions: readonly T[], filter: TransactionFilter): T[] {
  const categories =
    filter.categoryIds && filter.categoryIds.length > 0 ? new Set(filter.categoryIds) : null;
  const accounts =
    filter.accountIds && filter.accountIds.length > 0 ? new Set(filter.accountIds) : null;
  return transactions.filter((t) => {
    if (filter.from && t.date < filter.from) return false;
    if (filter.to && t.date > filter.to) return false;
    if (filter.accountId && t.account_id !== filter.accountId) return false;
    if (accounts && !accounts.has(t.account_id)) return false;
    if (categories && !categories.has(t.category_id ?? UNCATEGORIZED)) return false;
    return true;
  });
}

/** Dal più recente: data, poi creazione, poi id (ordine stabile e deterministico). */
export function sortNewestFirst<T extends Pick<Transaction, 'date' | 'created_at' | 'id'>>(
  transactions: readonly T[],
): T[] {
  return [...transactions].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.created_at.localeCompare(a.created_at) ||
      b.id.localeCompare(a.id),
  );
}
