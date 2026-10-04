import { useEffect, useRef, useState } from 'react';
import { useData } from '../../app/DataProvider';
import type { Dataset } from '../../data/repository';
import type { Asset } from '../../data/schema';
import { formatDecimalPlain } from '../../domain/decimal';
import { todayIso } from '../../domain/dates';
import { createPrice, priceAt, type PriceIssue } from '../../domain/investments';
import { userMessage } from '../../ui/errors';
import { Field } from '../../ui/Field';
import { FormIssues } from '../../ui/FormIssues';
import { alertClass, buttonClass, inputClass, secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';

const t = strings.investments.priceForm;

/** Nuovo prezzo di un asset. Un secondo prezzo nello stesso giorno sostituisce il primo. */
export function PriceForm({
  data,
  asset,
  onDone,
}: {
  data: Dataset;
  asset: Asset;
  onDone: () => void;
}) {
  const { save } = useData();
  const formRef = useRef<HTMLFormElement>(null);

  const known = priceAt(asset.id, data.priceHistory, data.investmentTransactions, todayIso());
  const [price, setPrice] = useState(known ? formatDecimalPlain(known.price) : '');
  const [date, setDate] = useState(todayIso());
  const [issues, setIssues] = useState<PriceIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    formRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  const submit = async () => {
    const result = createPrice(
      { assetId: asset.id, date, priceText: price },
      data.assets,
      data.priceHistory,
    );
    if (!result.ok) {
      setIssues(result.issues);
      setError(null);
      return;
    }
    setIssues([]);
    setBusy(true);
    try {
      const { point, isUpdate } = result.value;
      await save({ priceHistory: isUpdate ? { update: [point] } : { insert: [point] } });
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
      <h3 className="mb-3 font-semibold text-fg">{t.title(asset.name)}</h3>
      <FormIssues messages={issues.map((issue) => strings.investments.issues[issue])} />
      {error && (
        <p role="alert" className={`${alertClass} mb-3`}>
          {error}
        </p>
      )}
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label={`${t.price} (${asset.currency})`} htmlFor="price-value">
          <input
            id="price-value"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>
        <Field label={t.date} htmlFor="price-date">
          <input
            id="price-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
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
