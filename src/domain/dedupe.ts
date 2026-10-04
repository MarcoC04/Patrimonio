/**
 * Anti-duplicati dell'import (ARCHITECTURE.md §6): `dedupe_hash` = hash di conto + data + importo +
 * descrizione normalizzata. Se la banca fornisce un identificativo (es. `transaction_id` di Trade
 * Republic) si usa quello, che è più affidabile di qualsiasi ipotesi sul testo.
 */

/** Descrizione confrontabile: senza accenti, minuscola, solo lettere e cifre, spazi singoli. */
export function normalizeDescription(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** SHA-256 in esadecimale. Funziona nel browser, nei Web Worker e nei test. */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  // Copia in un buffer proprio: digest() non accetta viste su buffer condivisi.
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface HashInput {
  date: string;
  amountMinor: number;
  description: string;
  externalId: string | null;
}

/**
 * Un hash per riga, nell'ordine ricevuto.
 *
 * Due righe identiche nello stesso giorno (due caffè allo stesso prezzo) sono movimenti diversi:
 * al testo si aggiunge il numero d'ordine tra le righe identiche del file ("la prima", "la
 * seconda"…). Importando di nuovo lo stesso periodo si ottengono gli stessi hash; con un file
 * che comprende tutti i movimenti di quel giorno l'ordine coincide.
 */
export async function dedupeHashes(
  accountId: string,
  rows: readonly HashInput[],
): Promise<string[]> {
  const seen = new Map<string, number>();
  const hashes: string[] = [];
  for (const row of rows) {
    if (row.externalId) {
      hashes.push(`ext:${row.externalId}`);
      continue;
    }
    const base = `${accountId}|${row.date}|${row.amountMinor}|${normalizeDescription(row.description)}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    hashes.push(await sha256Hex(`${base}|${occurrence}`));
  }
  return hashes;
}
