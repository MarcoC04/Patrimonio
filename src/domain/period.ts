import { addDaysIso, addMonthsIso, isIsoDate } from './dates';

/**
 * Periodo scelto nei filtri (condiviso tra dashboard e movimenti). I periodi "mobili" (1M, 3M…)
 * finiscono oggi; "Max" non ha limite iniziale; il periodo personalizzato usa le date scelte.
 */
export const PERIOD_PRESETS = ['1M', '3M', '6M', 'YTD', '1A', 'MAX', 'custom'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface PeriodFilter {
  preset: PeriodPreset;
  /** Solo per `custom`: date ISO, vuote = nessun limite (la fine, se vuota, è oggi). */
  from: string;
  to: string;
}

export interface DateRange {
  /** Primo giorno incluso; null = dall'inizio. */
  from: string | null;
  /** Ultimo giorno incluso. */
  to: string;
}

export const DEFAULT_PERIOD: PeriodFilter = { preset: '1A', from: '', to: '' };

/**
 * Intervallo di date del periodo, rispetto a `today`.
 * 1M = dal giorno dopo, un mese fa (mese compreso tra oggi e lo stesso giorno del mese scorso),
 * e così 3M, 6M e 1A. YTD = dal 1° gennaio dell'anno in corso.
 */
export function resolvePeriod(period: PeriodFilter, today: string): DateRange {
  switch (period.preset) {
    case '1M':
      return { from: addDaysIso(addMonthsIso(today, -1), 1), to: today };
    case '3M':
      return { from: addDaysIso(addMonthsIso(today, -3), 1), to: today };
    case '6M':
      return { from: addDaysIso(addMonthsIso(today, -6), 1), to: today };
    case '1A':
      return { from: addDaysIso(addMonthsIso(today, -12), 1), to: today };
    case 'YTD':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'MAX':
      return { from: null, to: today };
    case 'custom':
      return {
        from: isIsoDate(period.from) ? period.from : null,
        to: isIsoDate(period.to) ? period.to : today,
      };
  }
}

/**
 * Periodo immediatamente precedente, della stessa durata, per i confronti ("rispetto al periodo
 * precedente"). Senza inizio (Max o personalizzato aperto) non c'è un periodo precedente.
 */
export function previousRange(range: DateRange): DateRange | null {
  if (range.from === null) return null;
  const days = daysBetween(range.from, range.to) + 1;
  return { from: addDaysIso(range.from, -days), to: addDaysIso(range.from, -1) };
}

/** Giorni tra due date ISO (to − from), sul calendario. */
export function daysBetween(from: string, to: string): number {
  const [fy = 0, fm = 1, fd = 1] = from.split('-').map(Number);
  const [ty = 0, tm = 1, td = 1] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}
