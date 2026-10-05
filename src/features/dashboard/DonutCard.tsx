import type { ReactNode } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { percentOf } from '../../domain/dashboard';
import { formatMoney, sumMinor } from '../../domain/money';
import { Card, EmptyState } from '../../ui/Card';
import { categoryColors, palette, tooltipStyle } from '../../ui/theme';

export interface Slice {
  key: string;
  name: string;
  amountMinor: number;
}

/** Colore della fetta in posizione `index` (lo stesso per ciambella, elenco e chip). */
export const sliceColor = (index: number): string =>
  categoryColors[index % categoryColors.length] ?? palette.muted;

/**
 * Ciambella con il totale al centro e, sotto, l'elenco con nome, importo e percentuale:
 * i dati si leggono dal testo, non solo dai colori.
 */
export function DonutCard({
  title,
  slices,
  emptyMessage,
  chartLabel,
  centerLabel,
  footer,
  className = '',
}: {
  title: string;
  slices: readonly Slice[];
  emptyMessage: string;
  chartLabel: (total: string) => string;
  /** Scritta piccola sopra l'importo al centro (es. "Totale"). */
  centerLabel?: string;
  footer?: ReactNode;
  className?: string;
}) {
  const total = sumMinor(slices.map((s) => s.amountMinor));

  return (
    <Card title={title} className={className}>
      {slices.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div
            role="img"
            aria-label={chartLabel(formatMoney(total))}
            className="relative size-48 shrink-0"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[...slices]}
                  dataKey="amountMinor"
                  nameKey="name"
                  innerRadius="66%"
                  outerRadius="96%"
                  paddingAngle={3}
                  cornerRadius={6}
                  stroke={palette.surface}
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices.map((slice, index) => (
                    <Cell key={slice.key} fill={sliceColor(index)} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(value) => formatMoney(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-9 text-center">
              <div>
                {centerLabel && (
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                    {centerLabel}
                  </p>
                )}
                <p className="text-lg font-bold leading-tight text-fg">{formatMoney(total)}</p>
              </div>
            </div>
          </div>
          <ul className="w-full text-sm">
            {slices.map((slice, index) => (
              <li
                key={slice.key}
                className="flex items-center justify-between gap-3 border-t border-line-soft py-2 first:border-t-0"
              >
                <span className="flex min-w-0 items-center gap-2 text-fg">
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: sliceColor(index) }}
                  />
                  <span className="truncate">{slice.name}</span>
                </span>
                <span className="shrink-0 text-right text-fg">
                  <strong>{formatMoney(slice.amountMinor)}</strong>{' '}
                  <span className="text-muted">{percentOf(slice.amountMinor, total)}%</span>
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
