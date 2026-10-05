import { useEffect, useMemo, useState } from 'react';
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
import { PageHeader } from '../../ui/PageHeader';
import { userMessage } from '../../ui/errors';
import { signedMoney } from '../../ui/format';
import { ActionIcon } from '../../ui/icons';
import { Avatar } from '../../ui/Avatar';
import { alertClass, buttonClass, iconButtonClass, secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';
import { categoryColorOf, categoryPath } from '../categories/labels';
import { DataGate } from '../DataGate';
import { FilterBar } from '../filters/FilterBar';
import { useFilters } from '../filters/FiltersProvider';
import { ImportFlow } from '../import/ImportFlow';
import { MovementFilters } from './MovementFilters';
import { MovementForm } from './MovementForm';

const PAGE_SIZE = 100;

function Summary({ transactions }: { transactions: readonly Transaction[] }) {
  const totals = totalsMinor(transactions);
  const stat = 'flex-1 rounded-lg border border-line bg-surface-2 p-2 text-center';
  return (
    <section aria-label={strings.transactions.summary.net} className="mb-4">
      <dl className="flex gap-2">
        <div className={stat}>
          <dt className="text-xs text-muted">{strings.transactions.summary.income}</dt>
          <dd className="font-semibold text-income">{formatMoney(totals.incomeMinor)}</dd>
        </div>
        <div className={stat}>
          <dt className="text-xs text-muted">{strings.transactions.summary.expense}</dt>
          <dd className="font-semibold text-expense">{formatMoney(totals.expenseMinor)}</dd>
        </div>
        <div className={stat}>
          <dt className="text-xs text-muted">{strings.transactions.summary.net}</dt>
          <dd className="font-semibold">{signedMoney(totals.netMinor)}</dd>
        </div>
      </dl>
      <p className="mt-1 text-xs text-muted">{strings.transactions.summary.note}</p>
    </section>
  );
}

function TransactionsView({ data }: { data: Dataset }) {
  const { save } = useData();
  const { range, accountIds, period } = useFilters();
  const [categoryIds, setCategoryIds] = useState<readonly string[]>([]);
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

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

  // Periodo e conti sono condivisi con la dashboard; le categorie valgono solo qui.
  // Con "Max" non c'è nemmeno il limite finale: si vedono anche i movimenti con data futura.
  const filter = useMemo<TransactionFilter>(
    () => ({
      ...(range.from === null ? {} : { from: range.from }),
      ...(period.preset === 'MAX' ? {} : { to: range.to }),
      accountIds,
      categoryIds,
    }),
    [range.from, range.to, period.preset, accountIds, categoryIds],
  );

  const filtered = useMemo(
    () => sortNewestFirst(filterTransactions(data.transactions, filter)),
    [data.transactions, filter],
  );

  // Cambiando filtro si riparte dalla prima pagina dell'elenco.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [filter]);

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
      {importing ? (
        <ImportFlow
          data={data}
          onDone={(message) => {
            setImporting(false);
            if (message) setSuccess(message);
          }}
        />
      ) : editing === null ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => setEditing('new')}>
            {strings.transactions.add}
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => {
              setSuccess(null);
              setImporting(true);
            }}
          >
            {strings.importStatement.open}
          </button>
        </div>
      ) : (
        <MovementForm
          key={editing === 'new' ? 'new' : editing.id}
          data={data}
          editing={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {success && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-income bg-surface-2 p-3 text-sm font-semibold text-income"
        >
          {success}
        </p>
      )}

      {notice && (
        <p role="alert" className={`${alertClass} mb-4`}>
          {notice}
        </p>
      )}

      <FilterBar accounts={data.accounts} />
      <MovementFilters
        categoryIds={categoryIds}
        categories={data.categories}
        onChange={setCategoryIds}
      />
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
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 border-b border-line-soft py-3 last:border-b-0 sm:grid-cols-[auto_1fr_auto_auto]"
                >
                  <Avatar
                    label={tx.description || detail}
                    color={categoryColorOf(tx.category_id, data.categories, isTransfer)}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{tx.description || detail}</p>
                    <p className="truncate text-xs text-muted">
                      {formatDateIt(tx.date)} · {accountNames.get(tx.account_id) ?? '?'} · {detail}
                    </p>
                    {isTransfer && (
                      <p className="text-xs text-muted">{strings.transactions.transferEditHint}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-semibold ${tx.amount_minor < 0 ? 'text-expense' : 'text-income'}`}
                    >
                      {signedMoney(tx.amount_minor, tx.currency)}
                    </p>
                    {tx.currency !== 'EUR' && (
                      <p className="text-xs text-muted">
                        {strings.transactions.inEuro(signedMoney(tx.amount_base_minor))}
                      </p>
                    )}
                  </div>
                  <div className="col-span-3 flex justify-end sm:col-span-1">
                    {!isTransfer && (
                      <button
                        type="button"
                        className={iconButtonClass()}
                        aria-label={`${strings.common.edit}: ${tx.description || detail}`}
                        title={strings.common.edit}
                        onClick={() => setEditing(tx)}
                      >
                        <ActionIcon name="edit" />
                      </button>
                    )}
                    <button
                      type="button"
                      className={iconButtonClass(true)}
                      aria-label={`${strings.common.delete}: ${tx.description || detail}`}
                      title={strings.common.delete}
                      onClick={() => void remove(tx)}
                    >
                      <ActionIcon name="trash" />
                    </button>
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
      <PageHeader
        icon="transactions"
        title={strings.transactions.title}
        subtitle={strings.subtitles.transactions}
      />
      <DataGate title={strings.transactions.title}>
        {(data) => <TransactionsView data={data} />}
      </DataGate>
    </>
  );
}
