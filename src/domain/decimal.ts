import Decimal from 'decimal.js';
import { MoneyError, THOUSANDS } from './money';

/**
 * Quantità e prezzi degli asset: stringhe decimali esatte (es. "0.12345678"), mai float
 * (CLAUDE.md). `decimal.js` resta confinato in questo modulo: il resto del codice usa stringhe.
 */

// Precisione larga e arrotondamento "mezzo verso l'esterno" (come per il denaro).
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Massimo di cifre decimali accettate per quantità e prezzi (le criptovalute ne usano 8). */
export const MAX_DECIMALS = 12;

/**
 * Legge un numero scritto all'italiana e lo restituisce come stringa decimale canonica
 * ("1.234,5" → "1234.5"), o null se non valido. Solo valori non negativi.
 *
 * Il punto da solo è ambiguo: "1.234" potrebbe essere milleduecentotrentaquattro o 1,234. Per le
 * quantità sbagliare di mille volte è grave, quindi quel caso è **rifiutato** (si scrive "1234" o
 * "1,234"). Sono accettati senza ambiguità "12.5", "0.125", "1.234,56" e "1.234.567".
 */
export function parseDecimal(input: string, maxDecimals = MAX_DECIMALS): string | null {
  const text = input.trim();
  if (text === '') return null;

  let whole: string;
  let fraction = '';

  if (text.includes(',')) {
    const parts = text.split(',');
    if (parts.length !== 2) return null;
    const [left = '', right = ''] = parts;
    if (!/^\d+$/.test(right)) return null;
    if (left.includes('.') ? !THOUSANDS.test(left) : !/^\d+$/.test(left)) return null;
    whole = left.replaceAll('.', '');
    fraction = right;
  } else if (text.includes('.')) {
    if (THOUSANDS.test(text)) {
      if (text.split('.').length === 2) return null; // "1.234": ambiguo
      whole = text.replaceAll('.', '');
    } else if (/^\d+\.\d+$/.test(text)) {
      [whole = '', fraction = ''] = text.split('.');
    } else {
      return null;
    }
  } else {
    if (!/^\d+$/.test(text)) return null;
    whole = text;
  }

  if (fraction.length > maxDecimals) return null;
  // toFixed() non usa mai la notazione scientifica e toglie gli zeri inutili ("0.50" → "0.5").
  return new D(`${whole}.${fraction === '' ? '0' : fraction}`).toFixed();
}

/** Stringa decimale canonica → testo it-IT ("1234.5" → "1234,5"; da 5 cifre intere compare il punto). */
export function formatDecimal(value: string): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: MAX_DECIMALS }).format(
    value as unknown as number, // Intl.NumberFormat accetta stringhe decimali; i tipi TS non lo riflettono ancora
  );
}

/** Stringa decimale canonica → testo modificabile con la virgola, senza separatore delle migliaia. */
export function formatDecimalPlain(value: string): string {
  return new D(value).toFixed().replace('.', ',');
}

/**
 * Numero scritto in modo "tecnico" (come lo salva Excel: punto decimale, eventuale notazione
 * scientifica, qualche cifra di rumore in coda) → stringa decimale canonica con al massimo
 * `maxDecimals` decimali. Null se non è un numero. Accetta anche il segno.
 */
export function toPlainDecimal(raw: string, maxDecimals = 8): string | null {
  const text = raw.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return null;
  const value = new D(text).toDecimalPlaces(maxDecimals, Decimal.ROUND_HALF_UP);
  return value.isZero() ? '0' : value.toFixed();
}

export function isDecimal(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value);
}

export function isPositiveDecimal(value: string): boolean {
  return isDecimal(value) && new D(value).gt(0);
}

/** Somma esatta: 0,1 + 0,2 = 0,3 (in float darebbe 0.30000000000000004). */
export function sumDecimals(values: readonly string[]): string {
  return values.reduce((total, value) => total.plus(value), new D(0)).toFixed();
}

export function subtractDecimals(a: string, b: string): string {
  return new D(a).minus(b).toFixed();
}

/** -1, 0 o 1 secondo che `a` sia minore, uguale o maggiore di `b`. */
export function compareDecimals(a: string, b: string): -1 | 0 | 1 {
  return new D(a).comparedTo(b) as -1 | 0 | 1;
}

/**
 * Decimale in unità "maggiori" (euro, dollari…) → centesimi interi della valuta, arrotondati al
 * mezzo verso l'esterno. `exponent`: cifre decimali della valuta (USD 2, JPY 0).
 */
export function decimalToMinor(value: string, exponent: number): number {
  return toSafeInteger(new D(value).times(new D(10).pow(exponent)));
}

/** quantità × prezzo → centesimi interi della valuta: il calcolo del valore di una posizione. */
export function multiplyToMinor(quantity: string, unitPrice: string, exponent: number): number {
  return toSafeInteger(new D(quantity).times(unitPrice).times(new D(10).pow(exponent)));
}

function toSafeInteger(value: Decimal): number {
  const result = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  if (!Number.isSafeInteger(result))
    throw new MoneyError('Valore fuori dall’intervallo supportato.');
  return result === 0 ? 0 : result; // niente -0
}
