import { uuidv7 } from '../domain/uuid7';
import type { ScriptClient } from './scriptClient';
import { objectToRow, rowsToObjects } from './rows';

/** Scheda di prova della Fase 0: verrà sostituita dalle schede vere in Fase 1. */
export const TEST_TAB = 'prova';
export const TEST_HEADERS = ['id', 'created_at', 'updated_at', 'deleted', 'testo'] as const;

export type TestRow = Record<(typeof TEST_HEADERS)[number], string>;

/** Crea la scheda se manca. Restituisce quante schede ha creato (0 se c'era già). */
export function initTestSheet(client: ScriptClient): Promise<number> {
  return client.init({ [TEST_TAB]: TEST_HEADERS });
}

/** Legge le righe, valida le intestazioni ed esclude quelle con deleted=1. */
export async function readTestRows(client: ScriptClient): Promise<TestRow[]> {
  const tabs = await client.read([TEST_TAB]);
  const values = tabs[TEST_TAB] ?? [];
  return rowsToObjects(values, TEST_HEADERS, TEST_TAB).filter((row) => row.deleted !== '1');
}

/** Aggiunge una riga con una sola richiesta; lo script rifiuta la scrittura se le intestazioni non coincidono. */
export async function appendTestRow(
  client: ScriptClient,
  text: string,
  now: Date = new Date(),
): Promise<TestRow> {
  const timestamp = now.toISOString();
  const row: TestRow = {
    id: uuidv7(now.getTime()),
    created_at: timestamp,
    updated_at: timestamp,
    deleted: '0',
    testo: text,
  };
  await client.append([
    { tab: TEST_TAB, headers: TEST_HEADERS, rows: [objectToRow(row, TEST_HEADERS)] },
  ]);
  return row;
}
