import { useState } from 'react';
import { useData, useReadyData } from '../../app/DataProvider';
import { softDelete } from '../../data/repository';
import { ACCOUNT_TYPES, type Account } from '../../data/schema';
import {
  createAccount,
  setArchived,
  updateAccount,
  type AccountInput,
  type AccountIssue,
} from '../../domain/accounts';
import { todayIso } from '../../domain/dates';
import { accountUsage } from '../../domain/integrity';
import { CURRENCIES } from '../../domain/currencies';
import { accountBalanceMinor } from '../../domain/ledger';
import { formatMoney, formatPlain, minorExponentOr } from '../../domain/money';
import { Card } from '../../ui/Card';
import { userMessage } from '../../ui/errors';
import { Field } from '../../ui/Field';
import { FormIssues } from '../../ui/FormIssues';
import {
  alertClass,
  buttonClass,
  dangerButtonClass,
  inputClass,
  secondaryButtonClass,
} from '../../ui/styles';
import { strings } from '../../ui/strings';

function AccountForm({ account, onDone }: { account: Account | null; onDone: () => void }) {
  const { save } = useData();
  const { accounts } = useReadyData();
  const [name, setName] = useState(account?.name ?? '');
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [type, setType] = useState<Account['type']>(account?.type ?? 'checking');
  const [currency, setCurrency] = useState(account?.currency ?? 'EUR');
  const [balance, setBalance] = useState(
    account ? formatPlain(account.opening_balance_minor, minorExponentOr(account.currency)) : '',
  );
  const [openingDate, setOpeningDate] = useState(account?.opening_date ?? todayIso());
  const [issues, setIssues] = useState<AccountIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const input: AccountInput = {
      name,
      institution,
      type,
      currency,
      openingBalanceText: balance,
      openingDate,
    };
    const result = account
      ? updateAccount(account, input, accounts)
      : createAccount(input, accounts);
    if (!result.ok) {
      setIssues(result.issues);
      setError(null);
      return;
    }
    setIssues([]);
    setBusy(true);
    try {
      await save({ accounts: account ? { update: [result.value] } : { insert: [result.value] } });
      onDone();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mb-4 rounded-lg border border-line p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 className="mb-3 font-semibold">
        {account ? strings.accounts.formEdit : strings.accounts.formAdd}
      </h3>
      <FormIssues messages={issues.map((issue) => strings.accounts.issues[issue])} />
      {error && (
        <p role="alert" className={`${alertClass} mb-3`}>
          {error}
        </p>
      )}
      <Field label={strings.accounts.name} htmlFor="account-name">
        <input
          id="account-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          autoComplete="off"
        />
      </Field>
      <Field label={strings.accounts.institution} htmlFor="account-institution">
        <input
          id="account-institution"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          className={inputClass}
          autoComplete="off"
        />
      </Field>
      <Field label={strings.accounts.type} htmlFor="account-type">
        <select
          id="account-type"
          value={type}
          onChange={(e) => setType(e.target.value as Account['type'])}
          className={inputClass}
        >
          {ACCOUNT_TYPES.map((value) => (
            <option key={value} value={value}>
              {strings.accounts.types[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={strings.accounts.currency}
        htmlFor="account-currency"
        hint={account ? strings.accounts.currencyLocked : undefined}
      >
        <select
          id="account-currency"
          value={currency}
          // Dopo la creazione non si cambia: i movimenti già registrati sono in questa valuta.
          disabled={account !== null}
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
      <Field
        label={`${strings.accounts.openingBalance} (${currency})`}
        htmlFor="account-balance"
        hint={strings.accounts.openingBalanceHint}
      >
        <input
          id="account-balance"
          inputMode="decimal"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          className={inputClass}
          autoComplete="off"
        />
      </Field>
      <Field
        label={strings.accounts.openingDate}
        htmlFor="account-date"
        hint={strings.accounts.openingDateHint}
      >
        <input
          id="account-date"
          type="date"
          value={openingDate}
          onChange={(e) => setOpeningDate(e.target.value)}
          className={inputClass}
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

function AccountRow({
  account,
  balanceMinor,
  onEdit,
  onAction,
}: {
  account: Account;
  balanceMinor: number;
  onEdit: () => void;
  onAction: (action: 'archive' | 'restore' | 'delete') => void;
}) {
  return (
    <li className="flex flex-col gap-2 border-b border-line-soft py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{account.name}</p>
          <p className="text-xs text-muted">
            {strings.accounts.types[account.type]}
            {account.institution && ` · ${account.institution}`}
          </p>
        </div>
        <p
          className="shrink-0 font-semibold"
          aria-label={`${strings.accounts.balance}: ${formatMoney(balanceMinor, account.currency)}`}
        >
          {formatMoney(balanceMinor, account.currency)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButtonClass} onClick={onEdit}>
          {strings.common.edit}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => onAction(account.is_archived ? 'restore' : 'archive')}
        >
          {account.is_archived ? strings.common.restore : strings.common.archive}
        </button>
        <button type="button" className={dangerButtonClass} onClick={() => onAction('delete')}>
          {strings.common.delete}
        </button>
      </div>
    </li>
  );
}

export function AccountsCard() {
  const { save } = useData();
  const { accounts, transactions } = useReadyData();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = accounts.filter((a) => !a.is_archived);
  const archived = accounts.filter((a) => a.is_archived);

  const act = async (account: Account, action: 'archive' | 'restore' | 'delete') => {
    setNotice(null);
    try {
      if (action === 'delete') {
        const usage = accountUsage(account.id, transactions);
        if (usage > 0) {
          setNotice(strings.accounts.cannotDelete(usage));
          return;
        }
        if (!window.confirm(strings.accounts.confirmDelete(account.name))) return;
        await save({ accounts: { update: [softDelete(account)] } });
      } else {
        await save({ accounts: { update: [setArchived(account, action === 'archive')] } });
      }
    } catch (error) {
      setNotice(userMessage(error));
    }
  };

  const renderList = (list: Account[]) => (
    <ul>
      {list.map((account) => (
        <AccountRow
          key={account.id}
          account={account}
          balanceMinor={accountBalanceMinor(account, transactions)}
          onEdit={() => setEditing(account)}
          onAction={(action) => void act(account, action)}
        />
      ))}
    </ul>
  );

  return (
    <Card title={strings.accounts.title} className="mb-4">
      {notice && (
        <p role="alert" className={`${alertClass} mb-3`}>
          {notice}
        </p>
      )}

      {editing !== null && (
        <AccountForm
          key={editing === 'new' ? 'new' : editing.id}
          account={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {accounts.length === 0 && editing === null && (
        <p className="py-3 text-sm text-muted">{strings.accounts.empty}</p>
      )}
      {renderList(active)}

      {editing === null && (
        <button type="button" className={`${buttonClass} mt-3`} onClick={() => setEditing('new')}>
          {strings.accounts.add}
        </button>
      )}

      {archived.length > 0 && (
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
            {strings.accounts.archivedTitle} ({archived.length})
          </summary>
          {renderList(archived)}
        </details>
      )}
    </Card>
  );
}
