import { toPlainDecimal } from '../domain/decimal';
import { strings } from '../ui/strings';
import { ImportFileError } from './errors';
import { listZipEntries, readZipEntry, type ZipEntry } from './zipRead';

/**
 * Lettura del primo foglio di un file Excel (.xlsx) in una tabella di testo. Nessuna libreria:
 * un .xlsx è uno ZIP di file XML, e quelli che servono hanno una struttura regolare.
 * Il parsing non usa DOMParser, che non esiste nei Web Worker.
 *
 * Convenzioni della tabella restituita (stringhe, come in un CSV italiano):
 *  - i numeri hanno la virgola decimale ("329,73"), senza rumore da virgola mobile;
 *  - le date in formato numerico di Excel restano il numero seriale ("46295");
 *  - le celle vuote sono stringhe vuote.
 */

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, entity: string) => {
    switch (entity) {
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'amp':
        return '&';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        const code = entity.startsWith('#x')
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : '';
      }
    }
  });
}

/** Testo di un blocco con uno o più <t>…</t> (anche a pezzi, "rich text"); ignora la fonetica. */
function textOf(xml: string): string {
  const withoutPhonetics = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let result = '';
  for (const match of withoutPhonetics.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
    result += decodeEntities(match[1] ?? '');
  }
  return result;
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => textOf(m[1] ?? ''));
}

/** "A" → 0, "B" → 1, "AA" → 26. */
function columnIndex(letters: string): number {
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

/** Il percorso del primo foglio: dal workbook se possibile, altrimenti il "sheetN.xml" più basso. */
async function firstSheetPath(
  bytes: Uint8Array,
  byName: Map<string, ZipEntry>,
): Promise<string | null> {
  const decoder = new TextDecoder();
  const workbook = byName.get('xl/workbook.xml');
  const rels = byName.get('xl/_rels/workbook.xml.rels');
  if (workbook && rels) {
    const workbookXml = decoder.decode(await readZipEntry(bytes, workbook));
    const relsXml = decoder.decode(await readZipEntry(bytes, rels));
    const sheetTag = /<sheet\b[^>]*>/.exec(workbookXml)?.[0];
    const relationshipId = sheetTag ? /\br:id="([^"]+)"/.exec(sheetTag)?.[1] : undefined;
    if (relationshipId) {
      for (const rel of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
        const tag = rel[0];
        if (new RegExp(`\\bId="${relationshipId}"`).test(tag)) {
          const target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
          if (target) {
            const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
            if (byName.has(path)) return path;
          }
        }
      }
    }
  }
  const sheets = [...byName.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1]));
  return sheets[0] ?? null;
}

/** Primo foglio del file Excel come tabella di stringhe. */
export async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const entries = listZipEntries(bytes);
  const byName = new Map(entries.map((entry) => [entry.name, entry] as const));
  if (!byName.has('[Content_Types].xml')) throw new ImportFileError(strings.errors.import.notXlsx);

  const sheetPath = await firstSheetPath(bytes, byName);
  const sheetEntry = sheetPath ? byName.get(sheetPath) : undefined;
  if (!sheetEntry) throw new ImportFileError(strings.errors.import.noSheet);

  const decoder = new TextDecoder();
  const sharedEntry = byName.get('xl/sharedStrings.xml');
  const shared = sharedEntry
    ? parseSharedStrings(decoder.decode(await readZipEntry(bytes, sharedEntry)))
    : [];
  const sheetXml = decoder.decode(await readZipEntry(bytes, sheetEntry));

  const cells = new Map<number, Map<number, string>>();
  let maxColumn = -1;
  let maxRow = -1;
  for (const match of sheetXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attributes = match[1] ?? '';
    const inner = match[2] ?? '';
    const reference = /\br="([A-Z]+)(\d+)"/.exec(attributes);
    if (!reference) continue;
    const column = columnIndex(reference[1] ?? '');
    const row = Number(reference[2]) - 1;
    const type = /\bt="([^"]*)"/.exec(attributes)?.[1] ?? 'n';
    const rawValue = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];

    let value = '';
    if (type === 's') value = shared[Number(rawValue)] ?? '';
    else if (type === 'inlineStr')
      value = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '');
    else if (type === 'str' || type === 'd') value = decodeEntities(rawValue ?? '');
    else if (type === 'b') value = rawValue === '1' ? '1' : '0';
    else if (type === 'n' && rawValue !== undefined) {
      // Numero: virgola decimale all'italiana e niente rumore da virgola mobile.
      const plain = toPlainDecimal(rawValue);
      value = plain === null ? decodeEntities(rawValue) : plain.replace('.', ',');
    }
    // type "e" (errore di formula): cella vuota

    if (row < 0 || column < 0) continue;
    let line = cells.get(row);
    if (!line) {
      line = new Map();
      cells.set(row, line);
    }
    line.set(column, value);
    maxColumn = Math.max(maxColumn, column);
    maxRow = Math.max(maxRow, row);
  }

  const table: string[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    const line = cells.get(r);
    table.push(Array.from({ length: maxColumn + 1 }, (_, c) => line?.get(c) ?? ''));
  }
  return table;
}
