import { crc32 } from '../../domain/zip';

/**
 * Solo per i test: costruisce un file .xlsx sintetico (ZIP di XML) con celle di testo e numeri,
 * per provare il lettore senza file reali. Può comprimere con deflate come fa Excel.
 */

export type Cell = string | number | null;

export interface XlsxOptions {
  /** true (predefinito): deflate come Excel; false: nessuna compressione. */
  deflate?: boolean;
  /** true (predefinito): testi in sharedStrings.xml; false: testi nelle celle (inlineStr). */
  sharedStrings?: boolean;
  /** Righe di un secondo foglio, che il lettore deve ignorare. */
  secondSheet?: Cell[][];
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function columnLetters(index: number): string {
  let letters = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function sheetXml(rows: Cell[][], strings: string[] | null): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          if (cell === null) return '';
          const ref = `${columnLetters(c)}${r + 1}`;
          if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
          if (strings) {
            let index = strings.indexOf(cell);
            if (index < 0) {
              strings.push(cell);
              index = strings.length - 1;
            }
            return `<c r="${ref}" t="s"><v>${index}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface Entry {
  name: string;
  data: Uint8Array;
}

async function zip(entries: Entry[], deflate: boolean): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const method = deflate ? 8 : 0;
    const stored = deflate ? await deflateRaw(entry.data) : entry.data;
    const crc = crc32(entry.data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, stored.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, stored);

    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(10, method, true);
    header.setUint32(16, crc, true);
    header.setUint32(20, stored.length, true);
    header.setUint32(24, entry.data.length, true);
    header.setUint16(28, name.length, true);
    header.setUint32(42, offset, true);
    central.push(new Uint8Array(header.buffer), name);
    offset += 30 + name.length + stored.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const result = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  for (const part of all) {
    result.set(part, position);
    position += part.length;
  }
  return result;
}

export async function buildXlsx(rows: Cell[][], options: XlsxOptions = {}): Promise<Uint8Array> {
  const { deflate = true, sharedStrings = true, secondSheet } = options;
  const encoder = new TextEncoder();
  const strings: string[] | null = sharedStrings ? [] : null;

  const sheet1 = sheetXml(rows, strings);
  const sheet2 = secondSheet ? sheetXml(secondSheet, strings) : null;

  const entries: Entry[] = [
    {
      name: '[Content_Types].xml',
      data: encoder.encode(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: encoder.encode(
        '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
          '<sheet name="Foglio1" sheetId="1" r:id="rId1"/>' +
          (sheet2 ? '<sheet name="Foglio2" sheetId="2" r:id="rId2"/>' : '') +
          '</sheets></workbook>',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encoder.encode(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/>' +
          (sheet2
            ? '<Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/>'
            : '') +
          '</Relationships>',
      ),
    },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheet1) },
  ];
  if (sheet2) entries.push({ name: 'xl/worksheets/sheet2.xml', data: encoder.encode(sheet2) });
  if (strings) {
    const items = strings
      .map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`)
      .join('');
    entries.push({
      name: 'xl/sharedStrings.xml',
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${items}</sst>`,
      ),
    });
  }
  return zip(entries, deflate);
}
