import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useData } from '../../app/DataProvider';
import type { Dataset } from '../../data/repository';
import type { Transaction } from '../../data/schema';
import { isIsoDate, todayIso } from '../../domain/dates';
import { BASE_CURRENCY, formatPlain, minorExponentOr } from '../../domain/money';
import {
  createMovement,
  createTransfer,
  updateMovement,
  type MovementInput,
  type MovementIssue,
  type MovementKind,
} from '../../domain/movements';
import { userMessage } from '../../ui/errors';
import { Field } from '../../ui/Field';
import { FormIssues } from '../../ui/FormIssues';
import { alertClass, buttonClass, inputClass, secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';
import { categoryPath, sortedCategories } from '../categories/labels';

type FormKind = MovementKind | 'transfer';

interface Props {
  data: Dataset;
  /** Movimento da modificare; null per un movimento nuovo. */
  editing: Transaction | null;
  onDone: () => void;
}

export function MovementForm({ data, editing, onDone }: Props) {
  const { save, rateFor } = useData();
  const formRef = useRef<HTMLFormElement>(null);

  const accounts = data.accounts.filter((a) => !a.is_archived || a.id === editing?.account_id);

  const [kind, setKind] = useState<FormKind>(
    editing ? (editing.amount_minor < 0 ? 'expense' : 'income') : 'expense',
  );
  const [amountText, setAmountText] = useState(
    editing ? formatPlain(Math.abs(editing.amount_minor), minorExponentOr(editing.currency)) : '',
  );
  const [date, setDate] = useState(editing?.date ?? todayIso());
  const [accountId, setAccountId] = useState(editing?.account_id ?? accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? '');
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [issues, setIssues] = useState<MovementIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Sul telefono il modulo si apre in cima all'elenco: lo si porta in vista.
  useEffect(() => {
    formRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  const ctx = { accounts: data.accounts, categories: data.categories };
  const categoryOptions = kind === 'transfer' ? [] : sortedCategories(data.categories, kind);

  const selectedAccount = data.accounts.find((a) => a.id === accountId);
  const currency = selectedAccount?.currency ?? BASE_CURRENCY;

  /** Tasso del giorno per un conto in valuta estera (dalla cache o dal servizio); undefined per l'EUR. */
  const resolveRate = async (): Promise<string | undefined> => {
    if (!selectedAccount || selectedAccount.currency === BASE_CURRENCY || !isIsoDate(date)) {
      return undefined;
    }
    // Modifica senza cambiare conto né data: si tiene il tasso già registrato col movimento.
    if (editing && editing.account_id === accountId && editing.date === date) {
      return editing.fx_rate;
    }
    return rateFor(date, selectedAccount.currency);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const fxRate = await resolveRate();
      let toSave: Transaction[];
      let isUpdate = false;

      if (kind === 'transfer') {
        const result = createTransfer(
          { fromAccountId: accountId, toAccountId, amountText, date, description, fxRate },
          ctx,
        );
        if (!result.ok) {
          setIssues(result.issues);
          setError(null);
          return;
        }
        toSave = result.value;
      } else {
        const input: MovementInput = {
          kind,
          amountText,
          date,
          accountId,
          categoryId: categoryId === '' ? null : categoryId,
          description,
          notes,
          fxRate,
        };
        const result = editing ? updateMovement(editing, input, ctx) : createMovement(input, ctx);
        if (!result.ok) {
          setIssues(result.issues);
          setError(null);
          return;
        }
        toSave = [result.value];
        isUpdate = editing !== null;
      }

      setIssues([]);
      await save({ transactions: isUpdate ? { update: toSave } : { insert: toSave } });
      onDone();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-line p-3">
        <p className="mb-3 text-sm">{strings.transactions.noAccounts}</p>
        <div className="flex flex-wrap gap-2">
          <Link to="/impostazioni" className={`${buttonClass} no-underline`}>
            {strings.common.goToSettings}
          </Link>
          <button type="button" className={secondaryButtonClass} onClick={onDone}>
            {strings.common.cancel}
          </button>
        </div>
      </div>
    );
  }

  const kinds: FormKind[] = editing ? [kind] : ['expense', 'income', 'transfer'];

  return (
    <form
      ref={formRef}
      className="mb-4 rounded-lg border border-line p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 className="mb-3 font-semibold">
        {editing ? strings.transactions.formEdit : strings.transactions.formAdd}
      </h3>
      <FormIssues messages={issues.map((issue) => strings.transactions.issues[issue])} />
      {error && (
        <p role="alert" className={`${alertClass} mb-3`}>
          {error}
        </p>
      )}

      <fieldset className="mb-3">
        <legend className="mb-1 text-sm font-medium">{strings.transactions.kind}</legend>
        <div className="grid grid-cols-3 gap-2">
          {kinds.map((value) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-sm font-medium ${
                kind === value
                  ? 'border-accent bg-surface-2 text-accent underline decoration-2 underline-offset-4'
                  : 'border-control bg-surface-2'
              }`}
            >
              <input
                type="radio"
                name="movement-kind"
                value={value}
                checked={kind === value}
                disabled={editing !== null}
                onChange={() => {
                  setKind(value);
                  setCategoryId('');
                }}
                className="sr-only"
              />
              {strings.transactions.kinds[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label={`${strings.transactions.amount} (${currency})`}
        htmlFor="movement-amount"
        hint={
          currency === BASE_CURRENCY
            ? strings.transactions.amountHint
            : `${strings.transactions.amountHint} ${strings.transactions.fxHint}`
        }
      >
        <input
          id="movement-amount"
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          className={inputClass}
          autoComplete="off"
        />
      </Field>

      <Field label={strings.transactions.date} htmlFor="movement-date">
        <input
          id="movement-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field
        label={
          kind === 'transfer' ? strings.transactions.fromAccount : strings.transactions.account
        }
        htmlFor="movement-account"
      >
        <select
          id="movement-account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className={inputClass}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </Field>

      {kind === 'transfer' ? (
        <Field label={strings.transactions.toAccount} htmlFor="movement-to-account">
          <select
            id="movement-to-account"
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            className={inputClass}
          >
            <option value="">{strings.common.noneOption}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label={strings.transactions.category} htmlFor="movement-category">
          <select
            id="movement-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputClass}
          >
            <option value="">{strings.transactions.toCategorize}</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryPath(category, data.categories)}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label={strings.transactions.description} htmlFor="movement-description">
        <input
          id="movement-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
          autoComplete="off"
        />
      </Field>

      {kind !== 'transfer' && (
        <Field label={strings.transactions.notes} htmlFor="movement-notes">
          <input
            id="movement-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>
      )}

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
