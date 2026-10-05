import { Link } from 'react-router';
import type { Dataset } from '../../data/repository';
import { percentOf } from '../../domain/dashboard';
import { formatDecimal } from '../../domain/decimal';
import { portfolioSummary } from '../../domain/investments';
import { formatMoney } from '../../domain/money';
import { Avatar } from '../../ui/Avatar';
import { Card, EmptyState } from '../../ui/Card';
import { formatTenthsPercent, signedMoney } from '../../ui/format';
import { secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';
import { chartColors } from '../../ui/theme';
import { sliceColor } from './DonutCard';
import type { OverviewModel } from './overviewModel';
import { UnpricedNotice } from './UnpricedNotice';

const t = strings.overview;

/** Barra sottile di avanzamento: la quota è anche scritta, il colore non basta da solo. */
function Meter({ percent, color }: { percent: number; color: string }) {
  return (
    <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(100, percent)}%`, backgroundColor: color }}
      />
    </div>
  );
}

/** Saldo di ogni conto alla fine del periodo, con la sua quota sul totale dei conti. */
export function AccountsBalanceCard({ model }: { model: OverviewModel }) {
  const positive = model.balances.reduce((sum, b) => sum + Math.max(0, b.balanceMinor), 0);
  return (
    <Card title={t.accounts.title}>
      {model.balances.length === 0 ? (
        <EmptyState message={t.accounts.empty} />
      ) : (
        <>
          <ul>
            {model.balances.map(({ account, balanceMinor }, index) => (
              <li key={account.id} className="border-t border-line-soft py-3 first:border-t-0">
                <div className="flex items-center gap-3">
                  <Avatar label={account.name} color={sliceColor(index)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{account.name}</p>
                    <p className="text-xs text-muted">{strings.accounts.types[account.type]}</p>
                  </div>
                  <p className={`shrink-0 font-semibold ${balanceMinor < 0 ? 'text-expense' : ''}`}>
                    {formatMoney(balanceMinor)}
                  </p>
                </div>
                {balanceMinor > 0 && positive > 0 && (
                  <div className="mt-2 flex items-center gap-3 pl-[52px]">
                    <Meter percent={percentOf(balanceMinor, positive)} color={sliceColor(index)} />
                    <span className="w-10 shrink-0 text-right text-xs text-muted">
                      {percentOf(balanceMinor, positive)}%
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between border-t border-line pt-3 text-sm">
            <span className="text-muted">{t.accounts.total}</span>
            <strong>{formatMoney(model.wealth.accountsMinor)}</strong>
          </p>
        </>
      )}
    </Card>
  );
}

/** Le cinque voci di spesa più alte nel periodo, raggruppate per esercente. */
export function MerchantsCard({ model }: { model: OverviewModel }) {
  const top = model.merchants[0]?.amountMinor ?? 0;
  return (
    <Card title={t.merchants.title}>
      {model.merchants.length === 0 ? (
        <EmptyState message={t.merchants.empty} />
      ) : (
        <ul>
          {model.merchants.map((merchant, index) => (
            <li key={merchant.key} className="border-t border-line-soft py-3 first:border-t-0">
              <div className="flex items-center gap-3">
                <Avatar label={merchant.name} color={sliceColor(index)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{merchant.name}</p>
                  <p className="text-xs text-muted">{t.merchants.count(merchant.count)}</p>
                </div>
                <p className="shrink-0 font-semibold text-expense">
                  {formatMoney(merchant.amountMinor)}
                </p>
              </div>
              <div className="mt-2 pl-[52px]">
                <Meter
                  percent={top > 0 ? percentOf(merchant.amountMinor, top) : 0}
                  color={chartColors.expense}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Posizioni aperte con valore, guadagno e rendimento. */
export function InvestmentsOverviewCard({ model, data }: { model: OverviewModel; data: Dataset }) {
  const summary = portfolioSummary(model.positions);
  return (
    <Card
      title={t.investments.title}
      action={
        <Link to="/investimenti" className={`${secondaryButtonClass} no-underline`}>
          {strings.nav.investments}
        </Link>
      }
    >
      {model.positions.length === 0 ? (
        <EmptyState message={t.investments.empty} />
      ) : (
        <>
          <ul>
            {model.positions.map((position, index) => {
              const roi = position.roiTenthsPercent;
              const gain = position.gainMinor;
              return (
                <li
                  key={position.asset.id}
                  className="flex items-center gap-3 border-t border-line-soft py-3 first:border-t-0"
                >
                  <Avatar label={position.asset.name} color={sliceColor(index)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{position.asset.name}</p>
                    <p className="text-xs text-muted">
                      {t.investments.quantity(formatDecimal(position.quantity))}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">
                      {position.valueMinor === null ? '—' : formatMoney(position.valueMinor)}
                    </p>
                    {gain !== null && (
                      <p
                        className={`text-xs font-medium ${gain >= 0 ? 'text-income' : 'text-expense'}`}
                      >
                        {signedMoney(gain)}
                        {roi !== null && ` · ${formatTenthsPercent(roi)}`}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-3 text-sm">
            <span className="text-muted">{t.investments.total}</span>
            <span className="text-right">
              <strong>{formatMoney(summary.valueMinor)}</strong>{' '}
              <span className={summary.gainMinor >= 0 ? 'text-income' : 'text-expense'}>
                {signedMoney(summary.gainMinor)}
                {summary.roiTenthsPercent !== null &&
                  ` · ${formatTenthsPercent(summary.roiTenthsPercent)}`}
              </span>
            </span>
          </div>
          <UnpricedNotice ids={model.unpriced} assets={data.assets} />
        </>
      )}
    </Card>
  );
}
