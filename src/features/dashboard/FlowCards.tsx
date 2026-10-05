import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { percentOf } from '../../domain/dashboard';
import { portfolioSummary } from '../../domain/investments';
import { formatMoney } from '../../domain/money';
import { changeOf, type Change } from '../../domain/overview';
import { Card, EmptyState } from '../../ui/Card';
import { DataTable } from '../../ui/DataTable';
import {
  formatEuroCompact,
  formatMonthShort,
  formatTenthsPercent,
  signedMoney,
} from '../../ui/format';
import { buttonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';
import { categoryColors, chartColors, palette, tooltipStyle } from '../../ui/theme';
import { DeltaBadge, Ring, StackedBar } from '../../ui/widgets';
import type { CategoryRow } from './categoryRows';
import type { OverviewModel } from './overviewModel';
import { sinceLabel } from './HeroCards';

const t = strings.overview;

function StatTile({
  label,
  value,
  tone = 'neutral',
  note,
  change,
  goodWhen,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'income' | 'expense';
  note?: string;
  change?: Change | null;
  goodWhen?: 'up' | 'down';
}) {
  const color = tone === 'income' ? 'text-income' : tone === 'expense' ? 'text-expense' : 'text-fg';
  return (
    <div className="card flex flex-col gap-1.5 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className={`text-2xl font-bold leading-tight ${color}`}>{value}</p>
      {change != null && (
        <div className="flex flex-wrap items-center gap-2">
          <DeltaBadge change={change} {...(goodWhen ? { goodWhen } : {})} showPercent={false} />
        </div>
      )}
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

/** Indicatori del periodo: entrate, spese, risparmio, tasso, spesa media, liquidità, investimenti. */
export function KpiGrid({ model }: { model: OverviewModel }) {
  const { flow, previousFlow } = model;
  const vs = (current: number, previous: number | undefined) =>
    previous === undefined ? null : changeOf(current, previous);
  const summary = portfolioSummary(model.positions);
  const hasPositions = model.positions.length > 0;
  // Il confronto ha senso solo se nel periodo precedente c'erano movimenti.
  const hasPrevious =
    previousFlow !== null && (previousFlow.incomeMinor !== 0 || previousFlow.expenseMinor !== 0);
  const compared = hasPrevious ? previousFlow : null;
  const note = compared ? t.kpi.vsPrevious : undefined;

  return (
    <section aria-label={strings.dashboard.title} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label={t.kpi.income}
        value={formatMoney(flow.incomeMinor)}
        tone="income"
        change={vs(flow.incomeMinor, compared?.incomeMinor)}
        {...(note ? { note } : {})}
      />
      <StatTile
        label={t.kpi.expenses}
        value={formatMoney(flow.expenseMinor)}
        tone="expense"
        change={vs(flow.expenseMinor, compared?.expenseMinor)}
        goodWhen="down"
        {...(note ? { note } : {})}
      />
      <StatTile
        label={t.kpi.savings}
        value={signedMoney(flow.savingsMinor)}
        tone={flow.savingsMinor >= 0 ? 'income' : 'expense'}
        change={vs(flow.savingsMinor, compared?.savingsMinor)}
        {...(note ? { note } : {})}
      />
      <StatTile
        label={t.kpi.savingsRate}
        value={
          flow.savingsRateTenths === null
            ? '—'
            : formatTenthsPercent(flow.savingsRateTenths).replace('+', '')
        }
        tone={flow.savingsRateTenths !== null && flow.savingsRateTenths < 0 ? 'expense' : 'neutral'}
        note={t.kpi.ofIncome}
      />
      <StatTile
        label={t.kpi.avgExpense}
        value={formatMoney(flow.avgMonthlyExpenseMinor)}
        note={t.kpi.perMonth}
      />
      <StatTile label={t.kpi.liquidity} value={formatMoney(model.wealth.accountsMinor)} />
      <StatTile label={t.kpi.investments} value={formatMoney(model.wealth.investmentsMinor)} />
      <StatTile
        label={t.kpi.roi}
        value={
          hasPositions && summary.roiTenthsPercent !== null
            ? formatTenthsPercent(summary.roiTenthsPercent)
            : '—'
        }
        tone={
          summary.roiTenthsPercent !== null && summary.roiTenthsPercent < 0
            ? 'expense'
            : summary.roiTenthsPercent !== null && summary.roiTenthsPercent > 0
              ? 'income'
              : 'neutral'
        }
        {...(hasPositions ? { note: signedMoney(summary.gainMinor) } : {})}
      />
    </section>
  );
}

/** Entrate e spese mese per mese (barre affiancate). */
export function FlowCard({ model }: { model: OverviewModel }) {
  const rows = model.months.map((m) => ({
    label: formatMonthShort(`${m.month}-01`),
    income: m.incomeMinor,
    expense: m.expenseMinor,
  }));
  const hasData = rows.some((r) => r.income !== 0 || r.expense !== 0);
  const rangeText = sinceLabel(model);

  return (
    <Card
      title={t.flow.title}
      description={rangeText}
      action={
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {[
            [chartColors.income, t.flow.income],
            [chartColors.expense, t.flow.expense],
          ].map(([color, label]) => (
            <li key={label} className="flex items-center gap-2 text-sm text-fg">
              <span
                aria-hidden="true"
                className="size-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              {label}
            </li>
          ))}
        </ul>
      }
    >
      {!hasData ? (
        <EmptyState message={t.flow.empty} />
      ) : (
        <>
          <div role="img" aria-label={t.flow.chartLabel(rangeText)} className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ left: 0, right: 8, top: 8 }} barGap={4}>
                <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: chartColors.axis }}
                  stroke={chartColors.grid}
                />
                <YAxis
                  width={52}
                  tick={{ fontSize: 12, fill: chartColors.axis }}
                  stroke={chartColors.grid}
                  tickFormatter={(value) => formatEuroCompact(Number(value))}
                />
                <Tooltip
                  {...tooltipStyle}
                  cursor={{ fill: palette.surface2 }}
                  formatter={(value) => formatMoney(Number(value))}
                />
                <Bar
                  dataKey="income"
                  name={t.flow.income}
                  fill={chartColors.income}
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="expense"
                  name={t.flow.expense}
                  fill={chartColors.expense}
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DataTable
            headers={[strings.dashboard.table.month, t.flow.income, t.flow.expense]}
            rows={rows.map((r) => [r.label, formatMoney(r.income), formatMoney(r.expense)])}
          />
        </>
      )}
    </Card>
  );
}

const rowColor = (row: CategoryRow, index: number): string =>
  row.key === '__others__'
    ? (categoryColors[categoryColors.length - 1] ?? palette.muted)
    : (categoryColors[index % (categoryColors.length - 1)] ?? palette.muted);

/** Ripartizione per categoria: barra a segmenti e, sotto, l'elenco con importo e percentuale. */
export function BreakdownCard({
  title,
  rows,
  totalLabel,
  totalMinor,
  emptyMessage,
}: {
  title: string;
  rows: readonly CategoryRow[];
  totalLabel: string;
  totalMinor: number;
  emptyMessage: string;
}) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <>
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <p className="text-sm text-muted">{totalLabel}</p>
            <p className="text-xl font-bold">{formatMoney(totalMinor)}</p>
          </div>
          <StackedBar
            label={`${title}: ${formatMoney(totalMinor)}`}
            segments={rows.map((r, i) => ({
              key: r.key,
              color: rowColor(r, i),
              amountMinor: r.amountMinor,
            }))}
          />
          <ul className="mt-3">
            {rows.map((row, index) => (
              <li
                key={row.key}
                className="flex items-center justify-between gap-3 border-t border-line-soft py-2 text-sm first:border-t-0"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: rowColor(row, index) }}
                  />
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="shrink-0 text-right">
                  <strong>{formatMoney(row.amountMinor)}</strong>{' '}
                  <span className="text-muted">{percentOf(row.amountMinor, totalMinor)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/** Spese del mese in corso a confronto con il mese scorso (al posto del budget, non ancora disponibile). */
export function MonthCard({ model }: { model: OverviewModel }) {
  const { currentMinor, previousToDateMinor, previousFullMinor } = model.monthCmp;
  const percent = previousFullMinor > 0 ? percentOf(currentMinor, previousFullMinor) : 0;
  const over = previousFullMinor > 0 && currentMinor > previousFullMinor;
  return (
    <Card title={t.month.title}>
      {currentMinor === 0 && previousFullMinor === 0 ? (
        <EmptyState message={t.month.empty} />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Ring
            percent={percent}
            color={over ? chartColors.expense : chartColors.accent}
            label={t.month.ring(percent)}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                {t.month.title}
              </p>
              <p className="text-xl font-bold">{formatMoney(currentMinor)}</p>
              {previousFullMinor > 0 && (
                <p className="text-xs text-muted">{t.month.percentOfLast(percent)}</p>
              )}
            </div>
          </Ring>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <DeltaBadge change={changeOf(currentMinor, previousToDateMinor)} goodWhen="down" />
            <span className="text-muted">{t.month.vsSameDay}</span>
          </div>
          <p className="text-sm text-muted">{t.month.lastMonth(formatMoney(previousFullMinor))}</p>
        </div>
      )}
    </Card>
  );
}

/** Invito a categorizzare i movimenti senza categoria (compare solo se ce ne sono). */
export function UncategorizedBanner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <section
      aria-label={t.uncategorized.title(count)}
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn/50 bg-warn/10 p-4"
    >
      <div className="min-w-0">
        <p className="font-semibold">{t.uncategorized.title(count)}</p>
        <p className="text-sm text-muted">{t.uncategorized.text}</p>
      </div>
      <Link to="/movimenti" className={`${buttonClass} no-underline`}>
        {t.uncategorized.action}
      </Link>
    </section>
  );
}
