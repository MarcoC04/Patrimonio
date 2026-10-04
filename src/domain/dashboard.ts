import type { Account, Category, Transaction } from '../data/schema';
import { todayIso } from './dates';
import { isTransfer } from './ledger';
import { sumMinor } from './money';

/**
 * Numeri della dashboard. Funzioni pure sugli importi in centesimi.
 * Per ora solo conti in EUR: con più valute servirà convertire con il cambio (passo E).
 */

/**
 * Saldo di un conto a una data (inclusa): saldo iniziale + movimenti fino a quel giorno.
 * Prima della data del saldo iniziale il conto "non esiste ancora" e vale 0.
 */
export function balanceAtMinor(
  account: Pick<Account, 'id' | 'opening_balance_minor' | 'opening_date'>,
  transactions: readonly Pick<Transaction, 'account_id' | 'date' | 'amount_minor'>[],
  isoDate: string,
): number {
  if (isoDate < account.opening_date) return 0;
  return sumMinor([
    account.opening_balance_minor,
    ...transactions
      .filter((t) => t.account_id === account.id && t.date <= isoDate)
      .map((t) => t.amount_minor),
  ]);
}

type AccountForTotals = Pick<Account, 'id' | 'opening_balance_minor' | 'opening_date' | 'type'>;
type TransactionForTotals = Pick<Transaction, 'account_id' | 'date' | 'amount_minor'>;

/** Patrimonio = somma dei saldi di tutti i conti alla data. I giroconti tra conti non lo cambiano. */
export function netWorthMinor(
  accounts: readonly AccountForTotals[],
  transactions: readonly TransactionForTotals[],
  isoDate: string,
): number {
  return sumMinor(accounts.map((a) => balanceAtMinor(a, transactions, isoDate)));
}

/** Liquidità = patrimonio dei soli conti non broker (corrente, risparmio, contanti). */
export function liquidityMinor(
  accounts: readonly AccountForTotals[],
  transactions: readonly TransactionForTotals[],
  isoDate: string,
): number {
  return netWorthMinor(
    accounts.filter((a) => a.type !== 'brokerage'),
    transactions,
    isoDate,
  );
}

export interface LiquidityPoint {
  date: string;
  balanceMinor: number;
}

export function liquiditySeries(
  accounts: readonly AccountForTotals[],
  transactions: readonly TransactionForTotals[],
  dates: readonly string[],
): LiquidityPoint[] {
  return dates.map((date) => ({
    date,
    balanceMinor: liquidityMinor(accounts, transactions, date),
  }));
}

/** Mese come "YYYY-MM". */
export type YearMonth = string;

export function currentMonth(now: Date = new Date()): YearMonth {
  return todayIso(now).slice(0, 7);
}

function parseMonth(month: YearMonth): { year: number; monthIndex: number } {
  const [y, m] = month.split('-').map(Number);
  if (y === undefined || m === undefined) throw new Error(`Mese non valido: ${month}`);
  return { year: y, monthIndex: m - 1 };
}

function formatMonth(year: number, monthIndex: number): YearMonth {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

/** Sposta di `delta` mesi (anche negativo), passando correttamente da un anno all'altro. */
export function shiftMonth(month: YearMonth, delta: number): YearMonth {
  const { year, monthIndex } = parseMonth(month);
  const total = year * 12 + monthIndex + delta;
  return formatMonth(Math.floor(total / 12), ((total % 12) + 12) % 12);
}

/** Primo e ultimo giorno del mese (gestisce anni bisestili). */
export function monthBounds(month: YearMonth): { from: string; to: string } {
  const { year, monthIndex } = parseMonth(month);
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * Le date da mostrare nel grafico: fine di ciascuno degli ultimi `count` mesi, in ordine
 * cronologico. Il mese in corso termina oggi (non ha ancora una fine).
 */
export function monthEndDates(now: Date, count: number): string[] {
  const current = currentMonth(now);
  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonth(current, i - (count - 1));
    return month === current ? todayIso(now) : monthBounds(month).to;
  });
}

export interface CategorySpend {
  /** Categoria di primo livello (le sottocategorie confluiscono nella madre); null = da categorizzare. */
  categoryId: string | null;
  /** Totale speso, positivo, in centesimi EUR. */
  amountMinor: number;
}

/**
 * Spese per categoria in un intervallo di date (estremi inclusi), dal più alto al più basso.
 * Sono escluse le entrate e i giroconti. Usa lo snapshot in EUR.
 */
export function spendByCategory(
  transactions: readonly Pick<
    Transaction,
    'date' | 'amount_base_minor' | 'category_id' | 'transfer_group_id'
  >[],
  categories: readonly Pick<Category, 'id' | 'parent_id'>[],
  range: { from: string; to: string },
): CategorySpend[] {
  const parentOf = new Map(categories.map((c) => [c.id, c.parent_id] as const));
  const totals = new Map<string | null, number[]>();

  for (const t of transactions) {
    if (isTransfer(t) || t.amount_base_minor >= 0) continue;
    if (t.date < range.from || t.date > range.to) continue;
    const own = t.category_id;
    // Una categoria sconosciuta (cancellata) conta come da categorizzare.
    const key = own !== null && parentOf.has(own) ? (parentOf.get(own) ?? own) : null;
    const list = totals.get(key) ?? [];
    list.push(-t.amount_base_minor);
    totals.set(key, list);
  }

  return [...totals.entries()]
    .map(([categoryId, amounts]) => ({ categoryId, amountMinor: sumMinor(amounts) }))
    .sort(
      (a, b) =>
        b.amountMinor - a.amountMinor || String(a.categoryId).localeCompare(String(b.categoryId)),
    );
}

/** Le prime `max` voci e la somma di tutte le altre. */
export function limitSpend(
  items: readonly CategorySpend[],
  max: number,
): { top: CategorySpend[]; othersMinor: number } {
  return {
    top: items.slice(0, max),
    othersMinor: sumMinor(items.slice(max).map((i) => i.amountMinor)),
  };
}

/** Percentuale intera arrotondata (0.5 verso l'alto), con aritmetica intera. 0 se il totale è 0. */
export function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.floor((part * 200 + total) / (total * 2));
}
