import { describe, expect, it } from 'vitest';
import { categoryRows } from './categoryRows';

const categories = [
  { id: 'a', name: 'Alimentari' },
  { id: 'b', name: 'Casa' },
  { id: 'c', name: 'Svago' },
];

describe('categoryRows', () => {
  it('dà il nome alle categorie e mantiene l’ordine ricevuto', () => {
    const rows = categoryRows(
      [
        { categoryId: 'b', amountMinor: 5000 },
        { categoryId: 'a', amountMinor: 3000 },
      ],
      categories,
      6,
    );
    expect(rows).toEqual([
      { key: 'b', name: 'Casa', amountMinor: 5000 },
      { key: 'a', name: 'Alimentari', amountMinor: 3000 },
    ]);
  });

  it('senza categoria o con categoria sconosciuta è "Da categorizzare"', () => {
    const rows = categoryRows(
      [
        { categoryId: null, amountMinor: 700 },
        { categoryId: 'cancellata', amountMinor: 200 },
      ],
      categories,
      6,
    );
    expect(rows.map((r) => r.name)).toEqual(['Da categorizzare', 'Da categorizzare']);
  });

  it('oltre il massimo il resto confluisce in "Altre categorie": 20,00 + 10,00 = 30,00 €', () => {
    const rows = categoryRows(
      [
        { categoryId: 'a', amountMinor: 5000 },
        { categoryId: 'b', amountMinor: 2000 },
        { categoryId: 'c', amountMinor: 1000 },
      ],
      categories,
      1,
    );
    expect(rows).toEqual([
      { key: 'a', name: 'Alimentari', amountMinor: 5000 },
      { key: '__others__', name: 'Altre categorie', amountMinor: 3000 },
    ]);
  });

  it('senza dati restituisce un elenco vuoto', () => {
    expect(categoryRows([], categories, 6)).toEqual([]);
  });
});
