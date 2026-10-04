import type { ReactElement } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, EmptyState } from '../../ui/Card';
import { strings } from '../../ui/strings';

/** Punti dei grafici. Senza conti e movimenti non c'è nulla da mostrare: mai dati inventati. */
interface CategorySpend {
  category: string;
  amountMinor: number;
}
interface LiquidityPoint {
  date: string;
  balanceMinor: number;
}
const noCategorySpend: CategorySpend[] = [];
const noLiquidity: LiquidityPoint[] = [];

/** Cornice del grafico vuoto: assi e griglia reali, con il messaggio scritto sopra. */
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

function NetWorthCard() {
  return (
    <Card title={strings.dashboard.netWorth.title}>
      <p className="text-3xl font-bold text-slate-400" aria-hidden="true">
        —
      </p>
      <EmptyState message={strings.dashboard.netWorth.empty} />
    </Card>
  );
}

function CategorySpendCard() {
  return (
    <Card title={strings.dashboard.categorySpend.title}>
      <EmptyChartFrame message={strings.dashboard.categorySpend.empty}>
        <BarChart data={noCategorySpend} layout="vertical" margin={{ left: 8, right: 8 }}>
          <CartesianGrid horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" domain={[0, 100]} tick={false} stroke="#cbd5e1" />
          <YAxis type="category" dataKey="category" tick={false} stroke="#cbd5e1" />
          <Bar dataKey="amountMinor" fill="#0f766e" isAnimationActive={false} />
        </BarChart>
      </EmptyChartFrame>
    </Card>
  );
}

function LiquidityCard() {
  return (
    <Card title={strings.dashboard.liquidity.title} className="md:col-span-2">
      <EmptyChartFrame message={strings.dashboard.liquidity.empty}>
        <LineChart data={noLiquidity} margin={{ left: 8, right: 8 }}>
          <CartesianGrid stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={false} stroke="#cbd5e1" />
          <YAxis domain={[0, 100]} tick={false} stroke="#cbd5e1" />
          <Line
            dataKey="balanceMinor"
            stroke="#0f766e"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </EmptyChartFrame>
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

export function DashboardPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{strings.dashboard.title}</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <NetWorthCard />
        <BudgetsCard />
        <CategorySpendCard />
        <LiquidityCard />
      </div>
    </>
  );
}
