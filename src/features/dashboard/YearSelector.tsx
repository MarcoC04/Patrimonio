import { strings } from '../../ui/strings';

/** Scelta dell'anno: pulsanti affiancati, quello attivo pieno e con `aria-pressed`. */
export function YearSelector({
  years,
  selected,
  currentYear,
  onSelect,
}: {
  years: readonly number[];
  selected: number;
  currentYear: number;
  onSelect: (year: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label={strings.dashboard.year.groupLabel}
      className="flex gap-2 overflow-x-auto"
    >
      {years.map((year) => {
        const active = year === selected;
        return (
          <button
            key={year}
            type="button"
            aria-pressed={active}
            aria-label={
              year === currentYear ? `${year} (${strings.dashboard.year.current})` : String(year)
            }
            onClick={() => onSelect(year)}
            className={`min-h-11 min-w-20 shrink-0 rounded-xl border px-4 text-sm font-semibold ${
              active
                ? 'border-accent bg-accent text-on-accent'
                : 'border-line bg-surface-2 text-fg hover:bg-line-soft'
            }`}
          >
            {year}
          </button>
        );
      })}
    </div>
  );
}
