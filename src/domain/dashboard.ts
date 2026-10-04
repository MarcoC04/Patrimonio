import type { Account, Category, Transaction } from '../data/schema';
import { todayIso } from './dates';
import { toBaseMinor } from './fx';
import { isTransfer } from './ledger';
import { BASE_CURRENCY, minorExponent, sumMinor } from './money';

/**
 * Numeri della dashboard. Funzioni pure sugli importi in centesimi.
 * I saldi in valuta estera si rivalutano in EUR con i tassi passati (ARCHITECTURE.md §5: il
 * patrimonio attuale usa il tasso più recente). Una valuta senza tasso non si inventa: si
 * esclude dal totale e si segnala in `missing`.
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

type AccountForTotals = Pick<
  Account,
  'id' | 'opening_balance_minor' | 'opening_date' | 'type' | 'currency'
>;
type TransactionForTotals = Pick<Transaction, 'account_id' | 'date' | 'amount_minor'>;

/** Tassi "1 EUR = tasso unità" per valuta. L'EUR vale sempre 1 e non serve indicarlo. */
export type RateMap = Readonly<Record<string, string>>;

export interface BaseTotal {
  /** Totale in centesimi EUR, senza le valute prive di tasso. */
  totalMinor: number;
  /** Valute con saldo ma senza tasso: escluse dal totale, da segnalare all'utente. */
  missing: string[];
}

function exponentOrNull(currency: string): number | null {
  try {
    return minorExponent(currency);
  } catch {
    // Codice valuta non riconosciuto (dato rovinato nel foglio): non convertibile.
    return null;
  }
}

/** Saldo di un conto a una data, in EUR; null se manca il tasso della sua valuta. */
function balanceBaseAt(
  account: AccountForTotals,
  transactions: readonly TransactionForTotals[],
  isoDate: string,
  rates: RateMap,
): number | null {
  const balance = balanceAtMinor(account, transactions, isoDate);
  if (account.currency === BASE_CURRENCY) return balance;
  const rate = rates[account.currency];
  const exponent = exponentOrNull(account.currency);
  if (rate === undefined || exponent === null) return null;
  return toBaseMinor(balance, rate, exponent);
}

function totalBase(
  accounts: readonly AccountForTotals[],
  transactions: readonly TransactionForTotals[],
  isoDate: string,
  rates: RateMap,
): BaseTotal {
  const parts: number[] = [];
  const missing = new Set<string>();
  for (const account of accounts) {
    const value = balanceBaseAt(account, transactions, isoDate, rates);
    if (value === null) missing.add(account.currency);
    else parts.push(value);
  }
  return { totalMinor: sumMinor(parts), missing: [...missing].sort() };
}

/**
 * Patrimonio = somma dei saldi di tutti i conti alla data, in EUR. I giroconti tra conti non lo
 * cambiano. `rates`: i tassi da usare per le valute estere (di solito gli ultimi disponibili).
 */
export function netWorthBase(
  accounts: readonly AccountForTotals[],
  transactions: readonly TransactionForTotals[],
  isoDate: string,
  rates: RateMap = {},
): BaseTotal {
  return totalBase(accounts, transactions, isoDate, rates);
}

/** Liquidità = patrimonio dei soli conti non broker (corrente, risparmio, contanti), in EUR. */
export function liquidityBase(
  accounts: readonly AccountForTotals[],
  transactions: readonly TransactionForTotals[],
  isoDate: string,
  rates: RateMap = {},
): BaseTotal {
  return totalBase(
    accounts.filter((a) => a.type !== 'brokerage'),
    transactions,
    isoDate,
    rates,
  );
}

export interface LiquidityPoint {
  date: string;
  balanceMinor: number;
}

/**
 * Liquidità a più date, in EUR. Tutti i punti usano gli stessi tassi (quelli più recenti):
 * la serie mostra come varia il saldo, non le oscillazioni del cambio.
 */
export function liquiditySeries(
  accounts: readonly AccountForTotals[],
  transactions: readonly TransactionForTotals[],
  dates: readonly string[],
  rates: RateMap = {},
): { points: LiquidityPoint[]; missing: string[] } {
  const missing = new Set<string>();
  const points = dates.map((date) => {
    const total = liquidityBase(accounts, transactions, date, rates);
    for (const currency of total.missing) missing.add(currency);
    return { date, balanceMinor: total.totalMinor };
  });
  return { points, missing: [...missing].sort() };
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
