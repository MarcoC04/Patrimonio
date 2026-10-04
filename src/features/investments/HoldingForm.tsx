import { useEffect, useRef, useState } from 'react';
import { useData } from '../../app/DataProvider';
import type { Dataset } from '../../data/repository';
import { ASSET_CLASSES } from '../../data/schema';
import { CURRENCIES } from '../../domain/currencies';
import { isIsoDate, todayIso } from '../../domain/dates';
import { createHolding, type HoldingInput, type HoldingIssue } from '../../domain/investments';
import { BASE_CURRENCY } from '../../domain/money';
import { userMessage } from '../../ui/errors';
import { Field } from '../../ui/Field';
import { FormIssues } from '../../ui/FormIssues';
import { alertClass, buttonClass, inputClass, secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';

const t = strings.investments.holdingForm;

/** Nuovo asset già posseduto: nome, quantità, prezzo pagato e (facoltativo) prezzo attuale. */
export function HoldingForm({ data, onDone }: { data: Dataset; onDone: () => void }) {
  const { save, rateFor } = useData();
  const formRef = useRef<HTMLFormElement>(null);

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [isin, setIsin] = useState('');
  const [assetClass, setAssetClass] = useState<string>('etf');
  const [currency, setCurrency] = useState<string>(BASE_CURRENCY);
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [fees, setFees] = useState('');
  const [accountId, setAccountId] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [issues, setIssues] = useState<HoldingIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    formRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  const brokerageAccounts = data.accounts.filter((a) => a.type === 'brokerage' && !a.is_archived);

  const submit = async () => {
    setBusy(true);
    try {
      // Per un asset in valuta estera serve il cambio del giorno dell'acquisto.
      const fxRate =
        currency !== BASE_CURRENCY && isIsoDate(purchaseDate)
          ? await rateFor(purchaseDate, currency)
          : undefined;

      const input: HoldingInput = {
        asset: { name, symbol, isin, assetClass, currency },
        quantityText: quantity,
        purchasePriceText: purchasePrice,
        feesText: fees,
        purchaseDate,
        accountId: accountId === '' ? null : accountId,
        fxRate,
        currentPriceText: currentPrice,
        currentPriceDate: todayIso(),
      };
      const result = createHolding(input, {
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
      const { asset, trade, price } = result.value;
      // Asset, acquisto iniziale e prezzo attuale si salvano insieme: o tutto o niente.
      await save({
        assets: { insert: [asset] },
        investmentTransactions: { insert: [trade] },
        ...(price ? { priceHistory: { insert: [price] } } : {}),
      });
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
      <h3 className="mb-3 font-semibold text-fg">{t.title}</h3>
      <FormIssues messages={issues.map((issue) => strings.investments.issues[issue])} />
      {error && (
        <p role="alert" className={`${alertClass} mb-3`}>
          {error}
        </p>
      )}

      <Field label={t.name} htmlFor="holding-name">
        <input
          id="holding-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.namePlaceholder}
          className={inputClass}
          autoComplete="off"
        />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label={t.symbol} htmlFor="holding-symbol">
          <input
            id="holding-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>
        <Field label={t.isin} htmlFor="holding-isin">
          <input
            id="holding-isin"
            value={isin}
            onChange={(e) => setIsin(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>
        <Field label={t.assetClass} htmlFor="holding-class">
          <select
            id="holding-class"
            value={assetClass}
            onChange={(e) => setAssetClass(e.target.value)}
            className={inputClass}
          >
            {ASSET_CLASSES.map((value) => (
              <option key={value} value={value}>
                {strings.investments.classes[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.currency} htmlFor="holding-currency">
          <select
            id="holding-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputClass}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={t.quantity} htmlFor="holding-quantity" hint={t.quantityHint}>
        <input
          id="holding-quantity"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className={inputClass}
          autoComplete="off"
        />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label={`${t.purchasePrice} (${currency})`} htmlFor="holding-price">
          <input
            id="holding-price"
            inputMode="decimal"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>
        <Field label={t.purchaseDate} htmlFor="holding-date">
          <input
            id="holding-date"
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={`${t.fees} (${currency})`} htmlFor="holding-fees">
          <input
            id="holding-fees"
            inputMode="decimal"
            value={fees}
            onChange={(e) => setFees(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>
        <Field label={t.account} htmlFor="holding-account">
          <select
            id="holding-account"
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
      </div>
      <Field
        label={`${t.currentPrice} (${currency})`}
        htmlFor="holding-current"
        hint={currency === BASE_CURRENCY ? t.currentPriceHint : `${t.currentPriceHint} ${t.fxHint}`}
      >
        <input
          id="holding-current"
          inputMode="decimal"
          value={currentPrice}
          onChange={(e) => setCurrentPrice(e.target.value)}
          className={inputClass}
          autoComplete="off"
        />
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
