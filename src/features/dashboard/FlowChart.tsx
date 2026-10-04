import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Dataset } from '../../data/repository';
import { monthlyFlow, yearEndDates } from '../../domain/dashboard';
import { formatMoney } from '../../domain/money';
import { Card, EmptyState } from '../../ui/Card';
import { DataTable } from '../../ui/DataTable';
import { formatEuroCompact, formatMonthShort } from '../../ui/format';
import { strings } from '../../ui/strings';
import { chartColors, tooltipStyle } from '../../ui/theme';

/** Voce della legenda: pallino colorato + testo (il colore da solo non basta). */
function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm text-fg">
      <span
        aria-hidden="true"
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </li>
  );
}

/** Entrate e spese mese per mese (barre) e flusso di cassa (linea), come nell'immagine di riferimento. */
export function FlowChart({ data, year }: { data: Dataset; year: number }) {
  const rows = useMemo(() => {
    // Solo i mesi già iniziati (per l'anno in corso); i mesi futuri non hanno dati.
    const months = yearEndDates(year).length;
    return monthlyFlow(data.transactions, year)
      .slice(0, months)
      .map((m) => ({
        label: formatMonthShort(`${m.month}-01`),
        income: m.incomeMinor,
        expense: m.expenseMinor,
        flow: m.netMinor,
      }));
  }, [data.transactions, year]);

  const hasData = rows.some((r) => r.income !== 0 || r.expense !== 0);

  return (
    <Card title={strings.dashboard.flowChart.title} centered>
      {!hasData ? (
        <EmptyState message={strings.dashboard.flowChart.empty} />
      ) : (
        <>
          <ul className="mb-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
            <LegendItem color={chartColors.income} label={strings.dashboard.flowChart.income} />
            <LegendItem color={chartColors.expense} label={strings.dashboard.flowChart.expense} />
            <LegendItem color={chartColors.flow} label={strings.dashboard.flowChart.flow} />
          </ul>
          <div
            role="img"
            aria-label={strings.dashboard.flowChart.chartLabel(year)}
            className="h-60"
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ left: 0, right: 12, top: 8 }}>
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
                <Tooltip {...tooltipStyle} formatter={(value) => formatMoney(Number(value))} />
                <Bar
                  dataKey="income"
                  name={strings.dashboard.flowChart.income}
                  fill={chartColors.income}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="expense"
                  name={strings.dashboard.flowChart.expense}
                  fill={chartColors.expense}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="flow"
                  name={strings.dashboard.flowChart.flow}
                  stroke={chartColors.flow}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: chartColors.flow }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <DataTable
            headers={[
              strings.dashboard.table.month,
              strings.dashboard.table.income,
              strings.dashboard.table.expense,
              strings.dashboard.table.flow,
            ]}
            rows={rows.map((r) => [
              r.label,
              formatMoney(r.income),
              formatMoney(r.expense),
              formatMoney(r.flow),
            ])}
          />
        </>
      )}
    </Card>
  );
}
