import codeGs from '../../../apps-script/Code.gs?raw';

/**
 * Solo per i test. Esegue apps-script/Code.gs così com'è, contro un finto foglio Google in memoria.
 * Serve a provare le garanzie dello script (atomicità, chiavi uniche, modifica per id) e, insieme
 * a `fetchFn`, a collaudare l'intera catena app → client → script → foglio senza rete.
 */

export const TEST_SECRET = 'segreto-di-prova';

class FakeRange {
  constructor(
    private sheet: FakeSheet,
    private row: number,
    private col: number,
    private rows: number,
    private cols: number,
  ) {}
  getDisplayValues(): string[][] {
    return Array.from({ length: this.rows }, (_, r) =>
      Array.from({ length: this.cols }, (_, c) => this.sheet.cell(this.row + r, this.col + c)),
    );
  }
  setValues(values: string[][]): void {
    if (this.row + this.rows - 1 > this.sheet.maxRows) throw new Error('fuori dalla griglia');
    values.forEach((rowValues, r) =>
      rowValues.forEach((value, c) => this.sheet.setCell(this.row + r, this.col + c, value)),
    );
  }
  setNumberFormat(format: string): void {
    this.sheet.textFormatApplied.push(format);
  }
}

export class FakeSheet {
  data = new Map<string, string>();
  maxRows = 1000;
  frozenRows = 0;
  textFormatApplied: string[] = [];
  writes = 0;
  constructor(public name: string) {}
  cell(row: number, col: number): string {
    return this.data.get(`${row},${col}`) ?? '';
  }
  setCell(row: number, col: number, value: string): void {
    this.writes++;
    this.data.set(`${row},${col}`, value);
  }
  getLastRow(): number {
    let last = 0;
    for (const key of this.data.keys()) {
      const [r] = key.split(',').map(Number);
      if (r !== undefined && this.data.get(key) !== '') last = Math.max(last, r);
    }
    return last;
  }
  getLastColumn(): number {
    let last = 0;
    for (const key of this.data.keys()) {
      const [, c] = key.split(',').map(Number);
      if (c !== undefined && this.data.get(key) !== '') last = Math.max(last, c);
    }
    return last;
  }
  getMaxRows(): number {
    return this.maxRows;
  }
  insertRowsAfter(_after: number, count: number): void {
    this.maxRows += count;
  }
  setFrozenRows(n: number): void {
    this.frozenRows = n;
  }
  getRange(row: number, col: number, rows: number, cols: number): FakeRange {
    return new FakeRange(this, row, col, rows, cols);
  }
  getDataRange(): FakeRange {
    return new FakeRange(this, 1, 1, this.getLastRow(), this.getLastColumn());
  }
}

export class FakeSpreadsheet {
  sheets = new Map<string, FakeSheet>();
  getSheetByName(name: string): FakeSheet | null {
    return this.sheets.get(name) ?? null;
  }
  insertSheet(name: string): FakeSheet {
    const sheet = new FakeSheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

export interface Reply {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export type FxReply = { code: number; body: string } | Error;

const DEFAULT_RATES: Record<string, number> = { USD: 1.1476, JPY: 182.85, GBP: 0.8561 };

/**
 * Finto servizio Frankfurter: stesso formato di risposta del vero (verificato). Per un sabato o una
 * domenica restituisce il venerdì precedente; per "latest" una data fissa. Valuta ignota → 404.
 */
export function defaultFx(url: string): FxReply {
  const parsed = new URL(url);
  const requested = parsed.pathname.split('/').pop() ?? '';
  const symbols = (parsed.searchParams.get('symbols') ?? '').split(',');
  if (symbols.some((symbol) => !(symbol in DEFAULT_RATES))) {
    return { code: 404, body: '{"message":"not found"}' };
  }
  let date = '2026-10-02';
  if (requested !== 'latest') {
    const day = new Date(`${requested}T00:00:00Z`);
    const back = day.getUTCDay() === 0 ? 2 : day.getUTCDay() === 6 ? 1 : 0;
    date = new Date(day.getTime() - back * 86_400_000).toISOString().slice(0, 10);
  }
  const rates = Object.fromEntries(symbols.map((symbol) => [symbol, DEFAULT_RATES[symbol]]));
  return { code: 200, body: JSON.stringify({ amount: 1, base: 'EUR', date, rates }) };
}

export function createScript(
  options: { secret?: string | null; lockAvailable?: boolean; fx?: (url: string) => FxReply } = {},
) {
  const spreadsheet = new FakeSpreadsheet();
  const secret = options.secret === undefined ? TEST_SECRET : options.secret;
  /** Indirizzi richiesti al servizio cambi: per verificare cosa lo script manda fuori. */
  const fetchedUrls: string[] = [];
  const sandbox = {
    UrlFetchApp: {
      fetch: (url: string) => {
        fetchedUrls.push(url);
        const reply = (options.fx ?? defaultFx)(url);
        if (reply instanceof Error) throw reply;
        return { getResponseCode: () => reply.code, getContentText: () => reply.body };
      },
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, flush: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => secret }) },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => options.lockAvailable !== false,
        releaseLock: () => {},
      }),
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text: string) => ({
        setMimeType() {
          return this;
        },
        getContent: () => text,
      }),
    },
  };
  // Solo nei test: lo script è eseguito con i servizi Google sostituiti dai finti qui sopra.
  const load = new Function(...Object.keys(sandbox), `${codeGs}\nreturn { doPost: doPost };`) as (
    ...services: unknown[]
  ) => { doPost: (e: unknown) => { getContent(): string } };
  const { doPost } = load(...Object.values(sandbox));

  /** Invia il corpo grezzo allo script e restituisce il testo della risposta. */
  const post = (body: string): string => doPost({ postData: { contents: body } }).getContent();

  const call = (request: Record<string, unknown>, key: string = TEST_SECRET): Reply =>
    JSON.parse(post(JSON.stringify({ key, ...request }))) as Reply;

  /** `fetch` finto: ogni POST arriva a doPost di Code.gs, come farebbe l'app web. */
  const fetchFn: typeof fetch = async (_input, init) =>
    new Response(post(String(init?.body)), { status: 200 });

  return { spreadsheet, call, fetchFn, fetchedUrls };
}
