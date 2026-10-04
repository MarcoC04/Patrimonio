import { z } from 'zod';
import { isIsoDate } from '../domain/dates';

/**
 * Una colonna del foglio: lo schema Zod legge la stringa della cella e la converte nel tipo
 * dell'app; `format` fa il percorso inverso. Nel foglio tutto è testo (vedi ARCHITECTURE.md §5).
 * `format` è dichiarato come metodo (non come proprietà) per poter raccogliere colonne di tipi
 * diversi in uno stesso oggetto.
 */
export interface ColumnDef<T> {
  readonly schema: z.ZodType<T, string>;
  format(value: T): string;
}

const identity = (value: string) => value;

/** Codec delle colonne. I valori non validi non vengono mai riportati nei messaggi di errore. */
export const col = {
  /** Testo libero, anche vuoto. */
  text: { schema: z.string(), format: identity } satisfies ColumnDef<string>,

  /** Testo obbligatorio (non vuoto). */
  requiredText: { schema: z.string().min(1), format: identity } satisfies ColumnDef<string>,

  /** Identificatore (UUIDv7): non vuoto, senza spazi. */
  id: { schema: z.string().regex(/^\S+$/), format: identity } satisfies ColumnDef<string>,

  /** Riferimento opzionale: cella vuota = null. */
  optionalId: {
    schema: z
      .string()
      .regex(/^\S*$/)
      .transform((value) => (value === '' ? null : value)),
    format: (value: string | null) => value ?? '',
  } satisfies ColumnDef<string | null>,

  /** Importo in centesimi: intero con segno. */
  minor: {
    schema: z
      .string()
      .regex(/^-?\d+$/)
      .transform(Number)
      .refine(Number.isSafeInteger),
    format: (value: number) => String(value),
  } satisfies ColumnDef<number>,

  /** Intero non negativo (conteggi, priorità). */
  count: {
    schema: z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger),
    format: (value: number) => String(value),
  } satisfies ColumnDef<number>,

  /** Importo in centesimi facoltativo: cella vuota = null. */
  optionalMinor: {
    schema: z
      .string()
      .regex(/^(-?\d+)?$/)
      .transform((value) => (value === '' ? null : Number(value)))
      .refine((value) => value === null || Number.isSafeInteger(value)),
    format: (value: number | null) => (value === null ? '' : String(value)),
  } satisfies ColumnDef<number | null>,

  /** 0/1 nel foglio, boolean nell'app. */
  flag: {
    schema: z.enum(['0', '1']).transform((value) => value === '1'),
    format: (value: boolean) => (value ? '1' : '0'),
  } satisfies ColumnDef<boolean>,

  /** Data ISO YYYY-MM-DD, controllata sul calendario (no 2026-02-30). */
  date: {
    schema: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isIsoDate),
    format: identity,
  } satisfies ColumnDef<string>,

  /** Timestamp ISO 8601 UTC (es. 2026-01-02T03:04:05.000Z). */
  timestamp: {
    schema: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)
      .refine((value) => !Number.isNaN(Date.parse(value))),
    format: identity,
  } satisfies ColumnDef<string>,

  /** Codice valuta a 3 lettere maiuscole. */
  currency: {
    schema: z.string().regex(/^[A-Z]{3}$/),
    format: identity,
  } satisfies ColumnDef<string>,

  /** Decimale esatto come stringa (es. tasso di cambio), maggiore di zero. Mai float. */
  positiveDecimal: {
    schema: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .refine((value) => /[1-9]/.test(value)),
    format: identity,
  } satisfies ColumnDef<string>,

  /** Decimale esatto come stringa, zero o maggiore (quantità, prezzi). Mai float. */
  decimal: {
    schema: z.string().regex(/^\d+(\.\d+)?$/),
    format: identity,
  } satisfies ColumnDef<string>,

  /** Uno tra i valori ammessi. */
  oneOf<const V extends readonly [string, ...string[]]>(values: V) {
    // `format` tipizzato sul valore ammesso: altrimenti il tipo dell'entità si allargherebbe a string.
    return {
      schema: z.enum(values),
      format: (value: V[number]) => value,
    } satisfies ColumnDef<V[number]>;
  },
};

/** Tipo dell'entità a partire dalla definizione delle colonne. */
export type EntityOf<S extends Record<string, ColumnDef<unknown>>> = {
  [K in keyof S]: S[K] extends ColumnDef<infer T> ? T : never;
};

export interface TableDef<S extends Record<string, ColumnDef<unknown>>> {
  /** Nome della scheda nel foglio. */
  readonly name: string;
  /** Intestazioni, nell'ordine delle colonne. */
  readonly headers: readonly (keyof S & string)[];
  /** Legge una riga (celle come stringhe, per nome colonna). Restituisce le colonne non valide. */
  parse(
    raw: Record<string, string>,
  ): { ok: true; value: EntityOf<S> } | { ok: false; columns: string[] };
  /** Converte un'entità in riga di celle nell'ordine delle intestazioni. */
  toRow(entity: EntityOf<S>): string[];
}

/** Tipo dell'entità di una tabella già definita. */
export type RowOf<T> = T extends TableDef<infer S> ? EntityOf<S> : never;

/** L'ordine delle chiavi di `columns` è l'ordine delle colonne nel foglio. */
export function defineTable<S extends Record<string, ColumnDef<unknown>>>(
  name: string,
  columns: S,
): TableDef<S> {
  const headers = Object.keys(columns) as (keyof S & string)[];
  return {
    name,
    headers,
    parse(raw) {
      const value: Record<string, unknown> = {};
      const invalid: string[] = [];
      for (const header of headers) {
        const result = columns[header]?.schema.safeParse(raw[header] ?? '');
        if (result?.success) value[header] = result.data;
        else invalid.push(header);
      }
      return invalid.length > 0
        ? { ok: false, columns: invalid }
        : { ok: true, value: value as EntityOf<S> }; // ogni colonna è stata validata dal proprio schema
    },
    toRow(entity) {
      return headers.map((header) => {
        const def = columns[header] as ColumnDef<unknown> | undefined;
        return def ? def.format(entity[header]) : '';
      });
    },
  };
}
