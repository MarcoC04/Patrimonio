import { useMemo, useState } from 'react';
import type { Dataset } from '../../data/repository';
import { formatDateIt, todayIso } from '../../domain/dates';
import {
  availableYears,
  incomeByCategory,
  percentOf,
  spendByCategory,
  wealthAt,
  wealthByKind,
  yearEndDates,
  yearRange,
  yearSummary,
} from '../../domain/dashboard';
import type { Portfolio } from '../../domain/investments';
import { formatMoney } from '../../domain/money';
import { Card, EmptyState } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { strings } from '../../ui/strings';
import { DataGate } from '../DataGate';
import { categoryRows } from './categoryRows';
import { CategoryBarsCard } from './CategoryBarsCard';
import { DonutCard } from './DonutCard';
import { FlowChart } from './FlowChart';
import { KpiTile } from './KpiTile';
import { NetWorthChart } from './NetWorthChart';
import { RatesNotice } from './RatesNotice';
import { UnpricedNotice } from './UnpricedNotice';
import { useLatestRates } from './useLatestRates';
import { YearSelector } from './YearSelector';

const MAX_DONUT_SLICES = 5;
const MAX_BARS = 6;

function BudgetsCard() {
  return (
    <Card title={strings.dashboard.budgets.title} centered>
      <EmptyState message={strings.dashboard.budgets.empty} />
    </Card>
  );
}

function DashboardView({ data }: { data: Dataset }) {
  const now = useMemo(() => new Date(), []);
  const today = todayIso(now);
  const currentYear = now.getFullYear();
  const [year, setYear] = useState(currentYear);
  const rates = useLatestRates(data.accounts, data.assets);

  const years = useMemo(
    () => availableYears(data.transactions, data.accounts, now),
    [data.transactions, data.accounts, now],
  );

  const portfolio = useMemo<Portfolio>(
    () => ({
      assets: data.assets,
      operations: data.investmentTransactions,
      prices: data.priceHistory,
    }),
    [data.assets, data.investmentTransactions, data.priceHistory],
  );

  // Patrimonio e torta si riferiscono alla fine dell'anno scelto (oggi, per l'anno in corso).
  const asOf = yearEndDates(year, now).at(-1) ?? today;
  const wealth = wealthAt(data.accounts, data.transactions, portfolio, asOf, rates.rates);
  const summary = useMemo(() => yearSummary(data.transactions, year), [data.transactions, year]);

  const split = useMemo(
    () => wealthByKind(data.accounts, data.transactions, portfolio, asOf, rates.rates),
    [data.accounts, data.transactions, portfolio, asOf, rates.rates],
  );
  const wealthSlices = split.items.map((item) => ({
    key: item.kind,
    name: strings.dashboard.assets.kinds[item.kind],
    amountMinor: item.amountMinor,
  }));

  const incomeSlices = useMemo(
    () =>
      categoryRows(
        incomeByCategory(data.transactions, data.categories, yearRange(year)),
        data.categories,
        MAX_DONUT_SLICES,
      ),
    [data.transactions, data.categories, year],
  );
  const expenseRows = useMemo(
    () =>
      categoryRows(
        spendByCategory(data.transactions, data.categories, yearRange(year)),
        data.categories,
        MAX_BARS,
      ),
    [data.transactions, data.categories, year],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="order-2 md:order-1">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile
              icon="netWorth"
              label={strings.dashboard.kpi.netWorth}
              value={formatMoney(wealth.totalMinor)}
              note={strings.dashboard.kpi.netWorthNote(formatDateIt(asOf))}
            />
            <KpiTile
              icon="income"
              label={strings.dashboard.kpi.income}
              value={formatMoney(summary.incomeMinor)}
              tone="income"
            />
            <KpiTile
              icon="expenses"
              label={strings.dashboard.kpi.expenses}
              value={formatMoney(summary.expenseMinor)}
              tone="expense"
            />
            <KpiTile
              icon="savings"
              label={strings.dashboard.kpi.savings}
              value={formatMoney(summary.savingsMinor)}
              tone={summary.savingsMinor >= 0 ? 'income' : 'expense'}
            />
          </div>
          <RatesNotice rates={rates} missing={wealth.missing} />
          <UnpricedNotice ids={wealth.unpriced} assets={data.assets} />
        </div>
        <div className="order-1 md:order-2 md:text-right">
          <p className="mb-2 text-sm text-muted">{strings.dashboard.subtitle}</p>
          <YearSelector
            years={years}
            selected={year}
            currentYear={currentYear}
            onSelect={setYear}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NetWorthChart data={data} year={year} rates={rates} />
        <FlowChart data={data} year={year} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DonutCard
          title={strings.dashboard.assets.title}
          slices={wealthSlices}
          emptyMessage={strings.dashboard.assets.empty}
          chartLabel={strings.dashboard.assets.chartLabel}
          footer={
            <div className="w-full border-t border-line-soft pt-2 text-sm text-fg">
              <p>
                {strings.dashboard.assets.accounts}:{' '}
                <strong>{formatMoney(split.accountsMinor)}</strong>{' '}
                <span className="text-muted">
                  ({percentOf(split.accountsMinor, split.totalMinor)}%)
                </span>
              </p>
              <p>
                {strings.dashboard.assets.investments}:{' '}
                <strong>{formatMoney(split.investmentsMinor)}</strong>{' '}
                <span className="text-muted">
                  ({percentOf(split.investmentsMinor, split.totalMinor)}%)
                </span>
              </p>
              <RatesNotice rates={rates} missing={split.missing} />
              <UnpricedNotice ids={split.unpriced} assets={data.assets} />
            </div>
          }
        />
        <DonutCard
          title={strings.dashboard.incomeByCategory.title}
          slices={incomeSlices}
          emptyMessage={strings.dashboard.incomeByCategory.empty}
          chartLabel={(total) => strings.dashboard.incomeByCategory.chartLabel(year, total)}
        />
        <CategoryBarsCard
          title={strings.dashboard.expensesByCategory.title}
          rows={expenseRows}
          emptyMessage={strings.dashboard.expensesByCategory.empty}
          chartLabel={(total) => strings.dashboard.expensesByCategory.chartLabel(year, total)}
        />
      </div>

      <BudgetsCard />
    </div>
  );
}

export function DashboardPage() {
  return (
    <>
      <PageHeader
        icon="dashboard"
        title={strings.dashboard.title}
        subtitle={strings.subtitles.dashboard}
      />
      <DataGate title={strings.dashboard.title}>{(data) => <DashboardView data={data} />}</DataGate>
    </>
  );
}
