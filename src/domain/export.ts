import { createZip } from './zip';

/** Valori grezzi delle schede, come nel foglio: prima riga = intestazioni, tutto testo. */
export type TabValues = Record<string, string[][]>;

/**
 * CSV (RFC 4180): campi tra virgolette se contengono separatore, virgolette o a capo; le
 * virgolette interne si raddoppiano; righe separate da CRLF. Il separatore predefinito è il
 * punto e virgola, che l'Excel italiano apre direttamente in colonne.
 */
export function toCsv(rows: readonly (readonly string[])[], delimiter = ';'): string {
  const needsQuotes = (field: string) => field.includes(delimiter) || /["\r\n]/.test(field);
  const encode = (field: string) =>
    needsQuotes(field) ? `"${field.replaceAll('"', '""')}"` : field;
  return rows.map((row) => row.map(encode).join(delimiter) + '\r\n').join('');
}

/** JSON leggibile: una lista di oggetti per scheda, con i valori esattamente come nel foglio (testo). */
export function tabsToJson(
  tabs: TabValues,
  info: { exportedAt: string; schemaVersion: string },
): string {
  const tables: Record<string, Record<string, string>[]> = {};
  for (const [name, rows] of Object.entries(tabs)) {
    const [header = [], ...data] = rows;
    tables[name] = data.map((row) =>
      Object.fromEntries(header.map((column, index) => [column, row[index] ?? ''])),
    );
  }
  return JSON.stringify(
    { exported_at: info.exportedAt, schema_version: info.schemaVersion, tables },
    null,
    2,
  );
}

export interface ExportFile {
  filename: string;
  mime: string;
  data: Uint8Array<ArrayBuffer>;
}

const BOM = '﻿'; // Excel riconosce così il CSV come UTF-8 (accenti corretti)

function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function buildJsonExport(
  tabs: TabValues,
  schemaVersion: string,
  now: Date = new Date(),
): ExportFile {
  const json = tabsToJson(tabs, { exportedAt: now.toISOString(), schemaVersion });
  return {
    filename: `patrimonio-${stamp(now)}.json`,
    mime: 'application/json',
    data: new TextEncoder().encode(json),
  };
}

/** Un CSV per scheda dentro un unico file zip. */
export function buildCsvZipExport(tabs: TabValues, now: Date = new Date()): ExportFile {
  const encoder = new TextEncoder();
  const entries = Object.entries(tabs).map(([name, rows]) => ({
    name: `${name}.csv`,
    data: encoder.encode(BOM + toCsv(rows)),
  }));
  return {
    filename: `patrimonio-csv-${stamp(now)}.zip`,
    mime: 'application/zip',
    data: createZip(entries, now),
  };
}
