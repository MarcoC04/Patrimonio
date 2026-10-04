import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Dataset } from '../../data/repository';
import { netWorthYearSeries } from '../../domain/dashboard';
import { formatMoney } from '../../domain/money';
import { Card, EmptyState } from '../../ui/Card';
import { DataTable } from '../../ui/DataTable';
import { formatEuroCompact, formatMonthShort } from '../../ui/format';
import { strings } from '../../ui/strings';
import { chartColors, tooltipStyle } from '../../ui/theme';
import { RatesNotice } from './RatesNotice';
import type { RatesState } from './useLatestRates';

/** Patrimonio netto a fine mese nell'anno scelto, ad area come nell'immagine di riferimento. */
export function NetWorthChart({
  data,
  year,
  rates,
}: {
  data: Dataset;
  year: number;
  rates: RatesState;
}) {
  // useId produce ":r1:": nei riferimenti url(#...) dell'SVG si tolgono i due punti.
  const gradientId = `nw-${useId().replace(/:/g, '')}`;

  const { points, missing } = useMemo(
    () => netWorthYearSeries(data.accounts, data.transactions, year, rates.rates),
    [data.accounts, data.transactions, year, rates.rates],
  );
  const series = points.map((p) => ({ label: formatMonthShort(p.date), value: p.balanceMinor }));

  return (
    <Card title={strings.dashboard.netWorthChart.title} centered>
      {data.accounts.length === 0 || series.length === 0 ? (
        <EmptyState message={strings.dashboard.netWorthChart.empty} />
      ) : (
        <>
          <div
            role="img"
            aria-label={strings.dashboard.netWorthChart.chartLabel(year)}
            className="h-60"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ left: 0, right: 12, top: 8 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.income} stopOpacity={0.55} />
                    <stop offset="95%" stopColor={chartColors.income} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
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
                <Area
                  type="monotone"
                  dataKey="value"
                  name={strings.dashboard.netWorthChart.balance}
                  stroke={chartColors.income}
                  strokeWidth={2.5}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <RatesNotice rates={rates} missing={missing} />
          <DataTable
            headers={[strings.dashboard.table.month, strings.dashboard.table.netWorth]}
            rows={points.map((p) => [formatMonthShort(p.date), formatMoney(p.balanceMinor)])}
          />
        </>
      )}
    </Card>
  );
}
