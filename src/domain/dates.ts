/** Date come stringhe ISO `YYYY-MM-DD` (nessun fuso: sono date di calendario). */

/** True se il testo è una data ISO reale (controllata sul calendario: no 2026-02-30). */
export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Data di oggi nel fuso locale dell'utente (non UTC: a mezzanotte "oggi" deve cambiare per lui). */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** "Giovedì 18 giugno": la data di oggi per le intestazioni, in italiano. */
export function todayLongIt(now: Date = new Date()): string {
  const text = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 2026-03-15 → "15/03/2026" (formato it-IT, senza passare da Date: nessuno scarto di fuso). */
export function formatDateIt(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
