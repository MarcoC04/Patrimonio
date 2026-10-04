import { describe, expect, it } from 'vitest';
import type { Category } from '../../data/schema';
import { categoryPath, sortedCategories } from './labels';

const TS = '2026-01-02T03:04:05.000Z';
const cat = (
  id: string,
  name: string,
  kind: Category['kind'],
  parent_id: string | null = null,
): Category => ({
  id,
  created_at: TS,
  updated_at: TS,
  deleted: false,
  name,
  parent_id,
  kind,
  color: '',
  icon: '',
});

const all = [
  cat('s', 'Svago', 'expense'),
  cat('a', 'Alimentari', 'expense'),
  cat('bar', 'Bar', 'expense', 'a'),
  cat('sup', 'Supermercato', 'expense', 'a'),
  cat('stip', 'Stipendio', 'income'),
];

describe('categoryPath', () => {
  it('una categoria di primo livello è solo il suo nome', () => {
    expect(categoryPath(all[1] as Category, all)).toBe('Alimentari');
  });
  it('una sottocategoria mostra anche la madre', () => {
    expect(categoryPath(all[2] as Category, all)).toBe('Alimentari › Bar');
  });
});

describe('sortedCategories', () => {
  it('ordina per nome con le figlie subito dopo la madre, solo del tipo richiesto', () => {
    expect(sortedCategories(all, 'expense').map((c) => c.name)).toEqual([
      'Alimentari',
      'Bar',
      'Supermercato',
      'Svago',
    ]);
    expect(sortedCategories(all, 'income').map((c) => c.name)).toEqual(['Stipendio']);
    expect(sortedCategories(all, 'transfer')).toEqual([]);
  });
});
