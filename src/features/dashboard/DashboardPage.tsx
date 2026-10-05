import { useMemo } from 'react';
import type { Dataset } from '../../data/repository';
import { todayIso } from '../../domain/dates';
import { PageHeader } from '../../ui/PageHeader';
import { strings } from '../../ui/strings';
import { DataGate } from '../DataGate';
import { FilterBar } from '../filters/FilterBar';
import { useFilters } from '../filters/FiltersProvider';
import { BreakdownCard, FlowCard, KpiGrid, MonthCard, UncategorizedBanner } from './FlowCards';
import { HeroCard, RecentCard, TrendCard, WealthDonutCard } from './HeroCards';
import { AccountsBalanceCard, InvestmentsOverviewCard, MerchantsCard } from './ListCards';
import { buildOverview } from './overviewModel';
import { useLatestRates } from './useLatestRates';

const t = strings.overview;

function DashboardView({ data }: { data: Dataset }) {
  const { range, accountIds } = useFilters();
  const rates = useLatestRates(data.accounts, data.assets);
  // "Oggi" si calcola una volta per apertura: il periodo e i confronti restano coerenti.
  const today = useMemo(() => todayIso(), []);

  const model = useMemo(
    () => buildOverview({ data, range, accountIds, rates: rates.rates, today }),
    [data, range, accountIds, rates.rates, today],
  );

  return (
    <div className="space-y-4">
      <FilterBar accounts={data.accounts} />
      <UncategorizedBanner count={model.uncategorized} />

      {/* Prima di tutto: il patrimonio e la torta che lo divide tra conti e investimenti */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 [&>section]:h-full">
          <HeroCard model={model} accounts={data.accounts} rates={rates} data={data} />
        </div>
        <WealthDonutCard model={model} accounts={data.accounts} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendCard model={model} hasAccounts={model.accounts.length > 0} />
        </div>
        <RecentCard model={model} />
      </div>

      <KpiGrid model={model} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BreakdownCard
            title={t.expenses.title}
            rows={model.expenseRows}
            totalLabel={t.expenses.total}
            totalMinor={model.flow.expenseMinor}
            emptyMessage={t.expenses.empty}
          />
        </div>
        <MonthCard model={model} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FlowCard model={model} />
        </div>
        <BreakdownCard
          title={t.income.title}
          rows={model.incomeRows}
          totalLabel={t.income.total}
          totalMinor={model.flow.incomeMinor}
          emptyMessage={t.income.empty}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AccountsBalanceCard model={model} />
        <MerchantsCard model={model} />
        <InvestmentsOverviewCard model={model} data={data} />
      </div>
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
