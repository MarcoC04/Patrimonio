import type { Account } from '../../data/schema';
import { PERIOD_PRESETS, type PeriodPreset } from '../../domain/period';
import { inputClass, secondaryButtonClass, segmentClass } from '../../ui/styles';
import { strings } from '../../ui/strings';
import { useFilters } from './FiltersProvider';

const t = strings.filters;

/** Scelta del periodo (pulsanti) e dei conti (selezione multipla). Valgono per dashboard e movimenti. */
export function FilterBar({ accounts }: { accounts: readonly Account[] }) {
  const { period, accountIds, setPeriod, setAccountIds, reset, isFiltered } = useFilters();
  const visible = accounts.filter((a) => !a.is_archived || accountIds.includes(a.id));

  const toggleAccount = (id: string) =>
    setAccountIds(
      accountIds.includes(id) ? accountIds.filter((x) => x !== id) : [...accountIds, id],
    );

  return (
    <section aria-label={t.title} className="card mb-4 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div
          role="group"
          aria-label={t.period}
          className="flex max-w-full flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1"
        >
          {PERIOD_PRESETS.map((preset: PeriodPreset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={period.preset === preset}
              className={segmentClass(period.preset === preset)}
              onClick={() => setPeriod({ ...period, preset })}
            >
              {t.presets[preset]}
            </button>
          ))}
        </div>

        {isFiltered && (
          <button type="button" className={`${secondaryButtonClass} ml-auto`} onClick={reset}>
            {t.reset}
          </button>
        )}
      </div>

      {period.preset === 'custom' && (
        <div className="mt-3 grid max-w-md grid-cols-2 gap-3 [&>*]:min-w-0">
          <div>
            <label htmlFor="filter-from" className="mb-1 block text-xs font-medium">
              {t.from}
            </label>
            <input
              id="filter-from"
              type="date"
              value={period.from}
              max={period.to || undefined}
              onChange={(e) => setPeriod({ ...period, from: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="filter-to" className="mb-1 block text-xs font-medium">
              {t.to}
            </label>
            <input
              id="filter-to"
              type="date"
              value={period.to}
              min={period.from || undefined}
              onChange={(e) => setPeriod({ ...period, to: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {visible.length > 0 && (
        <div role="group" aria-label={t.accounts} className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={accountIds.length === 0}
            className={chip(accountIds.length === 0)}
            onClick={() => setAccountIds([])}
          >
            {accountIds.length === 0 && <Check />}
            {t.allAccounts}
          </button>
          {visible.map((account) => {
            const active = accountIds.includes(account.id);
            return (
              <button
                key={account.id}
                type="button"
                aria-pressed={active}
                className={chip(active)}
                onClick={() => toggleAccount(account.id)}
              >
                {active && <Check />}
                {account.name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Check() {
  return (
    <span aria-hidden="true" className="text-accent">
      ✓
    </span>
  );
}

/** Chip a scelta: selezionata = riempita e con la spunta (non solo il colore cambia). */
const chip = (active: boolean) =>
  `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${
    active
      ? 'border-accent bg-accent/15 font-semibold text-fg'
      : 'border-control bg-surface-2 text-muted hover:text-fg'
  }`;
