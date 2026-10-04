import type { Account } from '../data/schema';
import { isIsoDate } from './dates';
import { sumMinor } from './money';

/**
 * Saldo ricavato dagli estratti conto. Il saldo di un conto resta "saldo iniziale + movimenti",
 * quindi si aggiorna da solo a ogni importazione. Quello che cambia è come si fissa il saldo
 * iniziale: non lo scrive l'utente, lo ricava l'import.
 *
 * - **Retrodatazione**: se l'estratto contiene righe anteriori all'apertura del conto, l'apertura
 *   si sposta alla prima riga (invece di rifiutarle). Se il saldo iniziale era già stato fissato
 *   (da un estratto precedente o a mano), lo si corregge delle righe aggiunte prima, così il
 *   saldo attuale non cambia.
 * - **Ancoraggio**: se si conosce il saldo a fine estratto (Revolut lo riporta; per gli altri lo
 *   scrive l'utente), il saldo iniziale diventa `saldo dichiarato − somma dei movimenti fino a
 *   quella data`: da lì il conto torna esattamente al saldo dell'estratto.
 */

export interface BalanceMovement {
  date: string;
  amountMinor: number;
}

export interface BalanceInput {
  account: Pick<Account, 'opening_balance_minor' | 'opening_date'>;
  /** Movimenti già presenti sul conto. */
  existing: readonly BalanceMovement[];
  /** Movimenti che si stanno importando. */
  added: readonly BalanceMovement[];
  /** Saldo a fine estratto e giorno a cui si riferisce; null se non si conosce. */
  declaredMinor: number | null;
  anchorDate: string | null;
  /** Il saldo iniziale è già stato ricavato da un estratto precedente. */
  alreadyAnchored: boolean;
}

export interface BalanceUpdate {
  openingDate: string;
  openingBalanceMinor: number;
  /** Apertura o saldo iniziale diversi da prima: il conto va aggiornato. */
  changed: boolean;
  /** Il saldo è stato fissato dall'estratto (da ricordare per i prossimi confronti). */
  anchored: boolean;
  /** Retrodatata l'apertura (c'erano righe precedenti). */
  backdated: boolean;
  /** Saldo che risultava dai movimenti al giorno dell'ancoraggio, prima di fissarlo. */
  expectedMinor: number | null;
  /** Dichiarato − atteso. 0 = il saldo torna. */
  differenceMinor: number | null;
  /**
   * La differenza è un segnale utile (mancano movimenti o un estratto?) solo se il saldo
   * iniziale era già noto; altrimenti è semplicemente il saldo iniziale che si sta ricavando.
   */
  differenceMeaningful: boolean;
}

export function computeBalanceUpdate(input: BalanceInput): BalanceUpdate {
  const { account, existing, added, declaredMinor, anchorDate, alreadyAnchored } = input;
  const known = alreadyAnchored || account.opening_balance_minor !== 0;

  const addedDates = added.map((m) => m.date).filter(isIsoDate);
  const earliest = addedDates.length === 0 ? null : addedDates.reduce((a, b) => (a < b ? a : b));

  let openingDate = account.opening_date;
  let opening = account.opening_balance_minor;
  let backdated = false;
  if (earliest !== null && earliest < account.opening_date) {
    backdated = true;
    openingDate = earliest;
    // Il saldo noto resta lo stesso: le righe aggiunte prima si tolgono dal saldo iniziale.
    // Con un saldo iniziale ancora sconosciuto (0) non c'è nulla da compensare.
    if (known) {
      const before = added.filter((m) => m.date < account.opening_date).map((m) => m.amountMinor);
      opening = opening - sumMinor(before);
    }
  }

  let expectedMinor: number | null = null;
  let differenceMinor: number | null = null;
  let anchored = false;
  if (declaredMinor !== null && anchorDate !== null && isIsoDate(anchorDate)) {
    const upTo = [...existing, ...added]
      .filter((m) => m.date <= anchorDate)
      .map((m) => m.amountMinor);
    const movements = sumMinor(upTo);
    expectedMinor = opening + movements;
    differenceMinor = declaredMinor - expectedMinor;
    opening = declaredMinor - movements;
    anchored = true;
  }

  return {
    openingDate,
    openingBalanceMinor: opening,
    changed: openingDate !== account.opening_date || opening !== account.opening_balance_minor,
    anchored,
    backdated,
    expectedMinor,
    differenceMinor,
    differenceMeaningful: anchored && known,
  };
}

/**
 * Saldo di fine estratto dalle righe, se l'estratto lo riporta: il saldo dell'ultima riga
 * completata (a parità di data, l'ultima del file), con il giorno a cui si riferisce.
 */
export function statementEndBalance(
  rows: readonly { date: string; balanceMinor: number | null; completed: boolean }[],
): { balanceMinor: number; date: string } | null {
  let best: { balanceMinor: number; date: string } | null = null;
  for (const row of rows) {
    if (!row.completed || row.balanceMinor === null) continue;
    if (best === null || row.date >= best.date)
      best = { balanceMinor: row.balanceMinor, date: row.date };
  }
  return best;
}
