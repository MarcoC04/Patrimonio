import { sha256Hex } from '../domain/dedupe';
import { strings } from '../ui/strings';
import { parseCsv } from './csv';
import { ImportFileError } from './errors';
import { getParser } from './parsers';
import type { ParseResult, ParserId } from './types';
import { readXlsx } from './xlsx';

export interface ProcessedStatement extends ParseResult {
  /** SHA-256 del file: per accorgersi che lo stesso estratto è già stato importato. Non il contenuto. */
  fileHash: string;
}

/** UTF-8 se valido, altrimenti Windows-1252 (alcune banche esportano in quella codifica). */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    // Non è UTF-8: si ripiega su Windows-1252, che legge qualsiasi sequenza di byte.
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/**
 * Legge un estratto conto dalla memoria e ne estrae i movimenti. Il file non viene mai salvato:
 * si leggono i valori e si scarta tutto, tenendo solo l'impronta per il controllo dei doppioni.
 */
export async function processStatement(
  bytes: Uint8Array,
  parserId: ParserId,
): Promise<ProcessedStatement> {
  if (bytes.length === 0) throw new ImportFileError(strings.errors.import.empty);
  const parser = getParser(parserId);
  if (!parser) throw new ImportFileError(strings.errors.import.generic);
  const table =
    parser.fileKind === 'xlsx'
      ? await readXlsx(bytes)
      : // Righe vuote conservate: i numeri di riga mostrati all'utente coincidono con il file.
        parseCsv(decodeText(bytes), undefined, true);
  const result = parser.parse(table);
  return { ...result, fileHash: await sha256Hex(bytes) };
}
