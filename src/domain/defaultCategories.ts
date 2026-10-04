import type { Category } from '../data/schema';
import { uuidv7 } from './uuid7';

/** Categorie iniziali, modificabili dall'utente. */
export const DEFAULT_CATEGORIES: readonly { name: string; kind: Category['kind'] }[] = [
  { name: 'Alimentari', kind: 'expense' },
  { name: 'Casa', kind: 'expense' },
  { name: 'Trasporti', kind: 'expense' },
  { name: 'Salute', kind: 'expense' },
  { name: 'Svago', kind: 'expense' },
  { name: 'Ristoranti', kind: 'expense' },
  { name: 'Abbigliamento', kind: 'expense' },
  { name: 'Shopping', kind: 'expense' },
  { name: 'Abbonamenti', kind: 'expense' },
  { name: 'Tasse', kind: 'expense' },
  { name: 'Altro', kind: 'expense' },
  { name: 'Stipendio', kind: 'income' },
  { name: 'Interessi e dividendi', kind: 'income' },
  { name: 'Rimborsi', kind: 'income' },
  { name: 'Altro', kind: 'income' },
  { name: 'Trasferimento', kind: 'transfer' },
];

export function buildDefaultCategories(
  now: Date = new Date(),
  newId: () => string = () => uuidv7(now.getTime()),
): Category[] {
  const timestamp = now.toISOString();
  return DEFAULT_CATEGORIES.map(({ name, kind }) => ({
    id: newId(),
    created_at: timestamp,
    updated_at: timestamp,
    deleted: false,
    name,
    parent_id: null,
    kind,
    color: '',
    icon: '',
  }));
}
