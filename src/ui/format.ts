import type { YearMonth } from '../domain/dashboard';
import { formatMoney } from '../domain/money';

/** Importo con segno esplicito: "+1.234,56 €" / "-12,34 €". Il segno è nel testo, non solo nel colore. */
export function signedMoney(minor: number): string {
  return minor > 0 ? `+${formatMoney(minor)}` : formatMoney(minor);
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
 * Euro interi con separatore it-IT ("1.200"), per le etichette degli assi.
 * Solo visualizzazione: l'arrotondamento non entra mai nei calcoli.
 */
export function formatEuroWhole(minor: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(
    Math.round(minor / 100),
  );
}
