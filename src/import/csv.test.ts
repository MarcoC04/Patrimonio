import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from './csv';

describe('parseCsv', () => {
  it('righe e campi semplici', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('CRLF e ultima riga senza a capo', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('campi tra virgolette con virgole, virgolette doppie e a capo dentro', () => {
    const csv = 'nome,nota\n"Rossi, Mario","ha detto ""ciao"""\n"riga1\nriga2",x\n';
    expect(parseCsv(csv)).toEqual([
      ['nome', 'nota'],
      ['Rossi, Mario', 'ha detto "ciao"'],
      ['riga1\nriga2', 'x'],
    ]);
  });

  it('campi vuoti all’inizio, in mezzo e in fondo', () => {
    expect(parseCsv('a,,c,\n,,,\n')).toEqual([
      ['a', '', 'c', ''],
      ['', '', '', ''],
    ]);
  });

  it('toglie il BOM iniziale', () => {
    expect(parseCsv('﻿a,b\n1,2')[0]).toEqual(['a', 'b']);
  });

  it('ignora le righe completamente vuote', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('con keepBlankRows le righe vuote restano, così gli indici coincidono con le righe del file', () => {
    const rows = parseCsv('a,b\n\n1,2\n', undefined, true);
    expect(rows).toEqual([['a', 'b'], [], ['1', '2']]);
    expect(rows[2]).toEqual(['1', '2']); // terza riga del file = indice 2
  });

  it('un campo vuoto tra virgolette non è una riga vuota', () => {
    expect(parseCsv('a\n""\nb')).toEqual([['a'], [''], ['b']]);
  });

  it('testo vuoto → nessuna riga', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('riconosce il punto e virgola e la tabulazione', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('con il punto e virgola, le virgole decimali non separano', () => {
    expect(parseCsv('data;importo\n30/09/2026;329,73')).toEqual([
      ['data', 'importo'],
      ['30/09/2026', '329,73'],
    ]);
  });

  it('una virgoletta dentro un campo non quotato resta letterale', () => {
    expect(parseCsv('a,5" tubo,c')).toEqual([['a', '5" tubo', 'c']]);
  });

  it('le intestazioni tra virgolette di Trade Republic si leggono come testo semplice', () => {
    const header = 'datetime,"date","account_type","category","type"';
    expect(parseCsv(header)).toEqual([['datetime', 'date', 'account_type', 'category', 'type']]);
  });
});

describe('detectDelimiter', () => {
  it('conta solo fuori dalle virgolette e solo nella prima riga', () => {
    expect(detectDelimiter('"a;b;c",d,e\n1;2;3')).toBe(',');
    expect(detectDelimiter('a;b;c\n1,2,3')).toBe(';');
    expect(detectDelimiter('solo testo')).toBe(',');
  });
});
