import type { Category } from '../../data/schema';

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
