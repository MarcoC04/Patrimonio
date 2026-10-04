import { todayIso } from '../domain/dates';
import { findRate } from '../domain/fx';
import { BASE_CURRENCY } from '../domain/money';
import { uuidv7 } from '../domain/uuid7';
import { strings } from '../ui/strings';
import type { ChangeSet, Repository } from './repository';
import type { FxRate } from './schema';
import { ScriptError } from './scriptClient';

/**
 * Cambi con cache nella scheda `fx_rates` (ARCHITECTURE.md §5). Un tasso già in cache non si
 * richiede di nuovo. La cache è indicizzata per (data richiesta, valuta): per un weekend o un
 * festivo la riga porta la data richiesta e, in `source`, la data effettiva del tasso
 * ("frankfurter:2026-03-13"); così lo stesso giorno non si richiede due volte.
 */

export interface FxDeps {
  fetchRates: Repository['fetchRates'];
  /** Righe attuali di `fx_rates` (la cache). */
  cache: () => readonly FxRate[];
  save: (changes: ChangeSet) => Promise<void>;
  now?: () => Date;
}

export interface FxService {
  /** Tasso EUR → `quote` per quella data (1 EUR = tasso). L'EUR vale '1'. */
  rateFor(date: string, quote: string): Promise<string>;
  /** Ultimi tassi per più valute (per rivalutare il patrimonio). L'EUR vale '1'. */
  latestRates(currencies: readonly string[]): Promise<Record<string, string>>;
}

function unavailable(): ScriptError {
  return new ScriptError('fx_unavailable', strings.errors.script.fx_unavailable);
}

function cacheRow(date: string, quote: string, rate: string, rateDate: string, now: Date): FxRate {
  const timestamp = now.toISOString();
  return {
    id: uuidv7(now.getTime()),
    created_at: timestamp,
    updated_at: timestamp,
    deleted: false,
    date,
    base_currency: BASE_CURRENCY,
    quote_currency: quote,
    rate,
    source: `frankfurter:${rateDate}`,
    fetched_at: timestamp,
  };
}

export function createFxService(deps: FxDeps): FxService {
  const clock = deps.now ?? (() => new Date());
  // Richieste identiche in corso condividono lo stesso risultato: niente righe doppie in cache.
  const inFlight = new Map<string, Promise<string>>();

  /** La cache è un'ottimizzazione: se non si riesce a scriverla il tasso resta valido. */
  const remember = async (rows: FxRate[]): Promise<void> => {
    try {
      await deps.save({ fxRates: { insert: rows } });
    } catch {
      // Il salvataggio del movimento che segue mostrerà un eventuale problema di collegamento.
    }
  };

  const rateFor = (requestedDate: string, quote: string): Promise<string> => {
    if (quote === BASE_CURRENCY) return Promise.resolve('1');
    // Una data futura non ha ancora un tasso: si usa quello di oggi (l'ultimo disponibile).
    const today = todayIso(clock());
    const date = requestedDate > today ? today : requestedDate;

    const hit = findRate(deps.cache(), date, quote);
    if (hit !== undefined) return Promise.resolve(hit);

    const key = `${date}|${quote}`;
    const pending = inFlight.get(key);
    if (pending) return pending;

    const request = (async () => {
      const fetched = await deps.fetchRates(date, [quote]);
      const rate = fetched.rates[quote];
      if (rate === undefined) throw unavailable();
      await remember([cacheRow(date, quote, rate, fetched.date, clock())]);
      return rate;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  };

  const latestRates = async (currencies: readonly string[]): Promise<Record<string, string>> => {
    const today = todayIso(clock());
    const result: Record<string, string> = { [BASE_CURRENCY]: '1' };
    const missing: string[] = [];
    for (const currency of new Set(currencies)) {
      if (currency === BASE_CURRENCY) continue;
      const hit = findRate(deps.cache(), today, currency);
      if (hit !== undefined) result[currency] = hit;
      else missing.push(currency);
    }
    if (missing.length === 0) return result;

    // Una sola richiesta per tutte le valute mancanti, salvate in cache con la data di oggi.
    const fetched = await deps.fetchRates('latest', missing);
    const rows: FxRate[] = [];
    for (const currency of missing) {
      const rate = fetched.rates[currency];
      if (rate === undefined) throw unavailable();
      result[currency] = rate;
      rows.push(cacheRow(today, currency, rate, fetched.date, clock()));
    }
    await remember(rows);
    return result;
  };

  return { rateFor, latestRates };
}
