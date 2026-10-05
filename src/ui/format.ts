import type { YearMonth } from '../domain/dashboard';
import { formatMoney } from '../domain/money';

/**
 * Importo con segno esplicito: "+1.234,56 €" / "-12,34 €". Il segno è nel testo, non solo nel
 * colore. `currency`: la valuta dell'importo (EUR se non indicata).
 */
export function signedMoney(minor: number, currency = 'EUR'): string {
  return minor > 0 ? `+${formatMoney(minor, currency)}` : formatMoney(minor, currency);
}

// Nomi dei mesi scritti qui, non presi da Intl: stesso risultato su ogni browser e dispositivo.
const MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const;

/** "2026-03" → "marzo 2026". */
export function formatMonthLabel(month: YearMonth): string {
  const [year, monthNumber] = month.split('-');
  const name = MONTHS[Number(monthNumber) - 1];
  return name && year ? `${name} ${year}` : month;
}

/** "2026-03-31" → "mar 26" (asse dei grafici). */
export function formatMonthShort(isoDate: string): string {
  const [year, monthNumber] = isoDate.split('-');
  const name = MONTHS[Number(monthNumber) - 1];
  return name && year ? `${name.slice(0, 3)} ${year.slice(2)}` : isoDate;
}

/**
 * Rendimento da decimi di punto percentuale a testo con segno: 188 → "+18,8%", −100 → "−10,0%",
 * 0 → "0,0%". Aritmetica intera: nessun float nel calcolo.
 */
export function formatTenthsPercent(tenths: number): string {
  const abs = Math.abs(tenths);
  const text = `${Math.floor(abs / 10)},${abs % 10}%`;
  if (tenths > 0) return `+${text}`;
  return tenths < 0 ? `-${text}` : text;
}

/**
 * Importo abbreviato per gli assi dei grafici: "800", "19,1K", "-2,5K". Solo visualizzazione:
 * l'arrotondamento non entra mai nei calcoli.
 */
export function formatEuroCompact(minor: number): string {
  const euros = Math.round(Math.abs(minor) / 100);
  if (euros === 0) return '0';
  const sign = minor < 0 ? '-' : '';
  if (euros < 1000) return `${sign}${euros}`;
  const thousands = Math.round(Math.abs(minor) / 10_000) / 10; // un decimale
  return `${sign}${String(thousands).replace('.', ',')}K`;
}

/**
 * Euro interi con separatore it-IT ("1.200"), per le etichette degli assi.
 * Solo visualizzazione: l'arrotondamento non entra mai nei calcoli.
 */
export function formatEuroWhole(minor: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(
    Math.round(minor / 100),
  );
}

export interface MoneyParts {
  /** "-" per gli importi negativi, altrimenti vuoto. */
  sign: string;
  /** Parte intera con i separatori delle migliaia ("90.911"). */
  whole: string;
  /** Centesimi con la virgola (",80"). */
  fraction: string;
  /** Simbolo della valuta ("€"). */
  currency: string;
}

/**
 * Importo diviso nelle sue parti, per mostrare i centesimi più piccoli: 9091180 → "90.911" + ",80".
 * Il valore passa a Intl come stringa decimale, senza divisioni in virgola mobile.
 */
export function splitMoney(minor: number, currency = 'EUR'): MoneyParts {
  const negative = minor < 0;
  const digits = String(Math.abs(minor)).padStart(3, '0');
  const decimal = `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
  const parts = new Intl.NumberFormat('it-IT', { style: 'currency', currency }).formatToParts(
    decimal as unknown as number, // Intl accetta stringhe decimali; i tipi TS non lo riflettono ancora
  );
  const pick = (type: Intl.NumberFormatPartTypes) =>
    parts
      .filter((p) => p.type === type)
      .map((p) => p.value)
      .join('');
  return {
    sign: negative ? '-' : '',
    whole:
      pick('integer') === ''
        ? '0'
        : parts
            .filter((p) => p.type === 'integer' || p.type === 'group')
            .map((p) => p.value)
            .join(''),
    fraction: `${pick('decimal')}${pick('fraction')}`,
    currency: pick('currency'),
  };
}
