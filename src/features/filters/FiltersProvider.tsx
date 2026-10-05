import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { todayIso } from '../../domain/dates';
import {
  DEFAULT_PERIOD,
  resolvePeriod,
  type DateRange,
  type PeriodFilter,
} from '../../domain/period';

/**
 * Filtri condivisi tra dashboard e movimenti: periodo e conti. Restano in memoria finché l'app
 * è aperta (non si salvano: sono preferenze di consultazione, non dati).
 */
interface FiltersApi {
  period: PeriodFilter;
  /** Conti scelti; vuoto = tutti. */
  accountIds: readonly string[];
  /** Intervallo di date che corrisponde al periodo scelto, oggi compreso. */
  range: DateRange;
  setPeriod(period: PeriodFilter): void;
  setAccountIds(ids: readonly string[]): void;
  reset(): void;
  /** True se i filtri sono diversi da quelli di partenza. */
  isFiltered: boolean;
}

const FiltersContext = createContext<FiltersApi | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<PeriodFilter>(DEFAULT_PERIOD);
  const [accountIds, setAccountIds] = useState<readonly string[]>([]);

  const reset = useCallback(() => {
    setPeriod(DEFAULT_PERIOD);
    setAccountIds([]);
  }, []);

  const api = useMemo<FiltersApi>(
    () => ({
      period,
      accountIds,
      range: resolvePeriod(period, todayIso()),
      setPeriod,
      setAccountIds,
      reset,
      isFiltered: period.preset !== DEFAULT_PERIOD.preset || accountIds.length > 0,
    }),
    [period, accountIds, reset],
  );
  return <FiltersContext.Provider value={api}>{children}</FiltersContext.Provider>;
}

export function useFilters(): FiltersApi {
  const api = useContext(FiltersContext);
  if (!api) throw new Error('useFilters va usato dentro FiltersProvider.');
  return api;
}
