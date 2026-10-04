import { describe, expect, it } from 'vitest';
import { buildCsvZipExport, buildJsonExport, tabsToJson, toCsv } from './export';
import { crc32, createZip } from './zip';

describe('toCsv', () => {
  it('righe separate da CRLF, campi da ;', () => {
    expect(
      toCsv([
        ['id', 'nome'],
        ['1', 'Uno'],
      ]),
    ).toBe('id;nome\r\n1;Uno\r\n');
  });

  it('mette tra virgolette i campi con separatore, virgolette o a capo, raddoppiando le virgolette', () => {
    expect(toCsv([['a;b', 'dice "ciao"', 'riga1\nriga2', 'normale']])).toBe(
      '"a;b";"dice ""ciao""";"riga1\nriga2";normale\r\n',
    );
  });

  it('la virgola non va tra virgolette quando il separatore è ;', () => {
    expect(toCsv([['1,5', 'x']])).toBe('1,5;x\r\n');
  });

  it('con separatore virgola quotare i campi che la contengono', () => {
    expect(toCsv([['1,5', 'x']], ',')).toBe('"1,5",x\r\n');
  });

  it('celle vuote e righe vuote restano', () => {
    expect(toCsv([['a', '', 'c'], []])).toBe('a;;c\r\n\r\n');
  });

  it('nessuna riga → stringa vuota', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('tabsToJson', () => {
  const info = { exportedAt: '2026-03-20T10:00:00.000Z', schemaVersion: '1' };

  it('una lista di oggetti per scheda, con i valori testuali del foglio', () => {
    const json = JSON.parse(
      tabsToJson(
        {
          conti: [
            ['id', 'saldo'],
            ['a', '150000'],
            ['b', '-5'],
          ],
          vuota: [['id']],
        },
        info,
      ),
    );
    expect(json).toEqual({
      exported_at: '2026-03-20T10:00:00.000Z',
      schema_version: '1',
      tables: {
        conti: [
          { id: 'a', saldo: '150000' },
          { id: 'b', saldo: '-5' },
        ],
        vuota: [],
      },
    });
  });

  it('una scheda senza righe dà una lista vuota', () => {
    expect(JSON.parse(tabsToJson({ x: [] }, info)).tables.x).toEqual([]);
  });

  it('celle mancanti in fondo alla riga diventano stringa vuota', () => {
    const json = JSON.parse(tabsToJson({ t: [['a', 'b'], ['1']] }, info));
    expect(json.tables.t).toEqual([{ a: '1', b: '' }]);
  });
});

describe('crc32', () => {
  it('valore di controllo standard: CRC32("123456789") = 0xCBF43926', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('dati vuoti → 0', () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

/** Lettore ZIP minimale per i test: legge la central directory e restituisce nome, CRC e contenuto. */
function readZip(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // ignoreBOM: di default TextDecoder scarta il BOM iniziale, ma qui si vuole verificare che ci sia.
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50); // firma di fine archivio
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const entries: { name: string; crc: number; text: string }[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50);
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(zip.slice(cursor + 46, cursor + 46 + nameLength));
    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const start = localOffset + 30 + localNameLength;
    entries.push({ name, crc, text: decoder.decode(zip.slice(start, start + size)) });
    cursor += 46 + nameLength;
  }
  return entries;
}

describe('createZip', () => {
  it('contiene i file con nome e contenuto identici e CRC corretto (anche con accenti)', () => {
    const encoder = new TextEncoder();
    const zip = createZip(
      [
        { name: 'uno.csv', data: encoder.encode('a;b\r\n1;2\r\n') },
        { name: 'è-due.csv', data: encoder.encode('perché;già\r\n') },
      ],
      new Date(2026, 2, 20, 10, 30, 0),
    );
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['uno.csv', 'è-due.csv']);
    expect(entries[0]?.text).toBe('a;b\r\n1;2\r\n');
    expect(entries[1]?.text).toBe('perché;già\r\n');
    for (const entry of entries) {
      expect(entry.crc).toBe(crc32(encoder.encode(entry.text)));
    }
  });

  it('uno zip senza file è valido e vuoto', () => {
    expect(readZip(createZip([]))).toEqual([]);
  });
});

describe('file di esportazione', () => {
  const tabs = {
    accounts: [
      ['id', 'name'],
      ['a1', 'Conto, prova'],
    ],
    categories: [['id', 'name']],
  };
  const now = new Date(2026, 2, 5, 9, 0, 0);

  it('JSON: nome con la data, contenuto leggibile e completo', () => {
    const file = buildJsonExport(tabs, '1', now);
    expect(file.filename).toBe('patrimonio-2026-03-05.json');
    expect(file.mime).toBe('application/json');
    const parsed = JSON.parse(new TextDecoder().decode(file.data));
    expect(parsed.schema_version).toBe('1');
    expect(parsed.tables.accounts).toEqual([{ id: 'a1', name: 'Conto, prova' }]);
    expect(parsed.tables.categories).toEqual([]);
  });

  it('CSV zip: un file .csv per scheda, con BOM UTF-8 per Excel', () => {
    const file = buildCsvZipExport(tabs, now);
    expect(file.filename).toBe('patrimonio-csv-2026-03-05.zip');
    expect(file.mime).toBe('application/zip');
    const entries = readZip(file.data);
    expect(entries.map((e) => e.name)).toEqual(['accounts.csv', 'categories.csv']);
    expect(entries[0]?.text).toBe('﻿id;name\r\na1;Conto, prova\r\n');
  });
});
