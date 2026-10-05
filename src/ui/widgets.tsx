import type { ReactNode } from 'react';
import type { Change } from '../domain/overview';
import { signedMoney, formatTenthsPercent, splitMoney } from './format';

/**
 * Importo grande con i centesimi e il simbolo più piccoli, come nel riferimento grafico.
 * L'importo completo resta nel testo (anche per chi usa un lettore di schermo).
 */
export function BigMoney({
  minor,
  className = '',
  currency = 'EUR',
}: {
  minor: number;
  className?: string;
  currency?: string;
}) {
  const parts = splitMoney(minor, currency);
  return (
    <p className={`font-bold leading-none tracking-tight ${className}`}>
      <span className="text-4xl md:text-5xl">
        {parts.sign}
        {parts.whole}
      </span>
      <span className="ml-0.5 text-xl text-muted md:text-2xl">
        {parts.fraction} {parts.currency}
      </span>
    </p>
  );
}

/**
 * Variazione con freccia, importo e percentuale. Il verso è scritto (freccia e segno), non solo
 * colorato. `goodWhen`: per le spese un aumento è negativo.
 */
export function DeltaBadge({
  change,
  goodWhen = 'up',
  showPercent = true,
}: {
  change: Change | null;
  goodWhen?: 'up' | 'down';
  showPercent?: boolean;
}) {
  if (change === null) return null;
  const { deltaMinor, tenthsPercent } = change;
  const direction = deltaMinor === 0 ? 0 : deltaMinor > 0 ? 1 : -1;
  const good = direction === 0 ? null : goodWhen === 'up' ? direction > 0 : direction < 0;
  const tone =
    good === null
      ? 'bg-line text-muted'
      : good
        ? 'bg-income/15 text-income'
        : 'bg-expense/15 text-expense';
  const arrow = direction === 0 ? '→' : direction > 0 ? '↑' : '↓';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold ${tone}`}
    >
      <span aria-hidden="true">{arrow}</span>
      {signedMoney(deltaMinor)}
      {showPercent && tenthsPercent !== null && (
        <span className="font-medium opacity-90">· {formatTenthsPercent(tenthsPercent)}</span>
      )}
    </span>
  );
}

/** Mini-grafico a linea per gli indicatori. Decorativo: il valore è sempre scritto accanto. */
export function Sparkline({
  values,
  color,
  className = 'h-10 w-full',
}: {
  values: readonly number[];
  color: string;
  className?: string;
}) {
  if (values.length < 2) return <div className={className} aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 30 - ((v - min) / span) * 28;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className={className}
      fill="none"
    >
      <polyline
        points={points}
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export interface Segment {
  key: string;
  color: string;
  amountMinor: number;
}

/** Barra a segmenti: ogni parte è larga quanto la sua quota del totale. */
export function StackedBar({ segments, label }: { segments: readonly Segment[]; label: string }) {
  const total = segments.reduce((sum, s) => sum + s.amountMinor, 0);
  if (total <= 0) return null;
  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-3 w-full overflow-hidden rounded-full bg-line"
    >
      {segments.map((s) => (
        <div
          key={s.key}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(s.amountMinor / total) * 100}%`, backgroundColor: s.color }}
        />
      ))}
    </div>
  );
}

/** Anello di avanzamento (0-100 %, oltre il 100 % l'anello resta pieno). */
export function Ring({
  percent,
  color,
  label,
  children,
}: {
  percent: number;
  color: string;
  label: string;
  children?: ReactNode;
}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.max(0, Math.min(100, percent));
  return (
    <div role="img" aria-label={label} className="relative mx-auto size-44">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="10" className="stroke-line" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={`${(shown / 100) * circumference} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center px-6 text-center">{children}</div>
    </div>
  );
}
