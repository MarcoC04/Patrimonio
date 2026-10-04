import { useState } from 'react';
import { useData } from '../../app/DataProvider';
import type { Dataset } from '../../data/repository';
import { formatDateIt } from '../../domain/dates';
import { buildUndo } from '../../import/undo';
import { userMessage } from '../../ui/errors';
import { alertClass, dangerButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';

const t = strings.importStatement.history;

interface Props {
  data: Dataset;
  /** Esito mostrato dopo un annullamento riuscito. */
  onUndone: (message: string) => void;
}

/** Importazioni già fatte (non annullate), dalla più recente: con "Annulla importazione". */
export function ImportHistory({ data, onUndone }: Props) {
  const { save } = useData();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const batches = data.importBatches
    .filter((b) => b.status === 'committed')
    .sort((a, b) => b.imported_at.localeCompare(a.imported_at));
  if (batches.length === 0) return null;

  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? '?';

  const undo = async (batchId: string, filename: string) => {
    setError(null);
    const built = buildUndo(data, batchId);
    if (!built.ok) {
      setError(t.issues[built.issue]);
      return;
    }
    const { summary } = built;
    if (
      !window.confirm(
        t.confirm(filename, summary.transactions, summary.operations, summary.noRecord),
      )
    ) {
      return;
    }
    setBusyId(batchId);
    try {
      await save(built.changes);
      onUndone(t.done(summary.transactions, summary.accountRestored, summary.noRecord));
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label={t.title} className="mt-6 border-t border-line pt-4">
      <h4 className="mb-2 text-sm font-semibold">{t.title}</h4>
      {error && (
        <p role="alert" className={`${alertClass} mb-3`}>
          {error}
        </p>
      )}
      <ul>
        {batches.map((batch) => (
          <li
            key={batch.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft py-2 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{batch.filename || '—'}</p>
              <p className="text-xs text-muted">
                {accountName(batch.account_id)} ·{' '}
                {t.item(batch.row_count, formatDateIt(batch.imported_at.slice(0, 10)))}
              </p>
            </div>
            <button
              type="button"
              className={dangerButtonClass}
              disabled={busyId !== null}
              onClick={() => void undo(batch.id, batch.filename)}
            >
              {busyId === batch.id ? strings.common.saving : t.undo}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
