/**
 * Tipi comuni dell'import degli estratti conto. Ogni formato (banca) ha un parser in un file a
 * sé che implementa `StatementParser`: legge una tabella di testo e restituisce righe normalizzate.
 * Il contenuto del file non viene mai salvato: si leggono i valori e si scarta tutto.
 */

export type ParserId = 'revolut' | 'fineco' | 'trade_republic';

/** Motivi per cui una riga non va importata senza un controllo dell'utente (esclusa in anteprima). */
export type RowWarning =
  /** Movimento non definitivo: in sospeso, annullato, rifiutato… */
  | 'not_completed'
  /** Valuta diversa da quella del conto. */
  | 'other_currency'
  /** Tipo di riga che l'app non sa interpretare. */
  | 'unknown_type'
  /** Acquisto o vendita con indicazioni contrastanti. */
  | 'unclear_direction'
  /** Importo nullo. */
  | 'zero_amount';

/** Acquisto o vendita di un titolo letto da un estratto (Trade Republic). */
export interface ImportedTrade {
  type: 'buy' | 'sell';
  name: string;
  /** Simbolo o ISIN come scritto nel file (può essere vuoto). */
  symbol: string;
  /** Tipo di asset come scritto dalla banca (es. FUND, STOCK, CRYPTO). */
  assetClass: string;
  /** Quantità, stringa decimale esatta e positiva. */
  quantity: string;
  /** Prezzo di una unità, stringa decimale esatta. */
  unitPrice: string;
  /** Commissioni in centesimi, valore positivo. */
  feeMinor: number;
}

export interface ImportedRow {
  /** Numero di riga nel file (1 = prima riga, di solito l'intestazione): per i messaggi. */
  line: number;
  /** Data ISO YYYY-MM-DD. */
  date: string;
  /** Effetto netto sul conto, in centesimi con segno (commissioni e tasse incluse). */
  amountMinor: number;
  currency: string;
  description: string;
  /** Testo originale della banca, per la deduplicazione e le regole. */
  rawDescription: string;
  /** Identificativo assegnato dalla banca, se esiste (es. transaction_id di Trade Republic). */
  externalId: string | null;
  trade: ImportedTrade | null;
  /** Saldo del conto DOPO questa riga, se l'estratto lo riporta (Revolut: colonna Saldo). */
  balanceMinor: number | null;
  warnings: RowWarning[];
}

/** Perché una riga è stata scartata dal parser (non c'è nulla da mostrare né da importare). */
export type SkipReason = 'bad_date' | 'bad_amount';

export interface ParseResult {
  rows: ImportedRow[];
  skipped: { line: number; reason: SkipReason }[];
}

export interface StatementParser {
  id: ParserId;
  /** Nome mostrato all'utente. */
  label: string;
  /** Tipo di file atteso. */
  fileKind: 'csv' | 'xlsx';
  /** Estensioni accettate dal selettore di file. */
  accept: string;
  /** Legge la tabella (prima riga a destra dell'intestazione compresa). Lancia ImportFormatError se le colonne non tornano. */
  parse(table: string[][]): ParseResult;
}
