import { z } from 'zod';
import type { ChangeSet, Dataset } from '../data/repository';
import { softDelete } from '../data/repository';
import { holdingsNeverNegative } from '../domain/investments';

/**
 * Annullamento di un'importazione. Al momento dell'import si registra in `_meta`
 * (`import_undo:<id lotto>`) lo stato del conto prima e gli elementi creati che non portano
 * l'id del lotto (operazioni di investimento, asset): senza, l'annullamento non saprebbe cosa
 * togliere né a quale saldo tornare. Il contenuto del file non c'entra: solo identificativi e
 * il saldo iniziale precedente.
 */

const undoSchema = z.object({
  /** Saldo iniziale e apertura del conto prima dell'import. */
  openingBalanceMinor: z.number().int(),
  openingDate: z.string(),
  /** Il saldo iniziale era già stato ricavato da un estratto. */
  anchored: z.boolean(),
  operationIds: z.array(z.string()),
  assetIds: z.array(z.string()),
});

export type UndoRecord = z.infer<typeof undoSchema>;

export const undoKey = (batchId: string) => `import_undo:${batchId}`;
export const anchoredKey = (accountId: string) => `balance_anchored:${accountId}`;

export function serializeUndo(record: UndoRecord): string {
  return JSON.stringify(record);
}

/** Null se manca o non è valido: l'annullamento prosegue senza ripristinare il conto. */
export function parseUndo(text: string | undefined): UndoRecord | null {
  if (!text) return null;
  try {
    const parsed = undoSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    // Testo non JSON (cella modificata a mano): come se non ci fosse.
    return null;
  }
}

export type UndoIssue = 'not_found' | 'not_latest' | 'holdings';

export interface UndoSummary {
  transactions: number;
  operations: number;
  assets: number;
  /** Apertura e saldo iniziale del conto sono tornati com'erano. */
  accountRestored: boolean;
  /** Non c'era traccia dello stato precedente: i saldi vanno controllati. */
  noRecord: boolean;
}

export type UndoBuild =
  { ok: true; changes: ChangeSet; summary: UndoSummary } | { ok: false; issue: UndoIssue };

/** Il lotto più recente (non annullato) del conto: solo quello può ripristinare il saldo. */
function isLatest(dataset: Dataset, batchId: string, accountId: string): boolean {
  const own = dataset.importBatches
    .filter((b) => b.account_id === accountId && b.status === 'committed')
    .sort((a, b) => a.imported_at.localeCompare(b.imported_at) || a.id.localeCompare(b.id));
  return own[own.length - 1]?.id === batchId;
}

export function buildUndo(dataset: Dataset, batchId: string, now: Date = new Date()): UndoBuild {
  const batch = dataset.importBatches.find((b) => b.id === batchId && b.status === 'committed');
  if (!batch) return { ok: false, issue: 'not_found' };

  const record = parseUndo(dataset.meta[undoKey(batchId)]);
  // Con lo stato precedente registrato si può ripristinare il conto, ma solo in ordine
  // inverso (prima l'ultimo import): un import più vecchio ha già "dietro" quelli successivi.
  if (record && !isLatest(dataset, batchId, batch.account_id)) {
    return { ok: false, issue: 'not_latest' };
  }

  const transactions = dataset.transactions.filter((t) => t.import_batch_id === batchId);
  const opIds = new Set(record?.operationIds ?? []);
  const operations = dataset.investmentTransactions.filter((o) => opIds.has(o.id));

  // Togliere acquisti non deve lasciare vendite (di altri) senza quote.
  const affected = new Set(operations.map((o) => o.asset_id));
  for (const assetId of affected) {
    const remaining = dataset.investmentTransactions.filter(
      (o) => o.asset_id === assetId && !opIds.has(o.id),
    );
    if (!holdingsNeverNegative(remaining)) return { ok: false, issue: 'holdings' };
  }

  // Gli asset creati dall'import si tolgono solo se non restano altre operazioni su di essi.
  const assetIds = new Set(record?.assetIds ?? []);
  const assets = dataset.assets.filter(
    (a) =>
      assetIds.has(a.id) &&
      !dataset.investmentTransactions.some((o) => o.asset_id === a.id && !opIds.has(o.id)),
  );

  const changes: ChangeSet = {
    transactions: { update: transactions.map((t) => softDelete(t, now)) },
    importBatches: {
      update: [{ ...batch, status: 'discarded', updated_at: now.toISOString() }],
    },
    meta: record ? { [undoKey(batchId)]: '' } : {},
  };
  if (operations.length > 0) {
    changes.investmentTransactions = { update: operations.map((o) => softDelete(o, now)) };
  }
  if (assets.length > 0) changes.assets = { update: assets.map((a) => softDelete(a, now)) };

  let accountRestored = false;
  const account = dataset.accounts.find((a) => a.id === batch.account_id);
  if (record && account) {
    accountRestored = true;
    changes.accounts = {
      update: [
        {
          ...account,
          opening_balance_minor: record.openingBalanceMinor,
          opening_date: record.openingDate,
          updated_at: now.toISOString(),
        },
      ],
    };
    changes.meta = { ...changes.meta, [anchoredKey(account.id)]: record.anchored ? '1' : '0' };
  }

  return {
    ok: true,
    changes,
    summary: {
      transactions: transactions.length,
      operations: operations.length,
      assets: assets.length,
      accountRestored,
      noRecord: record === null,
    },
  };
}
