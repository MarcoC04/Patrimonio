import { CATEGORY_KINDS, type Category } from '../../data/schema';
import { UNCATEGORIZED } from '../../domain/ledger';
import { secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';
import { categoryPath, sortedCategories } from '../categories/labels';

interface Props {
  /** Categorie scelte; vuoto = tutte. UNCATEGORIZED per i movimenti senza categoria. */
  categoryIds: readonly string[];
  categories: readonly Category[];
  onChange: (categoryIds: readonly string[]) => void;
}

const checkboxRow = 'flex min-h-11 items-center gap-3 text-sm';

/** Filtro per una o più categorie (periodo e conti sono nella barra dei filtri condivisa). */
export function MovementFilters({ categoryIds, categories, onChange }: Props) {
  const toggle = (id: string) =>
    onChange(categoryIds.includes(id) ? categoryIds.filter((x) => x !== id) : [...categoryIds, id]);

  const summary =
    categoryIds.length === 0
      ? strings.transactions.filters.allCategories
      : strings.transactions.filters.selectedCategories(categoryIds.length);

  return (
    <section aria-label={strings.transactions.filters.title} className="mb-4 flex flex-col gap-2">
      <details className="rounded-xl border border-control bg-surface-2 px-3">
        <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium">
          {strings.transactions.filters.categories}: {summary}
        </summary>
        <div className="pb-2">
          <label className={checkboxRow}>
            <input
              type="checkbox"
              className="h-5 w-5 accent-accent"
              checked={categoryIds.includes(UNCATEGORIZED)}
              onChange={() => toggle(UNCATEGORIZED)}
            />
            {strings.transactions.filters.uncategorized}
          </label>
          {CATEGORY_KINDS.map((kind) => {
            const list = sortedCategories(categories, kind);
            if (list.length === 0) return null;
            return (
              <fieldset key={kind} className="mt-2">
                <legend className="text-xs font-semibold uppercase text-muted">
                  {strings.categories.kinds[kind]}
                </legend>
                {list.map((category) => (
                  <label key={category.id} className={checkboxRow}>
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-accent"
                      checked={categoryIds.includes(category.id)}
                      onChange={() => toggle(category.id)}
                    />
                    {categoryPath(category, categories)}
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
      </details>

      {categoryIds.length > 0 && (
        <button
          type="button"
          className={`${secondaryButtonClass} self-start`}
          onClick={() => onChange([])}
        >
          {strings.transactions.filters.reset}
        </button>
      )}
    </section>
  );
}
