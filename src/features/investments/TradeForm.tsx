import { useEffect, useRef, useState } from 'react';
import { useData } from '../../app/DataProvider';
import type { Dataset } from '../../data/repository';
import type { Asset } from '../../data/schema';
import { formatDecimalPlain } from '../../domain/decimal';
import { isIsoDate, todayIso } from '../../domain/dates';
import { createTrade, priceAt, type TradeInput, type TradeIssue } from '../../domain/investments';
import { BASE_CURRENCY } from '../../domain/money';
import { userMessage } from '../../ui/errors';
import { Field } from '../../ui/Field';
import { FormIssues } from '../../ui/FormIssues';
import { alertClass, buttonClass, inputClass, secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';

const t = strings.investments.tradeForm;

/** Acquisto o vendita di un asset già inserito. */
export function TradeForm({
  data,
  asset,
  type,
  onDone,
}: {
  data: Dataset;
  asset: Asset;
  type: 'buy' | 'sell';
  onDone: () => void;
}) {
  const { save, rateFor } = useData();
  const formRef = useRef<HTMLFormElement>(null);

  // Si propone l'ultimo prezzo noto: di solito è quello da cui si parte.
  const known = priceAt(asset.id, data.priceHistory, data.investmentTransactions, todayIso());
  const [date, setDate] = useState(todayIso());
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState(known ? formatDecimalPlain(known.price) : '');
  const [fees, setFees] = useState('');
  const [accountId, setAccountId] = useState('');
  const [issues, setIssues] = useState<TradeIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    formRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  const brokerageAccounts = data.accounts.filter((a) => a.type === 'brokerage' && !a.is_archived);

  const submit = async () => {
    setBusy(true);
    try {
      const fxRate =
        asset.currency !== BASE_CURRENCY && isIsoDate(date)
          ? await rateFor(date, asset.currency)
          : undefined;
      const input: TradeInput = {
        assetId: asset.id,
        type,
        date,
        quantityText: quantity,
        unitPriceText: unitPrice,
        feesText: fees,
        accountId: accountId === '' ? null : accountId,
        fxRate,
      };
      const result = createTrade(input, {
        assets: data.assets,
        operations: data.investmentTransactions,
        accounts: data.accounts,
      });
      if (!result.ok) {
        setIssues(result.issues);
        setError(null);
        return;
      }
      setIssues([]);
      await save({ investmentTransactions: { insert: [result.value] } });
      onDone();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      ref={formRef}
      className="mb-4 rounded-2xl border border-line bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 className="mb-3 font-semibold text-fg">
        {type === 'buy' ? t.buyTitle(asset.name) : t.sellTitle(asset.name)}
      </h3>
      <FormIssues messages={issues.map((issue) => strings.investments.issues[issue])} />
      {error && (
        <p role="alert" className={`${alertClass} mb-3`}>
          {error}
        </p>
      )}

      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field
          label={t.quantity}
          htmlFor="trade-quantity"
          hint={strings.investments.holdingForm.quantityHint}
        >
          <input
            id="trade-quantity"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>
        <Field label={`${t.unitPrice} (${asset.currency})`} htmlFor="trade-price">
          <input
            id="trade-price"
            inputMode="decimal"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>
        <Field label={t.date} htmlFor="trade-date">
          <input
            id="trade-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={`${t.fees} (${asset.currency})`} htmlFor="trade-fees">
          <input
            id="trade-fees"
            inputMode="decimal"
            value={fees}
            onChange={(e) => setFees(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>
      </div>
      <Field label={t.account} htmlFor="trade-account">
        <select
          id="trade-account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className={inputClass}
        >
          <option value="">{t.noAccount}</option>
          {brokerageAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? strings.common.saving : strings.common.save}
        </button>
        <button type="button" onClick={onDone} disabled={busy} className={secondaryButtonClass}>
          {strings.common.cancel}
        </button>
      </div>
    </form>
  );
}
