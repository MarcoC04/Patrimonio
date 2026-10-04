import { describe, expect, it } from 'vitest';
import { objectToRow, rowsToObjects, SchemaError } from './rows';

const HEADERS = ['id', 'testo', 'deleted'] as const;

describe('rowsToObjects', () => {
  it('converte le righe in oggetti usando le intestazioni', () => {
    const values = [
      ['id', 'testo', 'deleted'],
      ['a', 'uno', '0'],
      ['b', 'due', '1'],
    ];
    expect(rowsToObjects(values, HEADERS, 'prova')).toEqual([
      { id: 'a', testo: 'uno', deleted: '0' },
      { id: 'b', testo: 'due', deleted: '1' },
    ]);
  });

  it('riempie con stringa vuota le celle finali omesse da Sheets', () => {
    const values = [['id', 'testo', 'deleted'], ['a']];
    expect(rowsToObjects(values, HEADERS, 'prova')).toEqual([{ id: 'a', testo: '', deleted: '' }]);
  });

  it('restituisce un array vuoto se ci sono solo le intestazioni', () => {
    expect(rowsToObjects([['id', 'testo', 'deleted']], HEADERS, 'prova')).toEqual([]);
  });

  it('lancia SchemaError se le intestazioni sono diverse o in ordine diverso', () => {
    expect(() => rowsToObjects([['id', 'deleted', 'testo']], HEADERS, 'prova')).toThrow(
      SchemaError,
    );
    expect(() => rowsToObjects([['id', 'testo']], HEADERS, 'prova')).toThrow(SchemaError);
  });

  it('lancia SchemaError se la scheda è vuota', () => {
    expect(() => rowsToObjects([], HEADERS, 'prova')).toThrow(/"prova"/);
  });
});

describe('objectToRow', () => {
  it("ordina i valori secondo l'ordine delle intestazioni", () => {
    expect(objectToRow({ deleted: '0', id: 'a', testo: 'uno' }, HEADERS)).toEqual([
      'a',
      'uno',
      '0',
    ]);
  });
});
