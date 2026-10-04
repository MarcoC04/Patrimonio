import type { Category } from '../../data/schema';
import { limitSpend, type CategorySpend } from '../../domain/dashboard';
import { strings } from '../../ui/strings';

export interface CategoryRow {
  key: string;
  name: string;
  amountMinor: number;
}

/**
 * Righe per i grafici per categoria: le prime `max` con il nome della categoria, poi "Altre
 * categorie" con la somma del resto. Senza categoria (o categoria cancellata): "Da categorizzare".
 */
export function categoryRows(
  spend: readonly CategorySpend[],
  categories: readonly Pick<Category, 'id' | 'name'>[],
  max: number,
): CategoryRow[] {
  const names = new Map(categories.map((c) => [c.id, c.name] as const));
  const { top, othersMinor } = limitSpend(spend, max);
  const rows = top.map((item) => ({
    key: item.categoryId ?? '__none__',
    name:
      (item.categoryId ? names.get(item.categoryId) : undefined) ??
      strings.dashboard.categories.uncategorized,
    amountMinor: item.amountMinor,
  }));
  if (othersMinor > 0) {
    rows.push({
      key: '__others__',
      name: strings.dashboard.categories.others,
      amountMinor: othersMinor,
    });
  }
  return rows;
}
