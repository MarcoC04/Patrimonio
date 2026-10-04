import type { ChangeSet, Dataset, TableChanges } from './repository';

/** Unisce le modifiche a una lista. Le righe cancellate logicamente escono dai dati attivi. */
function mergeTable<T extends { id: string; deleted: boolean }>(
  current: readonly T[],
  changes: TableChanges<T> | undefined,
): T[] {
  if (!changes) return [...current];
  const updated = new Map((changes.update ?? []).map((entity) => [entity.id, entity]));
  const kept = current.flatMap((entity) => {
    const replacement = updated.get(entity.id);
    if (!replacement) return [entity];
    return replacement.deleted ? [] : [replacement];
  });
  const inserted = (changes.insert ?? []).filter((entity) => !entity.deleted);
  return [...kept, ...inserted];
}

/**
 * Applica in memoria un ChangeSet già salvato con successo: evita di rileggere tutto il foglio
 * dopo ogni modifica. Non modifica il dataset di partenza.
 */
export function applyChanges(data: Dataset, changes: ChangeSet): Dataset {
  return {
    accounts: mergeTable(data.accounts, changes.accounts),
    categories: mergeTable(data.categories, changes.categories),
    transactions: mergeTable(data.transactions, changes.transactions),
    fxRates: mergeTable(data.fxRates, changes.fxRates),
    assets: mergeTable(data.assets, changes.assets),
    investmentTransactions: mergeTable(data.investmentTransactions, changes.investmentTransactions),
    priceHistory: mergeTable(data.priceHistory, changes.priceHistory),
    importBatches: mergeTable(data.importBatches, changes.importBatches),
    categorizationRules: mergeTable(data.categorizationRules, changes.categorizationRules),
    meta: { ...data.meta, ...changes.meta },
  };
}
