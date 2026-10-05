import type { Account, Category } from '../../data/schema';
import type { Dataset } from '../../data/repository';
import {
  balanceBaseAt,
  incomeByCategory,
  spendByCategory,
  type RateMap,
} from '../../domain/dashboard';
import { addDaysIso } from '../../domain/dates';
import { positionSummary, type Portfolio, type PositionSummary } from '../../domain/investments';
import {
  changeOf,
  earliestDate,
  flowSummary,
  monthComparison,
  monthlyFlowRange,
  portfolioForAccounts,
  sampleDates,
  selectAccounts,
  topMerchants,
  uncategorizedCount,
  wealthByAccount,
  wealthSeries,
  type Change,
  type FlowSummary,
  type Merchant,
  type MonthComparison,
  type MonthFlow,
  type WealthPoint,
  type WealthSlice,
} from '../../domain/overview';
import { previousRange, type DateRange } from '../../domain/period';
import { categoryRows, type CategoryRow } from './categoryRows';
import { compareDecimals } from '../../domain/decimal';

const MAX_CATEGORY_ROWS = 6;
const MAX_MERCHANTS = 5;

export interface RecentChange {
  key: 'd7' | 'd30' | 'y1';
  change: Change;
  values: number[];
}

export interface AccountBalance {
  account: Account;
  balanceMinor: number;
}

export interface OverviewModel {
  range: DateRange;
  previous: DateRange | null;
  /** Primo giorno effettivo del periodo (per "Max": il primo dato). */
  start: string;
  asOf: string;
  accounts: Account[];
  /** Patrimonio alla fine del periodo e variazione rispetto all'inizio. */
  wealth: { totalMinor: number; accountsMinor: number; investmentsMinor: number };
  wealthChange: Change;
  series: WealthPoint[];
  slices: WealthSlice[];
  recent: RecentChange[];
  flow: FlowSummary;
  previousFlow: FlowSummary | null;
  months: MonthFlow[];
  expenseRows: CategoryRow[];
  incomeRows: CategoryRow[];
  merchants: Merchant[];
  uncategorized: number;
  monthCmp: MonthComparison;
  balances: AccountBalance[];
  positions: PositionSummary[];
  /** Valute senza cambio e asset senza prezzo: esclusi dai totali, da segnalare. */
  missing: string[];
  unpriced: string[];
}

export interface OverviewInput {
  data: Dataset;
  range: DateRange;
  accountIds: readonly string[];
  rates: RateMap;
  today: string;
}

/** Tutti i numeri della panoramica per il periodo e i conti scelti. Funzione pura. */
export function buildOverview({
  data,
  range,
  accountIds,
  rates,
  today,
}: OverviewInput): OverviewModel {
  const accounts = selectAccounts(data.accounts, accountIds);
  const fullPortfolio: Portfolio = {
    assets: data.assets,
    operations: data.investmentTransactions,
    prices: data.priceHistory,
  };
  const portfolio = portfolioForAccounts(fullPortfolio, accountIds);
  const txs = data.transactions;
  const asOf = range.to;
  const first = range.from ?? earliestDate(accounts, txs) ?? asOf;
  const start = first > asOf ? asOf : first;

  // Patrimonio: grafico, valore finale e variazione rispetto al giorno prima dell'inizio.
  const dates = sampleDates(start, asOf);
  const trend = wealthSeries(accounts, txs, portfolio, dates, rates);
  const before = wealthSeries(accounts, txs, portfolio, [addDaysIso(start, -1)], rates);
  const end = trend.points[trend.points.length - 1];
  const baseline = before.points[0]?.totalMinor ?? 0;
  const wealth = {
    totalMinor: end?.totalMinor ?? 0,
    accountsMinor: end?.accountsMinor ?? 0,
    investmentsMinor: end?.investmentsMinor ?? 0,
  };

  const split = wealthByAccount(accounts, txs, portfolio, asOf, rates);

  // Andamento recente (indipendente dal periodo scelto, sempre fino a oggi)
  const recent: RecentChange[] = (
    [
      ['d7', 7],
      ['d30', 30],
      ['y1', 365],
    ] as const
  ).map(([key, days]) => {
    const from = addDaysIso(today, -days);
    const { points } = wealthSeries(accounts, txs, portfolio, sampleDates(from, today), rates);
    const values = points.map((p) => p.totalMinor);
    const firstValue = values[0] ?? 0;
    const lastValue = values[values.length - 1] ?? 0;
    return { key, change: changeOf(lastValue, firstValue), values };
  });

  const previous = previousRange(range);
  const flow = flowSummary(txs, range, accountIds);
  const previousFlow = previous ? flowSummary(txs, previous, accountIds) : null;

  const scopedTxs =
    accountIds.length === 0 ? txs : txs.filter((t) => accountIds.includes(t.account_id));
  const catRange = { from: range.from ?? '0000-01-01', to: range.to };
  const names: readonly Pick<Category, 'id' | 'name' | 'parent_id'>[] = data.categories;

  // Saldi dei conti alla fine del periodo
  const balances: AccountBalance[] = [];
  const missing = new Set([...trend.missing, ...split.missing]);
  for (const account of accounts) {
    const value = balanceBaseAt(account, txs, asOf, rates);
    if (value === null) missing.add(account.currency);
    else if (!account.is_archived || value !== 0) balances.push({ account, balanceMinor: value });
  }
  balances.sort((a, b) => b.balanceMinor - a.balanceMinor);

  // Posizioni aperte alla fine del periodo
  const positions = portfolio.assets
    .map((asset) => positionSummary(asset, portfolio, asOf, rates))
    .filter((p) => compareDecimals(p.quantity, '0') > 0)
    .sort((a, b) => (b.valueMinor ?? 0) - (a.valueMinor ?? 0));

  return {
    range,
    previous,
    start,
    asOf,
    accounts,
    wealth,
    wealthChange: changeOf(wealth.totalMinor, baseline),
    series: trend.points,
    slices: split.slices,
    recent,
    flow,
    previousFlow,
    months: monthlyFlowRange(txs, range, accountIds),
    expenseRows: categoryRows(
      spendByCategory(scopedTxs, names, catRange),
      names,
      MAX_CATEGORY_ROWS,
    ),
    incomeRows: categoryRows(
      incomeByCategory(scopedTxs, names, catRange),
      names,
      MAX_CATEGORY_ROWS,
    ),
    merchants: topMerchants(txs, range, accountIds, MAX_MERCHANTS),
    uncategorized: uncategorizedCount(txs, range, accountIds),
    monthCmp: monthComparison(txs, today, accountIds),
    balances,
    positions,
    missing: [...missing].sort(),
    unpriced: [...new Set([...trend.unpriced, ...split.unpriced])].sort(),
  };
}
