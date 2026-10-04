import { strings } from '../ui/strings';
import type { ColumnDef, EntityOf, TableDef } from './columns';
import {
  DataError,
  type ChangeSet,
  type DataIssue,
  type Dataset,
  type Repository,
  type TableChanges,
} from './repository';
import { rowsToObjects } from './rows';
import {
  accountsTable,
  categoriesTable,
  fxRatesTable,
  metaTable,
  SCHEMA_VERSION,
  transactionsTable,
} from './schema';
import type { AppendRequest } from './scriptClient';

/** Quanto serve del client dello script (permette di sostituirlo nei test). */
export interface ScriptApi {
  init(tabs: Record<string, readonly string[]>): Promise<number>;
  read(tabs: readonly string[]): Promise<Record<string, string[][]>>;
  write(request: {
    appends?: readonly AppendRequest[];
    updates?: readonly AppendRequest[];
  }): Promise<void>;
}

const ALL_TABLES = [metaTable, accountsTable, categoriesTable, transactionsTable, fxRatesTable];

const META_DEFAULTS: Record<string, string> = {
  schema_version: SCHEMA_VERSION,
  base_currency: 'EUR',
  locale: 'it-IT',
};

type AnyColumns = Record<string, ColumnDef<unknown>>;

/** Legge una scheda: controlla le intestazioni (SchemaError) e valida ogni riga. */
function readTable<S extends AnyColumns>(
  table: TableDef<S>,
  values: string[][],
  issues: DataIssue[],
): EntityOf<S>[] {
  const records = rowsToObjects(values, table.headers, table.name);
  const entities: EntityOf<S>[] = [];
  records.forEach((record, index) => {
    if (Object.values(record).every((cell) => cell === '')) return; // riga completamente vuota
    const result = table.parse(record);
    if (result.ok) entities.push(result.value);
    // +2: la riga 1 del foglio è l'intestazione, `index` parte da 0.
    else issues.push({ table: table.name, row: index + 2, columns: result.columns });
  });
  return entities;
}

function assertUniqueKeys(table: string, keys: readonly string[]): void {
  if (new Set(keys).size !== keys.length) {
    throw new DataError(strings.errors.data.duplicateIds(table));
  }
}

/** Prepara le righe da scrivere; prima le rilegge con lo schema: nulla di non valido arriva al foglio. */
function toRequest<S extends AnyColumns>(
  table: TableDef<S>,
  entities: readonly EntityOf<S>[],
): AppendRequest {
  const rows = entities.map((entity) => {
    const row = table.toRow(entity);
    const check = table.parse(Object.fromEntries(table.headers.map((h, i) => [h, row[i] ?? ''])));
    if (!check.ok) {
      throw new DataError(strings.errors.data.invalidWrite(table.name, check.columns.join(', ')));
    }
    return row;
  });
  return { tab: table.name, headers: table.headers, rows };
}

function collect<S extends AnyColumns>(
  table: TableDef<S>,
  changes: TableChanges<EntityOf<S>> | undefined,
  appends: AppendRequest[],
  updates: AppendRequest[],
): void {
  if (changes?.insert?.length) appends.push(toRequest(table, changes.insert));
  if (changes?.update?.length) updates.push(toRequest(table, changes.update));
}

export class ScriptRepository implements Repository {
  /** Vero solo dopo una `load` riuscita: finché i dati non sono validati non si scrive. */
  private validated = false;

  constructor(private readonly api: ScriptApi) {}

  async init(): Promise<void> {
    await this.api.init(Object.fromEntries(ALL_TABLES.map((t) => [t.name, t.headers])));

    // _meta: scrive solo i valori mancanti (se ne esiste già uno, lo script rifiuterebbe il duplicato).
    const tabs = await this.api.read([metaTable.name]);
    const present = new Set(
      rowsToObjects(tabs[metaTable.name] ?? [], metaTable.headers, metaTable.name).map(
        (r) => r.key,
      ),
    );
    const missing = Object.entries(META_DEFAULTS).filter(([key]) => !present.has(key));
    if (missing.length > 0) {
      await this.api.write({
        appends: [
          {
            tab: metaTable.name,
            headers: metaTable.headers,
            rows: missing.map(([key, value]) => [key, value]),
          },
        ],
      });
    }
  }

  async load(): Promise<Dataset> {
    this.validated = false;
    const tabs = await this.api.read(ALL_TABLES.map((t) => t.name));
    const issues: DataIssue[] = [];
    const values = (name: string) => tabs[name] ?? [];

    const meta = readTable(metaTable, values(metaTable.name), issues);
    const accounts = readTable(accountsTable, values(accountsTable.name), issues);
    const categories = readTable(categoriesTable, values(categoriesTable.name), issues);
    const transactions = readTable(transactionsTable, values(transactionsTable.name), issues);
    const fxRates = readTable(fxRatesTable, values(fxRatesTable.name), issues);

    const first = issues[0];
    if (first) {
      throw new DataError(
        strings.errors.data.invalid(
          issues.length,
          first.table,
          first.row,
          first.columns.join(', '),
        ),
        issues,
      );
    }

    assertUniqueKeys(
      metaTable.name,
      meta.map((e) => e.key),
    );
    assertUniqueKeys(
      accountsTable.name,
      accounts.map((e) => e.id),
    );
    assertUniqueKeys(
      categoriesTable.name,
      categories.map((e) => e.id),
    );
    assertUniqueKeys(
      transactionsTable.name,
      transactions.map((e) => e.id),
    );
    assertUniqueKeys(
      fxRatesTable.name,
      fxRates.map((e) => e.id),
    );

    const metaMap = Object.fromEntries(meta.map((e) => [e.key, e.value]));
    if (metaMap['schema_version'] !== SCHEMA_VERSION) {
      throw new DataError(strings.errors.data.unsupportedVersion);
    }

    this.validated = true;
    return {
      accounts: accounts.filter((e) => !e.deleted),
      categories: categories.filter((e) => !e.deleted),
      transactions: transactions.filter((e) => !e.deleted),
      fxRates: fxRates.filter((e) => !e.deleted),
      meta: metaMap,
    };
  }

  async save(changes: ChangeSet): Promise<void> {
    if (!this.validated) throw new DataError(strings.errors.data.notLoaded);

    const appends: AppendRequest[] = [];
    const updates: AppendRequest[] = [];
    collect(accountsTable, changes.accounts, appends, updates);
    collect(categoriesTable, changes.categories, appends, updates);
    collect(transactionsTable, changes.transactions, appends, updates);
    collect(fxRatesTable, changes.fxRates, appends, updates);

    if (appends.length === 0 && updates.length === 0) return;
    // Una sola richiesta: lo script la esegue in modo atomico (tutto o niente).
    await this.api.write({ appends, updates });
  }
}
