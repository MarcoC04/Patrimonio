/**
 * Denaro in interi (minor units): 12,34 € → 1234. Mai float per i calcoli.
 * Le conversioni da/verso testo passano solo da qui.
 */

/** Valuta base dell'app: i report e gli snapshot sono in EUR (ARCHITECTURE.md §5). */
export const BASE_CURRENCY = 'EUR';

/** Cifre decimali della valuta (EUR 2, JPY 0, ...), secondo Intl. */
export function minorExponent(currency: string): number {
  const digits = new Intl.NumberFormat('it-IT', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits;
  if (digits === undefined) throw new MoneyError(`Valuta non supportata: ${currency}.`);
  return digits;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function assertMinor(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError('Importo non valido: deve essere un intero in centesimi.');
  }
  return value;
}

/** Somma di importi in centesimi; errore se un valore non è intero o il totale esce dal range sicuro. */
export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    assertMinor(value);
    total += value;
    if (!Number.isSafeInteger(total))
      throw new MoneyError('Somma fuori dall’intervallo supportato.');
  }
  return total;
}

/**
 * Legge un importo scritto all'italiana e lo restituisce in centesimi, o null se non valido.
 * Accetta segno opzionale, virgola decimale e punto come separatore delle migliaia ("1.234,56"),
 * oppure il punto come decimale quando ha 1-2 cifre dopo ("12.5"). Altro (valuta, spazi interni,
 * più di 2 decimali) è rifiutato: meglio un errore che un importo indovinato.
 */
export function parseMoney(input: string, exponent = 2): number | null {
  const text = input.trim();
  const match = /^([+-])?(.+)$/.exec(text);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const body = match[2] ?? '';

  let whole: string;
  let fraction = '';
  if (body.includes(',')) {
    const parts = body.split(',');
    if (parts.length !== 2) return null;
    const [left = '', right = ''] = parts;
    if (!/^\d+$/.test(right)) return null;
    whole = left;
    fraction = right;
    // Con la virgola decimale, i punti nella parte intera sono migliaia: gruppi di 3.
    if (whole.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(whole)) return null;
    whole = whole.replaceAll('.', '');
  } else if (body.includes('.')) {
    if (/^\d{1,3}(\.\d{3})+$/.test(body)) {
      whole = body.replaceAll('.', ''); // "1.234" = milleduecentotrentaquattro
    } else if (/^\d+\.\d+$/.test(body)) {
      [whole = '', fraction = ''] = body.split('.');
    } else {
      return null;
    }
  } else {
    whole = body;
  }

  if (!/^\d+$/.test(whole) || fraction.length > exponent) return null;
  const minor = Number(whole + fraction.padEnd(exponent, '0'));
  if (!Number.isSafeInteger(minor)) return null;
  return sign * minor || 0; // evita -0
}

/**
 * Importo come testo modificabile ("12,34"): virgola decimale, senza simbolo né migliaia.
 * Serve a precompilare i campi in modifica; `parseMoney` lo rilegge identico.
 */
export function formatPlain(minor: number, exponent = 2): string {
  assertMinor(minor);
  const digits = String(Math.abs(minor)).padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return `${minor < 0 ? '-' : ''}${whole}${exponent > 0 ? `,${fraction}` : ''}`;
}

/**
 * Formatta in it-IT con simbolo di valuta ("1.234,56 €").
 * Il testo decimale esatto passa a Intl come stringa: nessuna divisione in virgola mobile.
 */
export function formatMoney(minor: number, currency = 'EUR', locale = 'it-IT'): string {
  assertMinor(minor);
  const exponent = minorExponent(currency);
  const negative = minor < 0;
  const digits = String(Math.abs(minor)).padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  const decimal = `${negative ? '-' : ''}${whole}${exponent > 0 ? `.${fraction}` : ''}`;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    decimal as unknown as number, // Intl.NumberFormat accetta stringhe decimali; i tipi TS non lo riflettono ancora
  );
}
