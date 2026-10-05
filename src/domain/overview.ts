import type { Account, Transaction } from '../data/schema';
import { addDaysIso, addMonthsIso } from './dates';
import { balanceBaseAt, wealthAt, type RateMap } from './dashboard';
import { normalizeDescription } from './dedupe';
import { investmentsValue, type Portfolio } from './investments';
import { isTransfer } from './ledger';
import { sumMinor } from './money';
import { daysBetween, type DateRange } from './period';
import { suggestPattern } from './rules';

/**
 * Calcoli della dashboard "Panoramica": tutto dipende dal periodo e dai conti scelti nei filtri.
 * Funzioni pure sugli importi in centesimi EUR; i giroconti non contano come entrate o spese.
 */

type AccountLike = Pick<
  Account,
  'id' | 'name' | 'type' | 'currency' | 'opening_balance_minor' | 'opening_date'
>;
type WealthTx = Pick<Transaction, 'account_id' | 'date' | 'amount_minor'>;
type FlowTx = Pick<
  Transaction,
  'account_id' | 'date' | 'amount_base_minor' | 'transfer_group_id' | 'category_id' | 'description'
>;

/** Conti scelti; nessuna scelta = tutti. */
export function selectAccounts<T extends { id: string }>(
  accounts: readonly T[],
  ids: readonly string[],
): T[] {
  return ids.length === 0 ? [...accounts] : accounts.filter((a) => ids.includes(a.id));
}

/**
 * Investimenti dei conti scelti: contano le operazioni registrate su quei conti. Nessuna scelta =
 * tutte le operazioni (comprese quelle senza conto).
 */
export function portfolioForAccounts(portfolio: Portfolio, ids: readonly string[]): Portfolio {
  if (ids.length === 0) return portfolio;
  return {
    ...portfolio,
    operations: portfolio.operations.filter(
      (o) => o.account_id !== null && ids.includes(o.account_id),
    ),
  };
}

function inScope<T extends Pick<Transaction, 'account_id'>>(
  transactions: readonly T[],
  ids: readonly string[],
): T[] {
  return ids.length === 0
    ? [...transactions]
    : transactions.filter((t) => ids.includes(t.account_id));
}

function inRange<T extends Pick<Transaction, 'date'>>(
  transactions: readonly T[],
  range: DateRange,
): T[] {
  return transactions.filter(
    (t) => (range.from === null || t.date >= range.from) && t.date <= range.to,
  );
}

/** Data più antica tra aperture dei conti e movimenti (per "Max"). */
export function earliestDate(
  accounts: readonly Pick<Account, 'opening_date'>[],
  transactions: readonly Pick<Transaction, 'date'>[],
): string | null {
  const dates = [...accounts.map((a) => a.opening_date), ...transactions.map((t) => t.date)];
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b));
}

// ---- Patrimonio nel tempo ----

/**
 * Date in cui calcolare il patrimonio per il grafico: ogni giorno fino a 40 giorni, ogni
 * settimana fino a circa 6 mesi, poi a fine mese. Sempre in ordine, senza doppioni, ultima = `to`.
 */
export function sampleDates(from: string, to: string): string[] {
  if (from > to) return [to];
  const span = daysBetween(from, to);
  const dates: string[] = [];
  if (span <= 40) {
    for (let d = 0; d <= span; d++) dates.push(addDaysIso(from, d));
  } else if (span <= 190) {
    for (let d = 0; d <= span; d += 7) dates.push(addDaysIso(from, d));
  } else {
    dates.push(from);
    let cursor = from;
    for (;;) {
      const next = addMonthsIso(`${cursor.slice(0, 8)}01`, 1);
      const monthEnd = addDaysIso(next, -1);
      if (monthEnd >= to) break;
      if (monthEnd > from) dates.push(monthEnd);
      cursor = next;
    }
  }
  if (dates[dates.length - 1] !== to) dates.push(to);
  return [...new Set(dates)];
}

export interface WealthPoint {
  date: string;
  accountsMinor: number;
  investmentsMinor: number;
  totalMinor: number;
}

/** Patrimonio (conti + investimenti) alle date indicate, con gli stessi tassi per tutti i punti. */
export function wealthSeries(
  accounts: readonly AccountLike[],
  transactions: readonly WealthTx[],
  portfolio: Portfolio,
  dates: readonly string[],
  rates: RateMap = {},
): { points: WealthPoint[]; missing: string[]; unpriced: string[] } {
  const missing = new Set<string>();
  const unpriced = new Set<string>();
  const points = dates.map((date) => {
    const wealth = wealthAt(accounts, transactions, portfolio, date, rates);
    for (const currency of wealth.missing) missing.add(currency);
    for (const id of wealth.unpriced) unpriced.add(id);
    return {
      date,
      accountsMinor: wealth.accountsMinor,
      investmentsMinor: wealth.investmentsMinor,
      totalMinor: wealth.totalMinor,
    };
  });
  return { points, missing: [...missing].sort(), unpriced: [...unpriced].sort() };
}

export interface Change {
  deltaMinor: number;
  /** Variazione in decimi di punto percentuale (199 = 19,9 %); null se il valore di partenza è 0. */
  tenthsPercent: number | null;
}

/** Variazione tra due valori. La percentuale è rispetto al valore di partenza (in valore assoluto). */
export function changeOf(current: number, previous: number): Change {
  const deltaMinor = current - previous;
  return {
    deltaMinor,
    tenthsPercent: previous === 0 ? null : Math.round((deltaMinor * 1000) / Math.abs(previous)),
  };
}

export interface WealthSlice {
  /** Id del conto, o null per gli investimenti. */
  accountId: string | null;
  amountMinor: number;
}

/**
 * Torta del patrimonio: un pezzo per ogni conto con saldo positivo e uno per gli investimenti.
 * Dal più grande al più piccolo; un conto in rosso non è un'attività e non compare.
 */
export function wealthByAccount(
  accounts: readonly AccountLike[],
  transactions: readonly WealthTx[],
  portfolio: Portfolio,
  isoDate: string,
  rates: RateMap = {},
): { slices: WealthSlice[]; totalMinor: number; missing: string[]; unpriced: string[] } {
  const missing = new Set<string>();
  const slices: WealthSlice[] = [];
  for (const account of accounts) {
    const value = balanceBaseAt(account, transactions, isoDate, rates);
    if (value === null) {
      missing.add(account.currency);
      continue;
    }
    if (value > 0) slices.push({ accountId: account.id, amountMinor: value });
  }
  const invested = investmentsValue(portfolio, isoDate, rates);
  for (const currency of invested.missing) missing.add(currency);
  if (invested.totalMinor > 0) slices.push({ accountId: null, amountMinor: invested.totalMinor });
  slices.sort(
    (a, b) =>
      b.amountMinor - a.amountMinor || String(a.accountId).localeCompare(String(b.accountId)),
  );
  return {
    slices,
    totalMinor: sumMinor(slices.map((s) => s.amountMinor)),
    missing: [...missing].sort(),
    unpriced: invested.unpriced,
  };
}

// ---- Entrate e spese del periodo ----

export interface FlowSummary {
  incomeMinor: number;
  expenseMinor: number;
  /** Entrate − spese. */
  savingsMinor: number;
  /** Risparmio sul totale delle entrate, in decimi di punto percentuale; null senza entrate. */
  savingsRateTenths: number | null;
  /** Spesa media al mese nel periodo. */
  avgMonthlyExpenseMinor: number;
}

/** Entrate, spese e risparmio nel periodo e nei conti scelti (giroconti esclusi). */
export function flowSummary(
  transactions: readonly FlowTx[],
  range: DateRange,
  ids: readonly string[],
): FlowSummary {
  const scoped = inRange(inScope(transactions, ids), range).filter((t) => !isTransfer(t));
  const incomeMinor = sumMinor(
    scoped.filter((t) => t.amount_base_minor > 0).map((t) => t.amount_base_minor),
  );
  const expenseMinor = sumMinor(
    scoped.filter((t) => t.amount_base_minor < 0).map((t) => -t.amount_base_minor),
  );
  const start =
    range.from ??
    scoped.reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null);
  const days = start === null ? 0 : daysBetween(start, range.to) + 1;
  const months = Math.max(1, Math.round(days / 30.4375));
  return {
    incomeMinor,
    expenseMinor,
    savingsMinor: incomeMinor - expenseMinor,
    savingsRateTenths:
      incomeMinor > 0 ? Math.round(((incomeMinor - expenseMinor) * 1000) / incomeMinor) : null,
    avgMonthlyExpenseMinor: Math.round(expenseMinor / months),
  };
}

export interface MonthFlow {
  /** "2026-09" */
  month: string;
  incomeMinor: number;
  expenseMinor: number;
}

/** Entrate e spese per ogni mese del periodo (anche i mesi senza movimenti). */
export function monthlyFlowRange(
  transactions: readonly FlowTx[],
  range: DateRange,
  ids: readonly string[],
): MonthFlow[] {
  const scoped = inRange(inScope(transactions, ids), range).filter((t) => !isTransfer(t));
  const first =
    range.from ??
    scoped.reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null);
  if (first === null) return [];
  const months: MonthFlow[] = [];
  let cursor = `${first.slice(0, 7)}`;
  const last = range.to.slice(0, 7);
  while (cursor <= last) {
    const inMonth = scoped.filter((t) => t.date.startsWith(cursor));
    months.push({
      month: cursor,
      incomeMinor: sumMinor(
        inMonth.filter((t) => t.amount_base_minor > 0).map((t) => t.amount_base_minor),
      ),
      expenseMinor: sumMinor(
        inMonth.filter((t) => t.amount_base_minor < 0).map((t) => -t.amount_base_minor),
      ),
    });
    cursor = addMonthsIso(`${cursor}-01`, 1).slice(0, 7);
  }
  return months;
}

export interface Merchant {
  key: string;
  /** Descrizione più breve tra quelle del gruppo (la più "pulita"). */
  name: string;
  amountMinor: number;
  count: number;
}

/**
 * Dove si spende di più: le spese del periodo raggruppate per esercente (stesse parole
 * significative della descrizione), dalle più alte. I giroconti sono esclusi.
 */
export function topMerchants(
  transactions: readonly FlowTx[],
  range: DateRange,
  ids: readonly string[],
  limit: number,
): Merchant[] {
  const groups = new Map<string, { names: string[]; amounts: number[] }>();
  for (const t of inRange(inScope(transactions, ids), range)) {
    if (isTransfer(t) || t.amount_base_minor >= 0) continue;
    const key = suggestPattern(t.description) ?? normalizeDescription(t.description);
    if (key === '') continue;
    const group = groups.get(key) ?? { names: [], amounts: [] };
    group.names.push(t.description.trim());
    group.amounts.push(-t.amount_base_minor);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      name: g.names.reduce((a, b) => (b.length < a.length ? b : a)),
      amountMinor: sumMinor(g.amounts),
      count: g.amounts.length,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/** Movimenti (non giroconti) senza categoria nel periodo e nei conti scelti. */
export function uncategorizedCount(
  transactions: readonly FlowTx[],
  range: DateRange,
  ids: readonly string[],
): number {
  return inRange(inScope(transactions, ids), range).filter(
    (t) => !isTransfer(t) && t.category_id === null,
  ).length;
}

export interface MonthComparison {
  /** Spese del mese in corso, dal 1° a oggi. */
  currentMinor: number;
  /** Spese del mese scorso, dal 1° allo stesso giorno del mese (a parità di giorni trascorsi). */
  previousToDateMinor: number;
  /** Spese dell'intero mese scorso. */
  previousFullMinor: number;
}

/** Spese del mese in corso a confronto con il mese scorso (giroconti esclusi). */
export function monthComparison(
  transactions: readonly FlowTx[],
  today: string,
  ids: readonly string[],
): MonthComparison {
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevStart = addMonthsIso(monthStart, -1);
  const prevSameDay = addMonthsIso(today, -1);
  const prevEnd = addDaysIso(monthStart, -1);
  const spend = (from: string, to: string) =>
    sumMinor(
      inRange(inScope(transactions, ids), { from, to })
        .filter((t) => !isTransfer(t) && t.amount_base_minor < 0)
        .map((t) => -t.amount_base_minor),
    );
  return {
    currentMinor: spend(monthStart, today),
    previousToDateMinor: spend(prevStart, prevSameDay),
    previousFullMinor: spend(prevStart, prevEnd),
  };
}
