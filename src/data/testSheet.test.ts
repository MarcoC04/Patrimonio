import { describe, expect, it } from 'vitest';
import { ScriptClient } from './scriptClient';
import { SchemaError } from './rows';
import { appendTestRow, initTestSheet, readTestRows, TEST_HEADERS } from './testSheet';

function clientWith(data: unknown) {
  const bodies: Record<string, unknown>[] = [];
  const fetchFn: typeof fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ ok: true, data }));
  };
  const client = new ScriptClient({
    url: 'https://script.google.com/macros/s/X/exec',
    getKey: () => 'k',
    fetchFn,
  });
  return { client, bodies };
}

describe('testSheet', () => {
  it('readTestRows converte le righe ed esclude quelle con deleted=1', async () => {
    const { client } = clientWith({
      prova: [
        [...TEST_HEADERS],
        ['id1', 't', 't', '0', 'visibile'],
        ['id2', 't', 't', '1', 'cancellata'],
      ],
    });
    const rows = await readTestRows(client);
    expect(rows.map((r) => r.testo)).toEqual(['visibile']);
  });

  it('readTestRows lancia SchemaError se le intestazioni sono sbagliate', async () => {
    const { client } = clientWith({ prova: [['colonna', 'sbagliata']] });
    await expect(readTestRows(client)).rejects.toBeInstanceOf(SchemaError);
  });

  it('appendTestRow fa una sola richiesta con la riga nell’ordine delle intestazioni', async () => {
    const { client, bodies } = clientWith({ appended: [1] });
    const now = new Date('2026-01-02T03:04:05.000Z');

    const row = await appendTestRow(client, 'ciao', now);

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      action: 'append',
      appends: [
        {
          tab: 'prova',
          headers: [...TEST_HEADERS],
          rows: [[row.id, '2026-01-02T03:04:05.000Z', '2026-01-02T03:04:05.000Z', '0', 'ciao']],
        },
      ],
    });
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('initTestSheet invia lo schema della scheda di prova', async () => {
    const { client, bodies } = clientWith({ created: [] });
    await expect(initTestSheet(client)).resolves.toBe(0);
    expect(bodies[0]).toMatchObject({ action: 'init', tabs: { prova: [...TEST_HEADERS] } });
  });
});
