import type { FxRate } from '../data/schema';
import { assertMinor, BASE_CURRENCY, MoneyError } from './money';

/**
 * Cambi. Convenzione: il tasso è "1 EUR = tasso unità della valuta", come pubblica la BCE
 * (es. USD 1,1476). Calcoli con interi grandi (BigInt): nessun float, arrotondamento al
 * centesimo con il mezzo verso l'esterno (come si arrotonda un importo di denaro).
 */

const DECIMAL = /^\d+(\.\d+)?$/;

/** Il tasso decimale "1.1476" come frazione intera 11476 / 10000. Lancia se non è un decimale > 0. */
function parseRate(rate: string): { numerator: bigint; scale: bigint } {
  if (!DECIMAL.test(rate) || !/[1-9]/.test(rate)) {
    throw new MoneyError('Tasso di cambio non valido.');
  }
  const [whole = '0', fraction = ''] = rate.split('.');
  return { numerator: BigInt(whole + fraction), scale: 10n ** BigInt(fraction.length) };
}

/** Divisione con arrotondamento del mezzo verso l'esterno (lontano da zero). Denominatore > 0. */
function roundDiv(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = (2n * abs + denominator) / (2n * denominator);
  return negative ? -quotient : quotient;
}

function toSafeInteger(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new MoneyError('Importo convertito fuori dall’intervallo.');
  return result;
}

/**
 * Importo nella valuta del conto (centesimi) → EUR (centesimi) al tasso dato.
 * `quoteExponent`: cifre decimali della valuta (USD 2, JPY 0).
 */
export function toBaseMinor(
  amountMinor: number,
  rate: string,
  quoteExponent: number,
  baseExponent = 2,
): number {
  assertMinor(amountMinor);
  const { numerator, scale } = parseRate(rate);
  // base = importo / 10^qe / (numeratore/scala) * 10^be
  const top = BigInt(amountMinor) * 10n ** BigInt(baseExponent) * scale;
  const bottom = 10n ** BigInt(quoteExponent) * numerator;
  return toSafeInteger(roundDiv(top, bottom));
}

/** EUR (centesimi) → valuta del conto (centesimi) al tasso dato. */
export function fromBaseMinor(
  baseMinor: number,
  rate: string,
  quoteExponent: number,
  baseExponent = 2,
): number {
  assertMinor(baseMinor);
  const { numerator, scale } = parseRate(rate);
  const top = BigInt(baseMinor) * numerator * 10n ** BigInt(quoteExponent);
  const bottom = scale * 10n ** BigInt(baseExponent);
  return toSafeInteger(roundDiv(top, bottom));
}

/** Tasso in cache per quella data e valuta, se c'è. L'EUR vale sempre 1. */
export function findRate(
  rates: readonly Pick<FxRate, 'date' | 'base_currency' | 'quote_currency' | 'rate'>[],
  date: string,
  quote: string,
): string | undefined {
  if (quote === BASE_CURRENCY) return '1';
  return rates.find(
    (r) => r.base_currency === BASE_CURRENCY && r.quote_currency === quote && r.date === date,
  )?.rate;
}

/** "1.1476" → "1,1476" (virgola decimale all'italiana). */
export function formatRate(rate: string): string {
  return rate.replace('.', ',');
}
