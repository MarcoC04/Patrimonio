import { describe, expect, it } from 'vitest';
import { createZip } from '../domain/zip';
import { ImportFileError } from './errors';
import { buildXlsx } from './testing/xlsxBuilder';
import { readXlsx } from './xlsx';

// Dati sintetici inventati.
const rows = [
  ['Data_Operazione', 'Entrate', 'Uscite', 'Descrizione'],
  ['30/09/2026', 329.73, null, 'Bonifico SEPA Estero'],
  ['29/09/2026', null, -12.5, 'Pagamento POS'],
];
const expected = [
  ['Data_Operazione', 'Entrate', 'Uscite', 'Descrizione'],
  ['30/09/2026', '329,73', '', 'Bonifico SEPA Estero'],
  ['29/09/2026', '', '-12,5', 'Pagamento POS'],
];

describe('readXlsx', () => {
  it('legge testi e numeri; i numeri hanno la virgola decimale e le celle vuote sono ""', async () => {
    expect(await readXlsx(await buildXlsx(rows))).toEqual(expected);
  });

  it('funziona con file compressi (deflate, come Excel) e non compressi', async () => {
    expect(await readXlsx(await buildXlsx(rows, { deflate: true }))).toEqual(expected);
    expect(await readXlsx(await buildXlsx(rows, { deflate: false }))).toEqual(expected);
  });

  it('legge anche i testi scritti dentro le celle (inlineStr), senza sharedStrings', async () => {
    expect(await readXlsx(await buildXlsx(rows, { sharedStrings: false }))).toEqual(expected);
  });

  it('decodifica &, <, > e virgolette; accenti e caratteri speciali restano', async () => {
    const table = await readXlsx(
      await buildXlsx([['Descrizione'], ['Caffè & cornetto <bar> "Roma"']]),
    );
    expect(table[1]).toEqual(['Caffè & cornetto <bar> "Roma"']);
  });

  it('i numeri non portano il rumore della virgola mobile: 329,73000000000002 → 329,73', async () => {
    const table = await readXlsx(await buildXlsx([['Importo'], [329.73000000000002], [-0.1]]));
    expect(table).toEqual([['Importo'], ['329,73'], ['-0,1']]);
  });

  it('le date numeriche di Excel restano il numero seriale', async () => {
    const table = await readXlsx(await buildXlsx([['Data'], [46295]]));
    expect(table[1]).toEqual(['46295']);
  });

  it('le celle mancanti in mezzo alla riga diventano vuote e le righe hanno tutte la stessa larghezza', async () => {
    const table = await readXlsx(await buildXlsx([['a', 'b', 'c'], [null, 'x', null], ['y']]));
    expect(table).toEqual([
      ['a', 'b', 'c'],
      ['', 'x', ''],
      ['y', '', ''],
    ]);
  });

  it('legge solo il primo foglio', async () => {
    const table = await readXlsx(
      await buildXlsx([['primo']], { secondSheet: [['secondo'], ['altro']] }),
    );
    expect(table).toEqual([['primo']]);
  });

  it('un testo rifiutato come Excel dà un errore chiaro, senza mostrarne il contenuto', async () => {
    const notExcel = new TextEncoder().encode('Data,Importo\n2026-01-01,5\n');
    const error = await readXlsx(notExcel).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportFileError);
    expect((error as Error).message).toMatch(/Excel/);
    expect((error as Error).message).not.toContain('Importo');
  });

  it('uno ZIP che non è un Excel (senza [Content_Types].xml) è rifiutato', async () => {
    const zip = createZip([{ name: 'altro.txt', data: new TextEncoder().encode('ciao') }]);
    await expect(readXlsx(zip)).rejects.toBeInstanceOf(ImportFileError);
  });

  it('un file troncato è rifiutato', async () => {
    const good = await buildXlsx(rows);
    await expect(readXlsx(good.subarray(0, 40))).rejects.toBeInstanceOf(ImportFileError);
  });
});
