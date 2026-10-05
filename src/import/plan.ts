import type { ChangeSet, Dataset } from '../data/repository';
import type { Asset, CategorizationRule, InvestmentTransaction, Transaction } from '../data/schema';
import { computeBalanceUpdate, statementEndBalance, type BalanceUpdate } from '../domain/balance';
import { dedupeHashes } from '../domain/dedupe';
import { createAsset, createTrade, type AssetIssue, type TradeIssue } from '../domain/investments';
import { createMovement, type MovementIssue } from '../domain/movements';
import { BASE_CURRENCY, formatPlain } from '../domain/money';
import { findRule, learnRule, registerHit } from '../domain/rules';
import { uuidv7 } from '../domain/uuid7';
import type { ImportedRow, ParserId, RowWarning } from './types';
import { anchoredKey, serializeUndo, undoKey } from './undo';

/**
 * Dall'estratto letto al salvataggio (ARCHITECTURE.md §7.1): `buildPlan` prepara l'anteprima
 * (duplicati, categorie suggerite dalle regole, righe da escludere), `buildImport` trasforma le
 * righe confermate in UN solo `ChangeSet`: o si salva tutto o niente.
 */

export type PlanIssue = 'account' | 'currency';

export interface PlannedRow {
  /** Posizione nel file: chiave stabile della riga in anteprima. */
  key: number;
  line: number;
  include: boolean;
  /** Campi modificabili dall'utente in anteprima. */
  date: string;
  description: string;
  amountMinor: number;
  categoryId: string | null;
  /** Regola che ha proposto la categoria (per le statistiche), se c'è. */
  ruleId: string | null;
  /** Se valorizzato, a conferma si impara una regola con questo testo → `categoryId`. */
  learnPattern: string | null;
  duplicate: boolean;
  warnings: RowWarning[];
  rawDescription: string;
  externalId: string | null;
  hash: string;
  trade: ImportedRow['trade'];
  /** Spostamento dei propri soldi: giroconto a un lato, escluso da entrate e spese. */
  transfer: boolean;
}

export interface Plan {
  rows: PlannedRow[];
  /** Saldo a fine estratto, se il file lo riporta (Revolut); altrimenti null. */
  endBalanceMinor: number | null;
  /** Giorno a cui si riferisce il saldo di fine estratto (ultimo giorno con righe complete). */
  anchorDate: string | null;
  /** Primo giorno coperto dall'estratto (righe complete, anche se già importate). */
  startDate: string | null;
  /** Il saldo iniziale di questo conto è già stato ricavato da un estratto precedente. */
  alreadyAnchored: boolean;
  /** Lo stesso file (stesso contenuto) risulta già importato su questo conto. */
  fileAlreadyImported: boolean;
}

export interface PlanInput {
  accountId: string;
  rows: readonly ImportedRow[];
  fileHash: string;
  dataset: Dataset;
}

export async function buildPlan(
  input: PlanInput,
): Promise<{ ok: true; plan: Plan } | { ok: false; issue: PlanIssue }> {
  const { dataset, accountId } = input;
  const account = dataset.accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, issue: 'account' };
  // Per ora si importa solo in EUR: i tassi storici andrebbero chiesti riga per riga.
  if (account.currency !== BASE_CURRENCY) return { ok: false, issue: 'currency' };

  const hashes = await dedupeHashes(accountId, input.rows);
  const known = new Set(
    dataset.transactions
      .filter((t) => t.account_id === accountId && t.dedupe_hash !== null)
      .map((t) => t.dedupe_hash),
  );
  const transferCategory = dataset.categories.find((c) => c.kind === 'transfer');

  const rows = input.rows.map((row, index): PlannedRow => {
    const warnings = [...row.warnings];
    if (row.currency !== account.currency && !warnings.includes('other_currency')) {
      warnings.push('other_currency');
    }
    const duplicate = known.has(hashes[index] ?? '');

    let categoryId: string | null = null;
    let ruleId: string | null = null;
    let isTransfer = row.transfer ?? false;
    if (row.trade || row.transfer) {
      categoryId = transferCategory?.id ?? null;
    } else {
      // Si considerano solo le regole la cui categoria è adatta al segno: un rimborso Amazon
      // non deve fermarsi alla regola "amazon → Shopping" (una spesa).
      const wantedKind = row.amountMinor < 0 ? 'expense' : 'income';
      // Le regole verso "Trasferimento" valgono per qualunque segno: sono i giroconti.
      const usable = dataset.categorizationRules.filter((r) => {
        const kind = dataset.categories.find((c) => c.id === r.category_id)?.kind;
        return kind === wantedKind || kind === 'transfer';
      });
      const rule = findRule(usable, {
        description: row.description,
        rawDescription: row.rawDescription,
        amountMinor: row.amountMinor,
        accountId,
      });
      const category = rule && dataset.categories.find((c) => c.id === rule.category_id);
      if (rule && category) {
        categoryId = category.id;
        ruleId = rule.id;
        isTransfer = category.kind === 'transfer';
      }
    }

    return {
      key: index,
      line: row.line,
      include: !duplicate && warnings.length === 0,
      date: row.date,
      description: row.description,
      amountMinor: row.amountMinor,
      categoryId,
      ruleId,
      learnPattern: null,
      duplicate,
      warnings,
      rawDescription: row.rawDescription,
      externalId: row.externalId,
      hash: hashes[index] ?? '',
      trade: row.trade,
      transfer: isTransfer,
    };
  });

  const fileAlreadyImported =
    input.fileHash !== '' &&
    dataset.importBatches.some(
      (b) =>
        b.account_id === accountId && b.file_hash === input.fileHash && b.status === 'committed',
    );
  const completed = (row: ImportedRow) => !row.warnings.includes('not_completed');
  const end = statementEndBalance(
    input.rows.map((row) => ({
      date: row.date,
      balanceMinor: row.balanceMinor,
      completed: completed(row),
      ...(row.sortKey === undefined ? {} : { sortKey: row.sortKey }),
    })),
  );
  const completedDates = input.rows.filter(completed).map((row) => row.date);
  const lastDate =
    completedDates.length === 0 ? null : completedDates.reduce((a, b) => (a > b ? a : b));
  const firstDate =
    completedDates.length === 0 ? null : completedDates.reduce((a, b) => (a < b ? a : b));
  return {
    ok: true,
    plan: {
      rows,
      fileAlreadyImported,
      endBalanceMinor: end?.balanceMinor ?? null,
      anchorDate: end?.date ?? lastDate,
      startDate: firstDate,
      alreadyAnchored: dataset.meta[anchoredKey(accountId)] === '1',
    },
  };
}

/** Come cambia il conto importando le righe scelte (retrodatazione e saldo a fine estratto). */
export function previewBalance(input: {
  dataset: Dataset;
  accountId: string;
  rows: readonly PlannedRow[];
  declaredMinor: number | null;
  anchorDate: string | null;
  initialMinor?: number | null;
  statementStart?: string | null;
}): BalanceUpdate | null {
  const account = input.dataset.accounts.find((a) => a.id === input.accountId);
  if (!account) return null;
  return computeBalanceUpdate({
    account,
    existing: input.dataset.transactions
      .filter((t) => t.account_id === input.accountId)
      .map((t) => ({ date: t.date, amountMinor: t.amount_minor })),
    added: input.rows
      .filter((r) => r.include)
      .map((r) => ({ date: r.date, amountMinor: r.amountMinor })),
    declaredMinor: input.declaredMinor,
    anchorDate: input.anchorDate,
    initialMinor: input.initialMinor ?? null,
    statementStart: input.statementStart ?? null,
    alreadyAnchored: input.dataset.meta[anchoredKey(input.accountId)] === '1',
  });
}

export type RowIssue = MovementIssue | TradeIssue | AssetIssue | 'transfer_category';

export interface ImportInput {
  accountId: string;
  parserId: ParserId;
  filename: string;
  fileHash: string;
  rows: readonly PlannedRow[];
  dataset: Dataset;
  /** Saldo del conto a fine estratto (dal file o scritto dall'utente); null se non si conosce. */
  declaredMinor?: number | null;
  anchorDate?: string | null;
  /** Saldo prima della prima riga dell'estratto (alternativa al saldo finale). */
  initialMinor?: number | null;
  /** Primo giorno coperto dall'estratto (dal piano). */
  statementStart?: string | null;
}

export interface ImportSummary {
  transactions: number;
  trades: number;
  newAssets: number;
  newRules: number;
}

export type ImportBuild =
  | { ok: true; changes: ChangeSet; summary: ImportSummary; balance: BalanceUpdate | null }
  | { ok: false; rowIssues: { key: number; issue: RowIssue }[] };

/** Quando il testo della banca è un ISIN lo si salva come tale invece che come simbolo. */
/**
 * Quantità e prezzi letti dal file sono già esatti, con il punto decimale ("112.345"). Il campo di
 * inserimento dell'utente invece rifiuta un punto con tre cifre dopo ("1.234" potrebbe essere
 * milleduecentotrentaquattro): per non farli rifiutare si passano con la virgola, che non è ambigua.
 */
function technicalToInput(value: string): string {
  return value.replace('.', ',');
}

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

const ASSET_CLASS_MAP: Record<string, Asset['asset_class']> = {
  FUND: 'etf',
  ETF: 'etf',
  STOCK: 'equity',
  EQUITY: 'equity',
  CRYPTO: 'crypto',
  BOND: 'bond',
  DERIVATIVE: 'other',
};

export function mapAssetClass(raw: string): Asset['asset_class'] {
  return ASSET_CLASS_MAP[raw.trim().toUpperCase()] ?? 'other';
}

function findAsset(assets: readonly Asset[], trade: NonNullable<PlannedRow['trade']>) {
  const symbol = trade.symbol.trim().toUpperCase();
  const name = trade.name.trim().toLowerCase();
  return (
    assets.find((a) => symbol !== '' && (a.isin === symbol || a.symbol === symbol)) ??
    assets.find((a) => name !== '' && a.name.trim().toLowerCase() === name)
  );
}

export function buildImport(
  input: ImportInput,
  now: Date = new Date(),
  newId: () => string = () => uuidv7(now.getTime()),
): ImportBuild {
  const { dataset, accountId } = input;
  // L'estratto può contenere righe precedenti all'apertura del conto: l'apertura si sposta
  // indietro (e il saldo si riancora) invece di rifiutarle.
  const balance = previewBalance({
    dataset,
    accountId,
    rows: input.rows,
    declaredMinor: input.declaredMinor ?? null,
    anchorDate: input.anchorDate ?? null,
    initialMinor: input.initialMinor ?? null,
    statementStart: input.statementStart ?? null,
  });
  const ctx = {
    accounts: dataset.accounts.map((a) =>
      a.id === accountId && balance
        ? {
            ...a,
            opening_date: balance.openingDate,
            opening_balance_minor: balance.openingBalanceMinor,
          }
        : a,
    ),
    categories: dataset.categories,
  };
  const transferCategory = dataset.categories.find((c) => c.kind === 'transfer');
  const issues: { key: number; issue: RowIssue }[] = [];

  const batchId = newId();
  const included = input.rows
    .filter((r) => r.include)
    .sort((a, b) => a.date.localeCompare(b.date) || a.key - b.key);

  const transactions: Transaction[] = [];
  const newAssets: Asset[] = [];
  const operations: InvestmentTransaction[] = [];

  for (const row of included) {
    const kind = row.amountMinor < 0 ? 'expense' : 'income';
    const movement = createMovement(
      {
        kind,
        amountText: formatPlain(Math.abs(row.amountMinor)),
        date: row.date,
        accountId,
        categoryId: row.trade || row.transfer ? null : row.categoryId,
        description: row.description,
        notes: '',
      },
      ctx,
      now,
      newId,
    );
    if (!movement.ok) {
      issues.push(...movement.issues.map((issue) => ({ key: row.key, issue })));
      continue;
    }
    const transaction: Transaction = {
      ...movement.value,
      raw_description: row.rawDescription,
      import_batch_id: batchId,
      dedupe_hash: row.hash,
    };

    if (row.trade) {
      if (!transferCategory) {
        issues.push({ key: row.key, issue: 'transfer_category' });
        continue;
      }
      const assets = [...dataset.assets, ...newAssets];
      let asset = findAsset(assets, row.trade);
      if (!asset) {
        const symbol = row.trade.symbol.trim().toUpperCase();
        const created = createAsset(
          {
            name: row.trade.name,
            symbol: ISIN.test(symbol) ? '' : symbol,
            isin: ISIN.test(symbol) ? symbol : '',
            assetClass: mapAssetClass(row.trade.assetClass),
            currency: BASE_CURRENCY,
          },
          assets,
          now,
          newId,
        );
        if (!created.ok) {
          issues.push(...created.issues.map((issue) => ({ key: row.key, issue })));
          continue;
        }
        asset = created.value;
        newAssets.push(asset);
      }
      const trade = createTrade(
        {
          assetId: asset.id,
          type: row.trade.type,
          date: row.date,
          quantityText: technicalToInput(row.trade.quantity),
          unitPriceText: technicalToInput(row.trade.unitPrice),
          feesText: formatPlain(row.trade.feeMinor),
          accountId,
        },
        {
          assets: [...dataset.assets, ...newAssets],
          operations: [...dataset.investmentTransactions, ...operations],
          accounts: dataset.accounts,
        },
        now,
        newId,
      );
      if (!trade.ok) {
        issues.push(...trade.issues.map((issue) => ({ key: row.key, issue })));
        continue;
      }
      operations.push(trade.value);
      // Lato "contanti" del giroconto verso l'investimento: l'altro lato è l'asset, non un conto.
      transaction.category_id = transferCategory.id;
      transaction.transfer_group_id = newId();
    } else if (row.transfer) {
      // Bonifico da/verso un altro conto proprio: giroconto a un lato (l'altro è in un altro estratto).
      if (!transferCategory) {
        issues.push({ key: row.key, issue: 'transfer_category' });
        continue;
      }
      transaction.category_id = transferCategory.id;
      transaction.transfer_group_id = newId();
    }
    transactions.push(transaction);
  }

  if (issues.length > 0) return { ok: false, rowIssues: issues };

  // Regole: statistiche d'uso e regole imparate dalle correzioni dell'utente
  const touched = new Map<string, CategorizationRule>();
  const inserted: CategorizationRule[] = [];
  for (const row of included) {
    if (row.ruleId && !row.trade) {
      const base =
        touched.get(row.ruleId) ?? dataset.categorizationRules.find((r) => r.id === row.ruleId);
      if (base) touched.set(base.id, registerHit(base, now));
    }
  }
  for (const row of included) {
    if (!row.learnPattern || !row.categoryId || row.trade) continue;
    const known = [...dataset.categorizationRules.map((r) => touched.get(r.id) ?? r), ...inserted];
    const learned = learnRule(
      { pattern: row.learnPattern, categoryId: row.categoryId, accountId: null },
      known,
      now,
      newId,
    );
    if (!learned.ok) continue; // testo vuoto: la regola non si crea, l'import prosegue
    if (learned.value.kind === 'insert') inserted.push(learned.value.rule);
    else if (learned.value.kind === 'update')
      touched.set(learned.value.rule.id, learned.value.rule);
  }

  const timestamp = now.toISOString();
  const previous = dataset.accounts.find((a) => a.id === accountId);
  const changes: ChangeSet = {
    transactions: { insert: transactions },
    importBatches: {
      insert: [
        {
          id: batchId,
          created_at: timestamp,
          updated_at: timestamp,
          deleted: false,
          account_id: accountId,
          filename: input.filename,
          file_hash: input.fileHash,
          parser_id: input.parserId,
          status: 'committed',
          row_count: included.length,
          imported_at: timestamp,
        },
      ],
    },
    meta: {
      [`import_format:${accountId}`]: input.parserId,
      ...(balance?.anchored ? { [anchoredKey(accountId)]: '1' } : {}),
      // Stato precedente: serve a "Annulla importazione" per riportare il conto com'era.
      ...(previous
        ? {
            [undoKey(batchId)]: serializeUndo({
              openingBalanceMinor: previous.opening_balance_minor,
              openingDate: previous.opening_date,
              anchored: dataset.meta[anchoredKey(accountId)] === '1',
              operationIds: operations.map((o) => o.id),
              assetIds: newAssets.map((a) => a.id),
            }),
          }
        : {}),
    },
  };
  const account = dataset.accounts.find((a) => a.id === accountId);
  if (account && balance?.changed) {
    changes.accounts = {
      update: [
        {
          ...account,
          opening_date: balance.openingDate,
          opening_balance_minor: balance.openingBalanceMinor,
          updated_at: timestamp,
        },
      ],
    };
  }
  if (newAssets.length > 0) changes.assets = { insert: newAssets };
  if (operations.length > 0) changes.investmentTransactions = { insert: operations };
  if (inserted.length > 0 || touched.size > 0) {
    changes.categorizationRules = { insert: inserted, update: [...touched.values()] };
  }
  return {
    ok: true,
    changes,
    summary: {
      transactions: transactions.length,
      trades: operations.length,
      newAssets: newAssets.length,
      newRules: inserted.length,
    },
    balance,
  };
}
