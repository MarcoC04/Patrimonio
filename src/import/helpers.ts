import { decimalToMinor, toPlainDecimal } from '../domain/decimal';
import { isIsoDate } from '../domain/dates';
import { parseMoney } from '../domain/money';
import { strings } from '../ui/strings';
import { ImportFileError } from './errors';

/** Il file non ha le colonne attese dal formato scelto. Il messaggio elenca solo nomi di colonne. */
export class ImportFormatError extends ImportFileError {
  constructor(missing: readonly string[], formatLabel: string) {
    super(strings.errors.import.missingColumns(missing.join(', '), formatLabel));
    this.name = 'ImportFormatError';
  }
}

const BOM = String.fromCharCode(0xfeff);

/** Intestazione confrontabile: senza BOM, senza spazi ai lati, minuscola, spazi singoli. */
const normalizeHeader = (text: string) =>
  (text.startsWith(BOM) ? text.slice(1) : text).trim().toLowerCase().replace(/\s+/g, ' ');

export interface HeaderMatch {
  /** Indice (da 0) della riga di intestazione nella tabella. */
  headerRow: number;
  /** Indice di colonna per nome normalizzato (minuscolo, spazi singoli). */
  columns: Map<string, number>;
}

/**
 * Cerca nelle prime righe quella di intestazione: la prima che contiene tutte le colonne
 * `required`. Una colonna richiesta può essere data come prefisso (es. "data_opera" accetta
 * "Data_Operazione"), scrivendola con `*` finale. Se non la trova lancia ImportFormatError.
 */
export function findHeader(
  table: readonly (readonly string[])[],
  required: readonly string[],
  formatLabel: string,
  maxRows = 40,
): HeaderMatch {
  const wanted = required.map((name) => normalizeHeader(name));
  // Nei messaggi si usano i nomi come li scrive il formato, non quelli normalizzati.
  const label = (name: string) =>
    required.find((original) => normalizeHeader(original) === name)?.replace(/\*$/, '') ??
    name.replace(/\*$/, '');
  let best: { missing: string[]; count: number } | null = null;

  for (let r = 0; r < Math.min(table.length, maxRows); r++) {
    const cells = (table[r] ?? []).map(normalizeHeader);
    const columns = new Map<string, number>();
    cells.forEach((cell, index) => {
      if (cell !== '' && !columns.has(cell)) columns.set(cell, index);
    });

    const resolve = (name: string): number | undefined => {
      if (name.endsWith('*')) {
        const prefix = name.slice(0, -1);
        const found = cells.findIndex((cell) => cell.startsWith(prefix));
        return found >= 0 ? found : undefined;
      }
      return columns.get(name);
    };

    const missing = wanted.filter((name) => resolve(name) === undefined);
    if (missing.length === 0) {
      // Si espongono le colonne con il nome richiesto (anche per i prefissi).
      const resolved = new Map(columns);
      for (const name of wanted) {
        const index = resolve(name);
        if (index !== undefined) resolved.set(name.replace(/\*$/, ''), index);
      }
      return { headerRow: r, columns: resolved };
    }
    const count = wanted.length - missing.length;
    if (!best || count > best.count) best = { missing: missing.map(label), count };
  }
  throw new ImportFormatError(best?.missing ?? wanted.map(label), formatLabel);
}

/** Valore di una cella della riga per nome di colonna (stringa vuota se la colonna non c'è). */
export function cell(row: readonly string[], header: HeaderMatch, name: string): string {
  const index = header.columns.get(normalizeHeader(name));
  return index === undefined ? '' : (row[index] ?? '').trim();
}

/** True se la colonna esiste nel file. */
export function hasColumn(header: HeaderMatch, name: string): boolean {
  return header.columns.has(normalizeHeader(name));
}

/** "2026-08-29 21:28:10", "2026-09-01T05:52:31Z" o "2026-09-01" → "2026-09-01"; altrimenti null. */
export function isoDatePrefix(text: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T\s]|$)/.exec(text.trim());
  return match && isIsoDate(match[1] ?? '') ? (match[1] ?? null) : null;
}

/** Numero seriale di Excel (giorni dal 30/12/1899) → data ISO. Solo anni plausibili (1954-2119). */
function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/** "30/09/2026" (anche con - o .), oppure un numero seriale di Excel → data ISO; altrimenti null. */
export function italianDate(text: string): string | null {
  const value = text.trim();
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (match) {
    const iso = `${match[3]}-${(match[2] ?? '').padStart(2, '0')}-${(match[1] ?? '').padStart(2, '0')}`;
    return isIsoDate(iso) ? iso : null;
  }
  if (/^\d{5}([.,]\d+)?$/.test(value)) return excelSerialToIso(Number(value.replace(',', '.')));
  return isoDatePrefix(value);
}

/**
 * Importo in formato "tecnico" (punto decimale, come nei CSV di Revolut e Trade Republic:
 * "-9.31", "28.550000") → centesimi con segno. Null se non è un numero. Vuoto = null.
 */
export function technicalAmountToMinor(text: string, exponent = 2): number | null {
  const plain = toPlainDecimal(text);
  if (plain === null) return null;
  return decimalToMinor(plain, exponent);
}

/** Importo scritto all'italiana ("329,73", "-12,5", "1.234,56") → centesimi con segno; null se non valido. */
export function italianAmountToMinor(text: string, exponent = 2): number | null {
  const value = text.trim();
  if (value === '') return null;
  return parseMoney(value, exponent);
}
