/** Foglio con struttura non valida: l'app non deve scrivere nulla. */
export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}

/**
 * Converte i valori di una scheda (prima riga = intestazioni) in oggetti.
 * Se le intestazioni non coincidono con quelle attese lancia SchemaError.
 * Le celle mancanti in fondo alla riga (Sheets le omette) diventano stringa vuota.
 */
export function rowsToObjects<K extends string>(
  values: readonly (readonly string[])[],
  expectedHeaders: readonly K[],
  sheetName: string,
): Record<K, string>[] {
  const header = values[0] ?? [];
  const matches =
    header.length === expectedHeaders.length && expectedHeaders.every((h, i) => header[i] === h);
  if (!matches) {
    throw new SchemaError(
      `La scheda "${sheetName}" non ha la struttura attesa. Intestazioni attese: ${expectedHeaders.join(', ')}.`,
    );
  }

  return values.slice(1).map((row) => {
    const obj = {} as Record<K, string>;
    expectedHeaders.forEach((h, i) => {
      obj[h] = row[i] ?? '';
    });
    return obj;
  });
}

/** Converte un oggetto in riga, nell'ordine delle intestazioni. */
export function objectToRow<K extends string>(
  obj: Record<K, string>,
  headers: readonly K[],
): string[] {
  return headers.map((h) => obj[h]);
}
