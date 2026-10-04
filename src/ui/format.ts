import { formatMoney } from '../domain/money';

/** Importo con segno esplicito: "+1.234,56 €" / "-12,34 €". Il segno è nel testo, non solo nel colore. */
export function signedMoney(minor: number): string {
  return minor > 0 ? `+${formatMoney(minor)}` : formatMoney(minor);
}
