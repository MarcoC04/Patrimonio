import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDateIt } from '../../domain/dates';
import { daysBetween } from '../../domain/period';
import { formatMoney } from '../../domain/money';
import type { Account } from '../../data/schema';
import { Card, EmptyState } from '../../ui/Card';
import { DataTable } from '../../ui/DataTable';
import { formatEuroCompact } from '../../ui/format';
import { strings } from '../../ui/strings';
import { chartColors, tooltipStyle } from '../../ui/theme';
import { BigMoney, DeltaBadge, Sparkline } from '../../ui/widgets';
import { DonutCard, sliceColor } from './DonutCard';
import type { OverviewModel } from './overviewModel';
import { RatesNotice } from './RatesNotice';
import { UnpricedNotice } from './UnpricedNotice';
import type { RatesState } from './useLatestRates';
import type { Dataset } from '../../data/repository';

const t = strings.overview;

/** Nome di una fetta della torta: il conto, oppure "Investimenti". */
function sliceName(accountId: string | null, accounts: readonly Account[]): string {
  if (accountId === null) return t.wealth.investments;
  return accounts.find((a) => a.id === accountId)?.name ?? '?';
}

/** "dal 06/07/2026" oppure "dall'inizio": a che punto di partenza si riferisce la variazione. */
export function sinceLabel(model: OverviewModel): string {
  return model.range.from === null
    ? t.hero.periodMax
    : t.hero.periodSince(formatDateIt(model.start));
}

/** Saldo generale: patrimonio netto, variazione nel periodo e composizione. */
export function HeroCard({
  model,
  accounts,
  rates,
  data,
}: {
  model: OverviewModel;
  accounts: readonly Account[];
  rates: RatesState;
  data: Dataset;
}) {
  return (
    <section aria-label={t.hero.title} className="card flex h-full flex-col p-5 md:p-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
        {t.hero.title}
      </p>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <BigMoney minor={model.wealth.totalMinor} />
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <DeltaBadge change={model.wealthChange} />
          <span className="text-sm text-muted">{sinceLabel(model)}</span>
        </div>
      </div>

      {model.slices.length > 0 && (
        <ul aria-label={t.hero.composition} className="mt-5 flex flex-wrap gap-2">
          {model.slices.map((slice, index) => (
            <li
              key={slice.accountId ?? 'investments'}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-surface-2 px-3 text-sm"
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ backgroundColor: sliceColor(index) }}
              />
              <span className="text-muted">{sliceName(slice.accountId, accounts)}</span>
              <strong className="font-semibold">{formatMoney(slice.amountMinor)}</strong>
            </li>
          ))}
        </ul>
      )}

      <RatesNotice rates={rates} missing={model.missing} />
      <UnpricedNotice ids={model.unpriced} assets={data.assets} />

      {/* L'andamento in piccolo riempie il riquadro e dà subito un'idea della direzione */}
      <div className="mt-auto pt-6">
        <Sparkline
          values={model.series.map((p) => p.totalMinor)}
          color={chartColors.accent}
          className="h-24 w-full"
        />
      </div>
    </section>
  );
}

/** Torta del patrimonio diviso per conto e investimenti: il primo grafico della dashboard. */
export function WealthDonutCard({
  model,
  accounts,
}: {
  model: OverviewModel;
  accounts: readonly Account[];
}) {
  return (
    <DonutCard
      title={t.wealth.title}
      centerLabel={t.wealth.center}
      slices={model.slices.map((s) => ({
        key: s.accountId ?? 'investments',
        name: sliceName(s.accountId, accounts),
        amountMinor: s.amountMinor,
      }))}
      emptyMessage={t.wealth.empty}
      chartLabel={t.wealth.chartLabel}
    />
  );
}

/** Etichetta corta di una data per l'asse: "05/10" per il dettaglio, "ott 26" quando i punti sono mensili. */
function axisLabel(date: string, monthly: boolean): string {
  const [year = '', month = '', day = ''] = date.split('-');
  if (!monthly) return `${day}/${month}`;
  const names = [
    'gen',
    'feb',
    'mar',
    'apr',
    'mag',
    'giu',
    'lug',
    'ago',
    'set',
    'ott',
    'nov',
    'dic',
  ];
  return `${names[Number(month) - 1] ?? month} ${year.slice(2)}`;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm text-fg">
      <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </li>
  );
}

/** Patrimonio nel tempo: area a pila, conti sotto e investimenti sopra. */
export function TrendCard({ model, hasAccounts }: { model: OverviewModel; hasAccounts: boolean }) {
  // useId produce ":r1:": nei riferimenti url(#...) dell'SVG si tolgono i due punti.
  const base = `tr-${useId().replace(/:/g, '')}`;
  // Oltre i 6 mesi i punti sono a fine mese: l'asse mostra mese e anno invece del giorno.
  const first = model.series[0]?.date;
  const last = model.series[model.series.length - 1]?.date;
  const monthly = first !== undefined && last !== undefined && daysBetween(first, last) > 190;
  const rows = model.series.map((p) => ({
    label: axisLabel(p.date, monthly),
    accounts: p.accountsMinor,
    investments: p.investmentsMinor,
  }));
  const rangeText = sinceLabel(model);

  return (
    <Card
      title={t.trend.title}
      description={rangeText}
      action={
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          <LegendDot color={chartColors.accent} label={t.trend.accounts} />
          <LegendDot color={chartColors.investments} label={t.trend.investments} />
        </ul>
      }
    >
      {!hasAccounts || rows.length < 2 ? (
        <EmptyState message={t.trend.empty} />
      ) : (
        <>
          <div role="img" aria-label={t.trend.chartLabel(rangeText)} className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id={`${base}-a`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColors.accent} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={chartColors.accent} stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id={`${base}-i`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColors.investments} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={chartColors.investments} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: chartColors.axis }}
                  stroke={chartColors.grid}
                  minTickGap={24}
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
                  stackId="wealth"
                  dataKey="accounts"
                  name={t.trend.accounts}
                  stroke={chartColors.accent}
                  strokeWidth={2.5}
                  fill={`url(#${base}-a)`}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  stackId="wealth"
                  dataKey="investments"
                  name={t.trend.investments}
                  stroke={chartColors.investments}
                  strokeWidth={2.5}
                  fill={`url(#${base}-i)`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <DataTable
            headers={[t.trend.date, t.trend.total]}
            rows={model.series.map((p) => [formatDateIt(p.date), formatMoney(p.totalMinor)])}
          />
        </>
      )}
    </Card>
  );
}

/** Variazione del patrimonio negli ultimi 7 giorni, 30 giorni e 12 mesi (sempre fino a oggi). */
export function RecentCard({ model }: { model: OverviewModel }) {
  return (
    <Card title={t.recent.title}>
      <ul className="grid gap-3">
        {model.recent.map((item) => {
          const up = item.change.deltaMinor >= 0;
          return (
            <li key={item.key} className="rounded-xl border border-line bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                  {t.recent[item.key]}
                </p>
                <DeltaBadge change={item.change} />
              </div>
              <Sparkline
                values={item.values}
                color={up ? chartColors.income : chartColors.expense}
                className="mt-2 h-9 w-full"
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
