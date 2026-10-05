import type { Category } from '../../data/schema';
import { categoryColors, palette } from '../../ui/theme';

/** "Alimentari" oppure "Alimentari › Bar" per le sottocategorie. */
export function categoryPath(category: Category, all: readonly Category[]): string {
  const parent = category.parent_id ? all.find((c) => c.id === category.parent_id) : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

/** Categorie di un tipo, ordinate per nome con le figlie dopo la madre. */
export function sortedCategories(all: readonly Category[], kind: Category['kind']): Category[] {
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'it');
  const ofKind = all.filter((c) => c.kind === kind);
  return ofKind
    .filter((c) => c.parent_id === null)
    .sort(byName)
    .flatMap((parent) => [parent, ...ofKind.filter((c) => c.parent_id === parent.id).sort(byName)]);
}

/** Colore stabile di una categoria (dal suo posto nell'elenco); grigio per giroconti e senza categoria. */
export function categoryColorOf(
  categoryId: string | null,
  all: readonly Category[],
  isTransfer = false,
): string {
  if (isTransfer) return categoryColors[categoryColors.length - 1] ?? palette.muted;
  if (categoryId === null) return palette.muted;
  const index = Math.max(
    0,
    all.findIndex((c) => c.id === categoryId),
  );
  // L'ultimo colore (grigio-blu) è riservato ai giroconti.
  return categoryColors[index % (categoryColors.length - 1)] ?? palette.muted;
}
