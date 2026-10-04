import { col, defineTable, type RowOf } from './columns';

/** Versione dello schema scritta in `_meta`. Cambiare le colonne di una scheda richiede una migrazione. */
export const SCHEMA_VERSION = '1';

/** Colonne comuni a tutte le schede dati (ARCHITECTURE.md §6). */
const common = {
  id: col.id,
  created_at: col.timestamp,
  updated_at: col.timestamp,
  deleted: col.flag,
} as const;

export const ACCOUNT_TYPES = ['checking', 'savings', 'cash', 'brokerage'] as const;
export const CATEGORY_KINDS = ['expense', 'income', 'transfer'] as const;

export const ASSET_CLASSES = [
  'equity',
  'bond',
  'etf',
  'crypto',
  'commodity',
  'real_estate',
  'cash',
  'other',
] as const;
export const INVESTMENT_TYPES = [
  'buy',
  'sell',
  'dividend',
  'interest',
  'fee',
  'deposit',
  'withdrawal',
  'split',
] as const;
export const PRICE_SOURCES = ['manual', 'api'] as const;
export const RULE_FIELDS = ['description', 'amount', 'account'] as const;
export const RULE_MATCH_TYPES = ['contains', 'starts_with', 'equals', 'regex'] as const;
export const RULE_SOURCES = ['manual', 'learned'] as const;
export const IMPORT_STATUSES = ['committed', 'discarded'] as const;

export const metaTable = defineTable('_meta', {
  key: col.requiredText,
  value: col.text,
});

export const accountsTable = defineTable('accounts', {
  ...common,
  name: col.requiredText,
  institution: col.text,
  type: col.oneOf(ACCOUNT_TYPES),
  currency: col.currency,
  opening_balance_minor: col.minor,
  opening_date: col.date,
  is_archived: col.flag,
});

export const categoriesTable = defineTable('categories', {
  ...common,
  name: col.requiredText,
  parent_id: col.optionalId,
  kind: col.oneOf(CATEGORY_KINDS),
  color: col.text,
  icon: col.text,
});

export const transactionsTable = defineTable('transactions', {
  ...common,
  account_id: col.id,
  date: col.date,
  description: col.text,
  raw_description: col.text,
  /** Con segno: negativo = uscita, positivo = entrata. */
  amount_minor: col.minor,
  currency: col.currency,
  /** Tasso EUR→valuta alla data, come decimale esatto in stringa ("1" per EUR). */
  fx_rate: col.positiveDecimal,
  /** Snapshot in EUR al tasso della data: i report storici non cambiano retroattivamente. */
  amount_base_minor: col.minor,
  /** Vuoto = da categorizzare. */
  category_id: col.optionalId,
  /** Condiviso dai due lati di un giroconto: escluso dai totali. */
  transfer_group_id: col.optionalId,
  recurring_rule_id: col.optionalId,
  import_batch_id: col.optionalId,
  dedupe_hash: col.optionalId,
  notes: col.text,
});

export const fxRatesTable = defineTable('fx_rates', {
  ...common,
  date: col.date,
  base_currency: col.currency,
  quote_currency: col.currency,
  rate: col.positiveDecimal,
  source: col.text,
  fetched_at: col.timestamp,
});

export const assetsTable = defineTable('assets', {
  ...common,
  name: col.requiredText,
  symbol: col.text,
  isin: col.text,
  asset_class: col.oneOf(ASSET_CLASSES),
  /** Valuta in cui è quotato l'asset (e in cui si inseriscono i prezzi). */
  currency: col.currency,
  price_source: col.oneOf(PRICE_SOURCES),
});

export const investmentTransactionsTable = defineTable('investment_transactions', {
  ...common,
  /** Conto di investimento dove è detenuto l'asset (facoltativo). */
  account_id: col.optionalId,
  asset_id: col.id,
  type: col.oneOf(INVESTMENT_TYPES),
  date: col.date,
  /** Unità (anche frazionarie): stringa decimale esatta. */
  quantity: col.decimal,
  /** Prezzo di una unità nella valuta dell'asset: stringa decimale esatta. */
  unit_price: col.decimal,
  /** Commissioni in centesimi della valuta dell'operazione (denaro: intero, mai decimale). */
  fees_minor: col.count,
  currency: col.currency,
  /** Tasso "1 EUR = tasso unità della valuta" alla data ("1" per EUR). */
  fx_rate: col.positiveDecimal,
  /** Controvalore in EUR dell'operazione (quantità × prezzo, commissioni comprese per gli acquisti), sempre positivo. */
  amount_base_minor: col.minor,
});

export const priceHistoryTable = defineTable('price_history', {
  ...common,
  asset_id: col.id,
  date: col.date,
  /** Prezzo di una unità nella valuta dell'asset. */
  price: col.positiveDecimal,
  currency: col.currency,
  source: col.oneOf(PRICE_SOURCES),
});

/** Una riga per ogni importazione: SOLO metadati, mai il contenuto del file (CLAUDE.md). */
export const importBatchesTable = defineTable('import_batches', {
  ...common,
  account_id: col.id,
  filename: col.text,
  /** SHA-256 del file (esadecimale): serve a segnalare lo stesso estratto importato due volte. */
  file_hash: col.text,
  parser_id: col.requiredText,
  status: col.oneOf(IMPORT_STATUSES),
  row_count: col.count,
  imported_at: col.timestamp,
});

/**
 * Regole di categorizzazione. Una regola si applica se **tutte** le sue condizioni valgono:
 * il conto (se indicato), l'intervallo di importo in valore assoluto (se indicato) e, per
 * `field = description`, il testo `pattern`. Vince la prima per `priority` (numero più basso).
 */
export const categorizationRulesTable = defineTable('categorization_rules', {
  ...common,
  priority: col.count,
  field: col.oneOf(RULE_FIELDS),
  match_type: col.oneOf(RULE_MATCH_TYPES),
  pattern: col.text,
  category_id: col.id,
  account_id: col.optionalId,
  amount_min_minor: col.optionalMinor,
  amount_max_minor: col.optionalMinor,
  source: col.oneOf(RULE_SOURCES),
  hit_count: col.count,
  is_enabled: col.flag,
});

export type MetaEntry = RowOf<typeof metaTable>;
export type ImportBatch = RowOf<typeof importBatchesTable>;
export type CategorizationRule = RowOf<typeof categorizationRulesTable>;
export type Asset = RowOf<typeof assetsTable>;
export type InvestmentTransaction = RowOf<typeof investmentTransactionsTable>;
export type PricePoint = RowOf<typeof priceHistoryTable>;
export type Account = RowOf<typeof accountsTable>;
export type Category = RowOf<typeof categoriesTable>;
export type Transaction = RowOf<typeof transactionsTable>;
export type FxRate = RowOf<typeof fxRatesTable>;
