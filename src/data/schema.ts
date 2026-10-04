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

export type MetaEntry = RowOf<typeof metaTable>;
export type Account = RowOf<typeof accountsTable>;
export type Category = RowOf<typeof categoriesTable>;
export type Transaction = RowOf<typeof transactionsTable>;
export type FxRate = RowOf<typeof fxRatesTable>;
