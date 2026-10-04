import type { Category, Transaction } from '../data/schema';

/**
 * Un elemento referenziato non si elimina senza riassegnazione (ARCHITECTURE.md §6):
 * questi conteggi dicono cosa lo tiene in vita. Zero ovunque = si può eliminare.
 */

export function accountUsage(
  accountId: string,
  transactions: readonly Pick<Transaction, 'account_id'>[],
): number {
  return transactions.filter((t) => t.account_id === accountId).length;
}

export interface CategoryUsage {
  /** Movimenti che usano la categoria. */
  transactions: number;
  /** Categorie figlie. */
  children: number;
}

export function categoryUsage(
  categoryId: string,
  transactions: readonly Pick<Transaction, 'category_id'>[],
  categories: readonly Pick<Category, 'parent_id'>[],
): CategoryUsage {
  return {
    transactions: transactions.filter((t) => t.category_id === categoryId).length,
    children: categories.filter((c) => c.parent_id === categoryId).length,
  };
}
