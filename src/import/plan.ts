import type { ChangeSet, Dataset } from '../data/repository';
import type { Asset, CategorizationRule, InvestmentTransaction, Transaction } from '../data/schema';
import { dedupeHashes } from '../domain/dedupe';
import { createAsset, createTrade, type AssetIssue, type TradeIssue } from '../domain/investments';
import { createMovement, type MovementIssue } from '../domain/movements';
import { BASE_CURRENCY, formatPlain } from '../domain/money';
import { findRule, learnRule, registerHit } from '../domain/rules';
import { uuidv7 } from '../domain/uuid7';
import type { ImportedRow, ParserId, RowWarning } from './types';

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
}

export interface Plan {
  rows: PlannedRow[];
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
    if (row.trade) {
      categoryId = transferCategory?.id ?? null;
    } else {
      // Si considerano solo le regole la cui categoria è adatta al segno: un rimborso Amazon
      // non deve fermarsi alla regola "amazon → Shopping" (una spesa).
      const wantedKind = row.amountMinor < 0 ? 'expense' : 'income';
      const usable = dataset.categorizationRules.filter(
        (r) => dataset.categories.find((c) => c.id === r.category_id)?.kind === wantedKind,
      );
      const rule = findRule(usable, {
        description: row.description,
        rawDescription: row.rawDescription,
        amountMinor: row.amountMinor,
        accountId,
      });
      const kind = row.amountMinor < 0 ? 'expense' : 'income';
      const category = rule && dataset.categories.find((c) => c.id === rule.category_id);
      if (rule && category && category.kind === kind) {
        categoryId = category.id;
        ruleId = rule.id;
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
    };
  });

  const fileAlreadyImported =
    input.fileHash !== '' &&
    dataset.importBatches.some(
      (b) =>
        b.account_id === accountId && b.file_hash === input.fileHash && b.status === 'committed',
    );
  return { ok: true, plan: { rows, fileAlreadyImported } };
}

export type RowIssue = MovementIssue | TradeIssue | AssetIssue | 'transfer_category';

export interface ImportInput {
  accountId: string;
  parserId: ParserId;
  filename: string;
  fileHash: string;
  rows: readonly PlannedRow[];
  dataset: Dataset;
}

export interface ImportSummary {
  transactions: number;
  trades: number;
  newAssets: number;
  newRules: number;
}

export type ImportBuild =
  | { ok: true; changes: ChangeSet; summary: ImportSummary }
  | { ok: false; rowIssues: { key: number; issue: RowIssue }[] };

/** Quando il testo della banca è un ISIN lo si salva come tale invece che come simbolo. */
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
  const ctx = { accounts: dataset.accounts, categories: dataset.categories };
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
        categoryId: row.trade ? null : row.categoryId,
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
          quantityText: row.trade.quantity,
          unitPriceText: row.trade.unitPrice,
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
    meta: { [`import_format:${accountId}`]: input.parserId },
  };
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
  };
}
