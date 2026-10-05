import { useMemo, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { softDelete, type Dataset } from '../../data/repository';
import type { Asset } from '../../data/schema';
import { formatDateIt, todayIso } from '../../domain/dates';
import { formatDecimal } from '../../domain/decimal';
import {
  canDeleteAsset,
  canDeleteOperation,
  portfolioSummary,
  positionSummary,
  type PositionSummary,
} from '../../domain/investments';
import { formatMoney } from '../../domain/money';
import { Card, EmptyState } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { userMessage } from '../../ui/errors';
import { formatTenthsPercent, signedMoney } from '../../ui/format';
import { alertClass, buttonClass, dangerButtonClass, secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';
import { DataGate } from '../DataGate';
import { KpiTile } from '../dashboard/KpiTile';
import { RatesNotice } from '../dashboard/RatesNotice';
import { useLatestRates } from '../dashboard/useLatestRates';
import { HoldingForm } from './HoldingForm';
import { PriceForm } from './PriceForm';
import { TradeForm } from './TradeForm';

type Panel =
  | { kind: 'holding' }
  | { kind: 'trade'; assetId: string; type: 'buy' | 'sell' }
  | { kind: 'price'; assetId: string }
  | null;

const t = strings.investments;

function AssetCard({
  summary,
  data,
  onPanel,
  onNotice,
}: {
  summary: PositionSummary;
  data: Dataset;
  onPanel: (panel: Panel) => void;
  onNotice: (message: string | null) => void;
}) {
  const { save } = useData();
  const { asset } = summary;
  const operations = data.investmentTransactions
    .filter((o) => o.asset_id === asset.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));

  const removeOperation = async (id: string) => {
    onNotice(null);
    if (!canDeleteOperation(id, asset.id, data.investmentTransactions)) {
      onNotice(t.operations.cannotDelete);
      return;
    }
    if (!window.confirm(t.operations.confirmDelete)) return;
    const target = operations.find((o) => o.id === id);
    if (!target) return;
    try {
      await save({ investmentTransactions: { update: [softDelete(target)] } });
    } catch (error) {
      onNotice(userMessage(error));
    }
  };

  const removeAsset = async () => {
    onNotice(null);
    if (!canDeleteAsset(asset.id, data.investmentTransactions)) {
      onNotice(t.operations.cannotDeleteAsset);
      return;
    }
    if (!window.confirm(t.operations.confirmDeleteAsset(asset.name))) return;
    try {
      // L'asset e i suoi prezzi si eliminano insieme.
      await save({
        assets: { update: [softDelete(asset)] },
        priceHistory: {
          update: data.priceHistory
            .filter((p) => p.asset_id === asset.id)
            .map((p) => softDelete(p)),
        },
      });
    } catch (error) {
      onNotice(userMessage(error));
    }
  };

  const gainTone =
    summary.gainMinor === null
      ? 'text-fg'
      : summary.gainMinor >= 0
        ? 'text-income'
        : 'text-expense';
  const detail = [t.classes[asset.asset_class], asset.symbol, asset.isin, asset.currency]
    .filter((part) => part !== '')
    .join(' · ');

  return (
    <Card title={asset.name} className="mb-4">
      <p className="-mt-2 mb-3 text-xs text-muted">{detail}</p>

      {summary.status === 'no_price' && (
        <p role="alert" className={`${alertClass} mb-3`}>
          {t.position.noPrice}
        </p>
      )}
      {summary.status === 'no_rate' && (
        <p role="alert" className={`${alertClass} mb-3`}>
          {t.position.noRate}
        </p>
      )}

      <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-muted">{t.position.quantity}</dt>
          <dd className="font-semibold text-fg">{formatDecimal(summary.quantity)}</dd>
        </div>
        <div>
          <dt className="text-muted">{t.position.price}</dt>
          <dd className="font-semibold text-fg">
            {summary.price ? (
              <>
                {formatDecimal(summary.price.price)} {asset.currency}
                <span className="block text-xs font-normal text-muted">
                  {t.position.priceDate(formatDateIt(summary.price.date))}
                </span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{t.position.value}</dt>
          <dd className="font-semibold text-fg">
            {summary.valueMinor === null ? '—' : formatMoney(summary.valueMinor)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{t.position.paid}</dt>
          <dd className="font-semibold text-fg">{formatMoney(summary.investedMinor)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted">{t.position.gain}</dt>
          <dd className={`font-semibold ${gainTone}`}>
            {summary.gainMinor === null ? '—' : signedMoney(summary.gainMinor)}
            {summary.roiTenthsPercent !== null &&
              ` (${formatTenthsPercent(summary.roiTenthsPercent)})`}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => onPanel({ kind: 'trade', assetId: asset.id, type: 'buy' })}
        >
          {t.actions.buy}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => onPanel({ kind: 'trade', assetId: asset.id, type: 'sell' })}
        >
          {t.actions.sell}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => onPanel({ kind: 'price', assetId: asset.id })}
        >
          {t.actions.updatePrice}
        </button>
        <button type="button" className={dangerButtonClass} onClick={() => void removeAsset()}>
          {t.actions.deleteAsset}
        </button>
      </div>

      {operations.length > 0 && (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-fg">
            {t.operations.title} ({operations.length})
          </summary>
          <ul>
            {operations.map((operation) => (
              <li
                key={operation.id}
                className="flex items-center justify-between gap-2 border-t border-line-soft py-2 text-sm"
              >
                <span className="min-w-0 text-fg">
                  <span className="block text-xs text-muted">{formatDateIt(operation.date)}</span>
                  {t.operations.row(
                    operation.type === 'buy' ? t.operations.buy : t.operations.sell,
                    formatDecimal(operation.quantity),
                    `${formatDecimal(operation.unit_price)} ${operation.currency}`,
                  )}
                </span>
                <button
                  type="button"
                  className={dangerButtonClass}
                  onClick={() => void removeOperation(operation.id)}
                >
                  {strings.common.delete}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function InvestmentsView({ data }: { data: Dataset }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const rates = useLatestRates(data.accounts, data.assets);
  const today = todayIso();

  const portfolio = useMemo(
    () => ({
      operations: data.investmentTransactions,
      prices: data.priceHistory,
    }),
    [data.investmentTransactions, data.priceHistory],
  );
  const summaries = useMemo(
    () =>
      data.assets
        .map((asset) => positionSummary(asset, portfolio, today, rates.rates))
        // I più grandi per primi; le posizioni senza valore in fondo.
        .sort((a, b) => (b.valueMinor ?? -1) - (a.valueMinor ?? -1)),
    [data.assets, portfolio, today, rates.rates],
  );
  const totals = useMemo(() => portfolioSummary(summaries), [summaries]);
  const missing = [
    ...new Set(summaries.filter((s) => s.status === 'no_rate').map((s) => s.asset.currency)),
  ];

  const assetOf = (id: string): Asset | undefined => data.assets.find((a) => a.id === id);
  const close = () => setPanel(null);

  const activeAsset = panel && panel.kind !== 'holding' ? assetOf(panel.assetId) : undefined;
  const gainTone = totals.gainMinor >= 0 ? 'income' : 'expense';

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile icon="netWorth" label={t.summary.value} value={formatMoney(totals.valueMinor)} />
        <KpiTile
          icon="savings"
          label={t.summary.invested}
          value={formatMoney(totals.investedMinor)}
        />
        <KpiTile
          icon="income"
          label={t.summary.gain}
          value={signedMoney(totals.gainMinor)}
          tone={gainTone}
        />
        <KpiTile
          icon="income"
          label={t.summary.roi}
          value={
            totals.roiTenthsPercent === null ? '—' : formatTenthsPercent(totals.roiTenthsPercent)
          }
          tone={gainTone}
        />
      </div>
      <p className="mb-2 text-xs text-muted">{t.summary.note}</p>
      <RatesNotice rates={rates} missing={missing} />

      {notice && (
        <p role="alert" className={`${alertClass} my-3`}>
          {notice}
        </p>
      )}

      <div className="my-4">
        {panel === null ? (
          <button
            type="button"
            className={buttonClass}
            onClick={() => setPanel({ kind: 'holding' })}
          >
            {t.addAsset}
          </button>
        ) : panel.kind === 'holding' ? (
          <HoldingForm data={data} onDone={close} />
        ) : activeAsset && panel.kind === 'trade' ? (
          <TradeForm
            key={`${panel.assetId}-${panel.type}`}
            data={data}
            asset={activeAsset}
            type={panel.type}
            onDone={close}
          />
        ) : activeAsset && panel.kind === 'price' ? (
          <PriceForm key={panel.assetId} data={data} asset={activeAsset} onDone={close} />
        ) : null}
      </div>

      {summaries.length === 0 ? (
        <Card title={t.title}>
          <EmptyState message={t.empty} />
        </Card>
      ) : (
        summaries.map((summary) => (
          <AssetCard
            key={summary.asset.id}
            summary={summary}
            data={data}
            onPanel={(next) => {
              setNotice(null);
              setPanel(next);
            }}
            onNotice={setNotice}
          />
        ))
      )}
    </>
  );
}

export function InvestmentsPage() {
  return (
    <>
      <PageHeader icon="investments" title={t.title} subtitle={strings.subtitles.investments} />
      <DataGate title={t.title}>{(data) => <InvestmentsView data={data} />}</DataGate>
    </>
  );
}
