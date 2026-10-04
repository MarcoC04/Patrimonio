import { useMemo, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { softDelete, type Dataset } from '../../data/repository';
import type { Transaction } from '../../data/schema';
import { formatDateIt } from '../../domain/dates';
import {
  filterTransactions,
  sortNewestFirst,
  totalsMinor,
  type TransactionFilter,
} from '../../domain/ledger';
import { formatMoney } from '../../domain/money';
import { Card, EmptyState } from '../../ui/Card';
import { userMessage } from '../../ui/errors';
import { signedMoney } from '../../ui/format';
import { alertClass, buttonClass, dangerButtonClass, secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';
import { categoryPath } from '../categories/labels';
import { DataGate } from '../DataGate';
import { MovementFilters } from './MovementFilters';
import { MovementForm } from './MovementForm';

const PAGE_SIZE = 100;

function Summary({ transactions }: { transactions: readonly Transaction[] }) {
  const totals = totalsMinor(transactions);
  const stat = 'flex-1 rounded-lg border border-slate-300 bg-white p-2 text-center';
  return (
    <section aria-label={strings.transactions.summary.net} className="mb-4">
      <dl className="flex gap-2">
        <div className={stat}>
          <dt className="text-xs text-slate-600">{strings.transactions.summary.income}</dt>
          <dd className="font-semibold text-green-800">{formatMoney(totals.incomeMinor)}</dd>
        </div>
        <div className={stat}>
          <dt className="text-xs text-slate-600">{strings.transactions.summary.expense}</dt>
          <dd className="font-semibold text-red-700">{formatMoney(totals.expenseMinor)}</dd>
        </div>
        <div className={stat}>
          <dt className="text-xs text-slate-600">{strings.transactions.summary.net}</dt>
          <dd className="font-semibold">{signedMoney(totals.netMinor)}</dd>
        </div>
      </dl>
      <p className="mt-1 text-xs text-slate-600">{strings.transactions.summary.note}</p>
    </section>
  );
}

function TransactionsView({ data }: { data: Dataset }) {
  const { save } = useData();
  const [filter, setFilter] = useState<TransactionFilter>({});
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [notice, setNotice] = useState<string | null>(null);

  const accountNames = useMemo(
    () => new Map(data.accounts.map((a) => [a.id, a.name] as const)),
    [data.accounts],
  );

  // Per ogni giroconto "A → B": il lato negativo è il conto di partenza, quello positivo di arrivo.
  const transferLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const tx of data.transactions) {
      if (tx.transfer_group_id === null || labels.has(tx.transfer_group_id)) continue;
      const sides = data.transactions.filter((t) => t.transfer_group_id === tx.transfer_group_id);
      const from = sides.find((t) => t.amount_minor < 0);
      const to = sides.find((t) => t.amount_minor > 0);
      labels.set(
        tx.transfer_group_id,
        strings.transactions.transferLabel(
          accountNames.get(from?.account_id ?? '') ?? '?',
          accountNames.get(to?.account_id ?? '') ?? '?',
        ),
      );
    }
    return labels;
  }, [data.transactions, accountNames]);

  const filtered = useMemo(
    () => sortNewestFirst(filterTransactions(data.transactions, filter)),
    [data.transactions, filter],
  );

  const changeFilter = (next: TransactionFilter) => {
    setFilter(next);
    setVisible(PAGE_SIZE);
  };

  const remove = async (tx: Transaction) => {
    setNotice(null);
    const group = tx.transfer_group_id;
    // Un giroconto ha due lati: si eliminano sempre insieme, anche se uno è fuori dai filtri.
    const targets = group ? data.transactions.filter((t) => t.transfer_group_id === group) : [tx];
    const message = group
      ? strings.transactions.confirmDeleteTransfer
      : strings.transactions.confirmDelete(tx.description);
    if (!window.confirm(message)) return;
    try {
      await save({ transactions: { update: targets.map((t) => softDelete(t)) } });
    } catch (error) {
      setNotice(userMessage(error));
    }
  };

  const shown = filtered.slice(0, visible);

  return (
    <>
      {editing === null ? (
        <button type="button" className={`${buttonClass} mb-4`} onClick={() => setEditing('new')}>
          {strings.transactions.add}
        </button>
      ) : (
        <MovementForm
          key={editing === 'new' ? 'new' : editing.id}
          data={data}
          editing={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {notice && (
        <p role="alert" className={`${alertClass} mb-4`}>
          {notice}
        </p>
      )}

      <MovementFilters filter={filter} categories={data.categories} onChange={changeFilter} />
      <Summary transactions={filtered} />

      <Card title={strings.transactions.title}>
        {data.transactions.length === 0 ? (
          <EmptyState message={strings.pages.transactions.empty} />
        ) : filtered.length === 0 ? (
          <EmptyState message={strings.transactions.empty} />
        ) : (
          <ul>
            {shown.map((tx) => {
              const isTransfer = tx.transfer_group_id !== null;
              const category = data.categories.find((c) => c.id === tx.category_id);
              const detail = isTransfer
                ? (transferLabels.get(tx.transfer_group_id ?? '') ?? '')
                : category
                  ? categoryPath(category, data.categories)
                  : strings.transactions.toCategorize;
              return (
                <li
                  key={tx.id}
                  className="flex flex-col gap-2 border-b border-slate-200 py-3 last:border-b-0"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{tx.description || detail}</p>
                      <p className="text-xs text-slate-600">
                        {formatDateIt(tx.date)} · {accountNames.get(tx.account_id) ?? '?'} ·{' '}
                        {detail}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`font-semibold ${tx.amount_minor < 0 ? 'text-red-700' : 'text-green-800'}`}
                      >
                        {signedMoney(tx.amount_minor, tx.currency)}
                      </p>
                      {tx.currency !== 'EUR' && (
                        <p className="text-xs text-slate-600">
                          {strings.transactions.inEuro(signedMoney(tx.amount_base_minor))}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!isTransfer && (
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        onClick={() => setEditing(tx)}
                      >
                        {strings.common.edit}
                      </button>
                    )}
                    <button
                      type="button"
                      className={dangerButtonClass}
                      onClick={() => void remove(tx)}
                    >
                      {strings.common.delete}
                    </button>
                    {isTransfer && (
                      <span className="text-xs text-slate-600">
                        {strings.transactions.transferEditHint}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > visible && (
          <button
            type="button"
            className={`${secondaryButtonClass} mt-3`}
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
          >
            {strings.transactions.showMore} ({filtered.length - visible})
          </button>
        )}
      </Card>
    </>
  );
}

export function TransactionsPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{strings.transactions.title}</h1>
      <DataGate title={strings.transactions.title}>
        {(data) => <TransactionsView data={data} />}
      </DataGate>
    </>
  );
}
