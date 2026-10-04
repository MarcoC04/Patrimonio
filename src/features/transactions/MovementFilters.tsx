import { CATEGORY_KINDS, type Category } from '../../data/schema';
import { UNCATEGORIZED, type TransactionFilter } from '../../domain/ledger';
import { Field } from '../../ui/Field';
import { inputClass, secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';
import { categoryPath, sortedCategories } from '../categories/labels';

interface Props {
  filter: TransactionFilter;
  categories: readonly Category[];
  onChange: (filter: TransactionFilter) => void;
}

const checkboxRow = 'flex min-h-11 items-center gap-3 text-sm';

/** Filtri per intervallo di date e per una o più categorie. */
export function MovementFilters({ filter, categories, onChange }: Props) {
  const selected = filter.categoryIds ?? [];

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange({ ...filter, categoryIds: next });
  };

  const summary =
    selected.length === 0
      ? strings.transactions.filters.allCategories
      : strings.transactions.filters.selectedCategories(selected.length);

  return (
    <section aria-label={strings.transactions.filters.title} className="mb-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={strings.transactions.filters.from} htmlFor="filter-from">
          <input
            id="filter-from"
            type="date"
            value={filter.from ?? ''}
            max={filter.to || undefined}
            onChange={(e) => onChange({ ...filter, from: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label={strings.transactions.filters.to} htmlFor="filter-to">
          <input
            id="filter-to"
            type="date"
            value={filter.to ?? ''}
            min={filter.from || undefined}
            onChange={(e) => onChange({ ...filter, to: e.target.value })}
            className={inputClass}
          />
        </Field>
      </div>

      <details className="mb-3 rounded-lg border border-slate-300 bg-white px-3">
        <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium">
          {strings.transactions.filters.categories}: {summary}
        </summary>
        <div className="pb-2">
          <label className={checkboxRow}>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={selected.includes(UNCATEGORIZED)}
              onChange={() => toggle(UNCATEGORIZED)}
            />
            {strings.transactions.filters.uncategorized}
          </label>
          {CATEGORY_KINDS.map((kind) => {
            const list = sortedCategories(categories, kind);
            if (list.length === 0) return null;
            return (
              <fieldset key={kind} className="mt-2">
                <legend className="text-xs font-semibold uppercase text-slate-600">
                  {strings.categories.kinds[kind]}
                </legend>
                {list.map((category) => (
                  <label key={category.id} className={checkboxRow}>
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={selected.includes(category.id)}
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

      <button type="button" className={secondaryButtonClass} onClick={() => onChange({})}>
        {strings.transactions.filters.reset}
      </button>
    </section>
  );
}
