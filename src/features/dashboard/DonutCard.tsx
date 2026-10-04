import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { percentOf } from '../../domain/dashboard';
import { formatMoney, sumMinor } from '../../domain/money';
import { Card, EmptyState } from '../../ui/Card';
import { categoryColors, palette, tooltipStyle } from '../../ui/theme';
import type { ReactNode } from 'react';

export interface Slice {
  key: string;
  name: string;
  amountMinor: number;
}

/**
 * Ciambella con il totale al centro e, accanto, l'elenco con nome, importo e percentuale:
 * i dati si leggono dal testo, non solo dai colori.
 */
export function DonutCard({
  title,
  slices,
  emptyMessage,
  chartLabel,
  footer,
}: {
  title: string;
  slices: readonly Slice[];
  emptyMessage: string;
  chartLabel: (total: string) => string;
  footer?: ReactNode;
}) {
  const total = sumMinor(slices.map((s) => s.amountMinor));
  const colorOf = (index: number) => categoryColors[index % categoryColors.length] ?? palette.muted;

  return (
    <Card title={title} centered>
      {slices.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div
            role="img"
            aria-label={chartLabel(formatMoney(total))}
            className="relative h-44 w-44 shrink-0"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[...slices]}
                  dataKey="amountMinor"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="95%"
                  paddingAngle={2}
                  stroke={palette.surface}
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices.map((slice, index) => (
                    <Cell key={slice.key} fill={colorOf(index)} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(value) => formatMoney(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            <p className="pointer-events-none absolute inset-0 grid place-items-center px-8 text-center text-sm font-bold text-fg">
              {formatMoney(total)}
            </p>
          </div>
          <ul className="w-full text-sm">
            {slices.map((slice, index) => (
              <li
                key={slice.key}
                className="flex items-center justify-between gap-3 border-t border-line-soft py-1.5 first:border-t-0"
              >
                <span className="flex min-w-0 items-center gap-2 text-fg">
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: colorOf(index) }}
                  />
                  <span className="truncate">{slice.name}</span>
                </span>
                <span className="shrink-0 text-fg">
                  <strong>{formatMoney(slice.amountMinor)}</strong>{' '}
                  <span className="text-muted">({percentOf(slice.amountMinor, total)}%)</span>
                </span>
              </li>
            ))}
          </ul>
          {footer}
        </div>
      )}
    </Card>
  );
}
