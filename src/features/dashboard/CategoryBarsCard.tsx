import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney, sumMinor } from '../../domain/money';
import { Card, EmptyState } from '../../ui/Card';
import { chartColors, palette, tooltipStyle } from '../../ui/theme';
import type { CategoryRow } from './categoryRows';

/** Barre orizzontali per categoria, con l'importo scritto accanto a ogni barra. */
export function CategoryBarsCard({
  title,
  rows,
  emptyMessage,
  chartLabel,
}: {
  title: string;
  rows: readonly CategoryRow[];
  emptyMessage: string;
  chartLabel: (total: string) => string;
}) {
  const total = sumMinor(rows.map((r) => r.amountMinor));

  return (
    <Card title={title} centered>
      {rows.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div
          role="img"
          aria-label={chartLabel(formatMoney(total))}
          style={{ height: rows.length * 38 + 16 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...rows]} layout="vertical" margin={{ left: 0, right: 84, top: 4 }}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={104}
                tick={{ fontSize: 12, fill: palette.fg }}
                stroke={chartColors.grid}
              />
              <Tooltip {...tooltipStyle} formatter={(value) => formatMoney(Number(value))} />
              <Bar
                dataKey="amountMinor"
                fill={chartColors.expense}
                radius={[0, 6, 6, 0]}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="amountMinor"
                  position="right"
                  fill={palette.fg}
                  fontSize={12}
                  formatter={(value) => formatMoney(Number(value))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
