import { useMemo, useState, type ReactElement } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Dataset } from '../../data/repository';
import { todayIso } from '../../domain/dates';
import {
  currentMonth,
  limitSpend,
  liquidityMinor,
  liquiditySeries,
  monthBounds,
  monthEndDates,
  netWorthMinor,
  percentOf,
  shiftMonth,
  spendByCategory,
  type YearMonth,
} from '../../domain/dashboard';
import { formatMoney, sumMinor } from '../../domain/money';
import { Card, EmptyState } from '../../ui/Card';
import { formatEuroWhole, formatMonthLabel, formatMonthShort } from '../../ui/format';
import { secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';
import { DataGate } from '../DataGate';

const ACCENT = '#0f766e';
const GRID = '#e2e8f0';
const AXIS = '#94a3b8';

/** Grafico con un messaggio al posto dei dati (assi e griglia reali, niente numeri inventati). */
function EmptyChartFrame({ message, children }: { message: string; children: ReactElement }) {
  return (
    <div role="img" aria-label={message} className="relative h-48">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
      <p className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-slate-600">
        {message}
      </p>
    </div>
  );
}

function NetWorthCard({ data, today }: { data: Dataset; today: string }) {
  const netWorth = netWorthMinor(data.accounts, data.transactions, today);
  const liquidity = liquidityMinor(data.accounts, data.transactions, today);

  return (
    <Card title={strings.dashboard.netWorth.title}>
      {data.accounts.length === 0 ? (
        <>
          <p className="text-3xl font-bold text-slate-400" aria-hidden="true">
            —
          </p>
          <EmptyState message={strings.dashboard.netWorth.empty} />
        </>
      ) : (
        <>
          <p className="text-3xl font-bold">{formatMoney(netWorth)}</p>
          <p className="mt-1 text-sm text-slate-700">
            {strings.dashboard.netWorth.liquidity}: <strong>{formatMoney(liquidity)}</strong>
          </p>
          <p className="mt-2 text-xs text-slate-600">{strings.dashboard.netWorth.note}</p>
        </>
      )}
    </Card>
  );
}

const MAX_CATEGORIES = 6;

function CategorySpendCard({ data }: { data: Dataset }) {
  const thisMonth = currentMonth();
  const [month, setMonth] = useState<YearMonth>(thisMonth);

  const rows = useMemo(() => {
    const spend = spendByCategory(data.transactions, data.categories, monthBounds(month));
    const { top, othersMinor } = limitSpend(spend, MAX_CATEGORIES);
    const names = new Map(data.categories.map((c) => [c.id, c.name] as const));
    const named = top.map((item) => ({
      key: item.categoryId ?? '__none__',
      name: item.categoryId
        ? (names.get(item.categoryId) ?? strings.dashboard.categorySpend.uncategorized)
        : strings.dashboard.categorySpend.uncategorized,
      amountMinor: item.amountMinor,
    }));
    if (othersMinor > 0) {
      named.push({
        key: '__others__',
        name: strings.dashboard.categorySpend.others,
        amountMinor: othersMinor,
      });
    }
    return named;
  }, [data.transactions, data.categories, month]);

  const total = sumMinor(rows.map((r) => r.amountMinor));
  const label = formatMonthLabel(month);

  return (
    <Card title={strings.dashboard.categorySpend.title}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className={secondaryButtonClass}
          aria-label={strings.dashboard.categorySpend.previousMonth}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ←
        </button>
        <p className="font-medium capitalize" aria-live="polite">
          {label}
        </p>
        <button
          type="button"
          className={secondaryButtonClass}
          aria-label={strings.dashboard.categorySpend.nextMonth}
          disabled={month >= thisMonth}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          →
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyChartFrame message={strings.dashboard.categorySpend.empty}>
          <BarChart data={[]} layout="vertical" margin={{ left: 8, right: 8 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" domain={[0, 100]} tick={false} stroke={AXIS} />
            <YAxis type="category" dataKey="name" tick={false} stroke={AXIS} />
          </BarChart>
        </EmptyChartFrame>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-700">
            {strings.dashboard.categorySpend.total}: <strong>{formatMoney(total)}</strong>
          </p>
          <div
            role="img"
            aria-label={strings.dashboard.categorySpend.chartLabel(label, formatMoney(total))}
            style={{ height: rows.length * 36 + 16 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 12 }}
                  stroke={AXIS}
                />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Bar dataKey="amountMinor" fill={ACCENT} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Gli stessi dati in testo: nome, importo e percentuale (non solo colore o lunghezza). */}
          <ul className="mt-2 divide-y divide-slate-200 text-sm">
            {rows.map((row) => (
              <li key={row.key} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">{row.name}</span>
                <span className="shrink-0">
                  <strong>{formatMoney(row.amountMinor)}</strong>{' '}
                  <span className="text-slate-600">({percentOf(row.amountMinor, total)}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function LiquidityCard({ data }: { data: Dataset }) {
  const series = useMemo(() => {
    const points = liquiditySeries(data.accounts, data.transactions, monthEndDates(new Date(), 12));
    return points.map((p) => ({ ...p, label: formatMonthShort(p.date) }));
  }, [data.accounts, data.transactions]);

  const hasLiquidAccounts = data.accounts.some((a) => a.type !== 'brokerage');
  const first = series[0];
  const last = series[series.length - 1];

  return (
    <Card title={strings.dashboard.liquidity.title} className="md:col-span-2">
      {!hasLiquidAccounts || !first || !last ? (
        <EmptyChartFrame message={strings.dashboard.liquidity.empty}>
          <LineChart data={[]} margin={{ left: 8, right: 8 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis dataKey="label" tick={false} stroke={AXIS} />
            <YAxis domain={[0, 100]} tick={false} stroke={AXIS} />
          </LineChart>
        </EmptyChartFrame>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-700">
            {strings.dashboard.liquidity.today}: <strong>{formatMoney(last.balanceMinor)}</strong>
          </p>
          <div
            role="img"
            aria-label={strings.dashboard.liquidity.chartLabel(
              formatMonthShort(first.date),
              formatMonthShort(last.date),
            )}
            className="h-56"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ left: 0, right: 12, top: 8 }}>
                <CartesianGrid stroke={GRID} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke={AXIS} />
                <YAxis
                  width={64}
                  tick={{ fontSize: 12 }}
                  stroke={AXIS}
                  tickFormatter={(value) => formatEuroWhole(Number(value))}
                />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Line
                  dataKey="balanceMinor"
                  stroke={ACCENT}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-2">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
              {strings.dashboard.liquidity.showData}
            </summary>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-1 font-medium">{strings.dashboard.liquidity.date}</th>
                  <th className="py-1 text-right font-medium">
                    {strings.dashboard.liquidity.balance}
                  </th>
                </tr>
              </thead>
              <tbody>
                {series.map((point) => (
                  <tr key={point.date} className="border-t border-slate-200">
                    <td className="py-1">{point.label}</td>
                    <td className="py-1 text-right">{formatMoney(point.balanceMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </Card>
  );
}

function BudgetsCard() {
  return (
    <Card title={strings.dashboard.budgets.title}>
      <EmptyState message={strings.dashboard.budgets.empty} />
    </Card>
  );
}

function DashboardView({ data }: { data: Dataset }) {
  const today = todayIso();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <NetWorthCard data={data} today={today} />
      <BudgetsCard />
      <CategorySpendCard data={data} />
      <LiquidityCard data={data} />
    </div>
  );
}

export function DashboardPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{strings.dashboard.title}</h1>
      <DataGate title={strings.dashboard.title}>{(data) => <DashboardView data={data} />}</DataGate>
    </>
  );
}
