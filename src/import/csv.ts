/**
 * Lettura di file CSV (RFC 4180) nel browser: campi tra virgolette con "" per la virgoletta,
 * a capo dentro i campi, BOM iniziale, CRLF o LF. Il separatore (virgola, punto e virgola o
 * tabulazione) si riconosce dalla riga di intestazione. Nessun contenuto viene salvato.
 */

export type Delimiter = ',' | ';' | '\t';

/** Sceglie il separatore più frequente fuori dalle virgolette nella prima riga. */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (char === '\n' || char === '\r')) break;
    else if (!inQuotes && char in counts) counts[char as Delimiter] += 1;
  }
  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t';
  return ',';
}

/**
 * `keepBlankRows`: le righe vuote restano come righe senza campi, così l'indice di riga coincide
 * con il numero di riga del file (serve ai messaggi "riga N"). Di norma si scartano.
 */
export function parseCsv(input: string, delimiter?: Delimiter, keepBlankRows = false): string[][] {
  const text = input.startsWith('﻿') ? input.slice(1) : input;
  const separator = delimiter ?? detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;

  const endField = () => {
    row.push(field);
    field = '';
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    // Una riga vuota (un solo campo vuoto e non tra virgolette) non è una riga di dati.
    const isBlank = row.length === 1 && row[0] === '' && !fieldWasQuotedLast;
    if (!isBlank) rows.push(row);
    else if (keepBlankRows) rows.push([]);
    row = [];
  };
  // `fieldWasQuoted` viene azzerato da endField: si ricorda lo stato dell'ultimo campo della riga.
  let fieldWasQuotedLast = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // virgoletta doppia = virgoletta letterale
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') {
      inQuotes = true;
      fieldWasQuoted = true;
    } else if (char === separator) {
      fieldWasQuotedLast = fieldWasQuoted;
      endField();
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      fieldWasQuotedLast = fieldWasQuoted;
      endRow();
    } else {
      field += char;
    }
  }
  // Ultima riga senza a capo finale
  if (field !== '' || row.length > 0 || fieldWasQuoted) {
    fieldWasQuotedLast = fieldWasQuoted;
    endRow();
  }
  return rows;
}
