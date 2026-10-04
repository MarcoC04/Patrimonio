import { z } from 'zod';
import { strings } from '../ui/strings';
import { HttpError, withBackoff } from './retry';

/** Il corpo della richiesta contiene la chiave: si invia solo verso gli script Google. */
const SCRIPT_URL_PREFIX = 'https://script.google.com/macros/s/';

/** Versione minima dello script richiesta da questa app (azione `write`, chiavi uniche). */
export const MIN_SCRIPT_VERSION = 2;
/** Versione che aggiunge l'azione `fx` (cambi). Serve solo a chi usa conti in valuta estera. */
export const FX_MIN_SCRIPT_VERSION = 3;

/** Errore restituito dallo script o risposta non interpretabile. Il messaggio è già per l'utente. */
export class ScriptError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ScriptError';
    this.code = code;
  }
}

export interface ScriptClientOptions {
  url: string;
  /** Restituisce la chiave corrente; lancia se manca. */
  getKey: () => string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export type TabSchemas = Record<string, readonly string[]>;

export interface AppendRequest {
  tab: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}

type ScriptResponse = { ok: true; data: unknown } | { ok: false; error: string };

/** Tassi EUR → valute: `date` è il giorno effettivo della pubblicazione (può precedere quello chiesto). */
export interface FxResult {
  date: string;
  rates: Record<string, string>;
}

const fxResultSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rates: z.record(z.string().regex(/^[A-Z]{3}$/), z.string().regex(/^\d+(\.\d+)?$/)),
});

export function messageForScriptError(code: string): string {
  const messages: Record<string, string> = strings.errors.script;
  return messages[code] ?? strings.errors.scriptOther(code);
}

export function messageForStatus(status: number): string {
  if (status === 429) return strings.errors.http[429];
  if (status >= 500) return strings.errors.http.server;
  return strings.errors.http.other(status);
}

function isScriptResponse(value: unknown): value is ScriptResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { ok?: unknown; error?: unknown };
  return candidate.ok === true || (candidate.ok === false && typeof candidate.error === 'string');
}

export class ScriptClient {
  private readonly url: string;
  private readonly getKey: () => string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: ((ms: number) => Promise<void>) | undefined;

  constructor(options: ScriptClientOptions) {
    if (!options.url.startsWith(SCRIPT_URL_PREFIX)) {
      throw new ScriptError('bad_url', strings.errors.badScriptUrl);
    }
    this.url = options.url;
    this.getKey = options.getKey;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep;
  }

  private async call(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    const body = JSON.stringify({ key: this.getKey(), action, ...payload });
    const json = await withBackoff(
      async () => {
        const response = await this.fetchFn(this.url, {
          method: 'POST',
          // text/plain: richiesta "semplice", senza preflight CORS (Apps Script non lo gestisce).
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body,
        });
        if (!response.ok) throw new HttpError(response.status, messageForStatus(response.status));
        try {
          return (await response.json()) as unknown;
        } catch {
          // Tipico quando l'accesso allo script non è "Chiunque": Google risponde con una pagina HTML.
          throw new ScriptError('bad_response', strings.errors.badResponse);
        }
      },
      this.sleep ? { sleep: this.sleep } : {},
    );

    if (!isScriptResponse(json)) throw new ScriptError('bad_response', strings.errors.badResponse);
    if (!json.ok) throw new ScriptError(json.error, messageForScriptError(json.error));
    return json.data;
  }

  /**
   * Verifica indirizzo e chiave senza toccare il foglio. Restituisce la versione dello script
   * (0 se è una versione vecchia che non la dichiara).
   */
  async ping(): Promise<number> {
    const data = (await this.call('ping')) as { version?: unknown } | null;
    return typeof data?.version === 'number' ? data.version : 0;
  }

  /** Crea le schede mancanti con le intestazioni; non modifica quelle esistenti. Restituisce quante ne ha create. */
  async init(tabs: TabSchemas): Promise<number> {
    const data = (await this.call('init', { tabs })) as { created?: unknown };
    return Array.isArray(data.created) ? data.created.length : 0;
  }

  /** Legge più schede in una sola richiesta. Valori sempre come stringhe. */
  async read(tabs: readonly string[]): Promise<Record<string, string[][]>> {
    return (await this.call('read', { tabs })) as Record<string, string[][]>;
  }

  /** Aggiunge righe a più schede in una sola richiesta; lo script valida tutto prima di scrivere. */
  async append(appends: readonly AppendRequest[]): Promise<void> {
    await this.call('append', { appends });
  }

  /**
   * Inserimenti e modifiche (per id, prima colonna) in una sola richiesta atomica: lo script
   * valida tutto prima di scrivere. Per le modifiche, `rows` contiene la riga intera.
   */
  async write(request: {
    appends?: readonly AppendRequest[];
    updates?: readonly AppendRequest[];
  }): Promise<void> {
    await this.call('write', { appends: request.appends ?? [], updates: request.updates ?? [] });
  }

  /**
   * Tassi EUR → `symbols` alla data (o `'latest'`), chiesti dallo script al servizio cambi.
   * Verso il servizio esterno vanno solo data e codici di valuta, mai importi.
   */
  async fx(date: string, symbols: readonly string[]): Promise<FxResult> {
    // Si controlla prima di inviare: così un `bad_request` dello script vuol dire "script vecchio".
    if (date !== 'latest' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ScriptError('bad_request', messageForScriptError('bad_request'));
    }
    if (symbols.length === 0 || symbols.some((s) => !/^[A-Z]{3}$/.test(s))) {
      throw new ScriptError('bad_request', messageForScriptError('bad_request'));
    }

    let data: unknown;
    try {
      data = await this.call('fx', { date, symbols });
    } catch (error) {
      // Uno script precedente alla versione 3 non conosce l'azione e risponde bad_request.
      if (error instanceof ScriptError && error.code === 'bad_request') {
        throw new ScriptError('fx_outdated', strings.errors.fxOutdated);
      }
      throw error;
    }
    const parsed = fxResultSchema.safeParse(data);
    if (!parsed.success) throw new ScriptError('bad_response', strings.errors.badResponse);
    return parsed.data;
  }
}
