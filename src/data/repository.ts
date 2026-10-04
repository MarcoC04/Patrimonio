import type {
  Account,
  Asset,
  CategorizationRule,
  Category,
  FxRate,
  ImportBatch,
  InvestmentTransaction,
  PricePoint,
  Transaction,
} from './schema';

/**
 * Tutto l'accesso ai dati passa da qui: la UI non conosce lo script né il foglio.
 * Le entità restituite sono già validate (Zod) e convertite nei tipi dell'app.
 */

export interface Dataset {
  /** Solo le righe attive (`deleted` = false). */
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  fxRates: FxRate[];
  assets: Asset[];
  investmentTransactions: InvestmentTransaction[];
  priceHistory: PricePoint[];
  importBatches: ImportBatch[];
  categorizationRules: CategorizationRule[];
  meta: Record<string, string>;
}

export interface TableChanges<T> {
  /** Nuove righe: l'id va generato dal chiamante (UUIDv7). */
  insert?: readonly T[];
  /** Righe esistenti, riscritte per intero e identificate dall'id (mai dal numero di riga). */
  update?: readonly T[];
}

/** Insieme di modifiche applicato in modo atomico: o tutto o niente. */
export interface ChangeSet {
  accounts?: TableChanges<Account>;
  categories?: TableChanges<Category>;
  transactions?: TableChanges<Transaction>;
  fxRates?: TableChanges<FxRate>;
  assets?: TableChanges<Asset>;
  investmentTransactions?: TableChanges<InvestmentTransaction>;
  priceHistory?: TableChanges<PricePoint>;
  importBatches?: TableChanges<ImportBatch>;
  categorizationRules?: TableChanges<CategorizationRule>;
  /** Valori di `_meta` da impostare (inseriti se nuovi, aggiornati se già presenti). */
  meta?: Record<string, string>;
}

export interface Repository {
  /** Crea le schede mancanti e `_meta`. Idempotente; non modifica schede esistenti. */
  init(): Promise<void>;
  /** Legge tutte le schede con una sola richiesta e valida ogni riga. Lancia DataError se i dati non sono validi. */
  load(): Promise<Dataset>;
  /** Scrive le modifiche in una sola richiesta. Richiede una `load` riuscita in questa sessione. */
  save(changes: ChangeSet): Promise<void>;
  /**
   * Valori grezzi di tutte le schede (intestazioni incluse, anche le righe cancellate
   * logicamente), per l'esportazione. Una sola richiesta; non richiede una `load` e non scrive.
   */
  exportAll(): Promise<Record<string, string[][]>>;
  /**
   * Tassi di cambio EUR → `symbols` alla data (o `'latest'`) dal servizio Frankfurter, chiesti
   * tramite lo script: l'app non contatta servizi esterni. `date` nel risultato è il giorno
   * effettivo del tasso (per weekend e festivi, l'ultimo giorno precedente).
   */
  fetchRates(
    date: string,
    symbols: readonly string[],
  ): Promise<{ date: string; rates: Record<string, string> }>;
}

/** Cancellazione logica: la riga resta nel foglio con `deleted` = true (va poi passata a `update`). */
export function softDelete<T extends { deleted: boolean; updated_at: string }>(
  entity: T,
  now: Date = new Date(),
): T {
  return { ...entity, deleted: true, updated_at: now.toISOString() };
}

export interface DataIssue {
  table: string;
  /** Numero di riga nel foglio (la 1 è l'intestazione). */
  row: number;
  columns: string[];
}

/** Dati del foglio non validi. `issues` contiene solo posizioni, mai i valori delle celle. */
export class DataError extends Error {
  readonly issues: readonly DataIssue[];

  constructor(message: string, issues: readonly DataIssue[] = []) {
    super(message);
    this.name = 'DataError';
    this.issues = issues;
  }
}
