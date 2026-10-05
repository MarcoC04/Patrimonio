import type { Account, Category, Transaction } from '../data/schema';
import { todayIso } from './dates';
import { toBaseMinor } from './fx';
import { investmentsValue, type Portfolio } from './investments';
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
export function balanceBaseAt(
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

type CategorizedTransaction = Pick<
  Transaction,
  'date' | 'amount_base_minor' | 'category_id' | 'transfer_group_id'
>;

/**
 * Totali per categoria in un intervallo di date (estremi inclusi), dal più alto al più basso.
 * `direction`: 'expense' somma le uscite, 'income' le entrate; l'altra direzione e i giroconti
 * sono esclusi. Usa lo snapshot in EUR; gli importi tornano sempre positivi.
 */
function totalsByCategory(
  transactions: readonly CategorizedTransaction[],
  categories: readonly Pick<Category, 'id' | 'parent_id'>[],
  range: { from: string; to: string },
  direction: 'expense' | 'income',
): CategorySpend[] {
  const parentOf = new Map(categories.map((c) => [c.id, c.parent_id] as const));
  const totals = new Map<string | null, number[]>();

  for (const t of transactions) {
    if (isTransfer(t)) continue;
    const isExpense = t.amount_base_minor < 0;
    const isIncome = t.amount_base_minor > 0;
    if (direction === 'expense' ? !isExpense : !isIncome) continue;
    if (t.date < range.from || t.date > range.to) continue;
    const own = t.category_id;
    // Una categoria sconosciuta (cancellata) conta come da categorizzare.
    const key = own !== null && parentOf.has(own) ? (parentOf.get(own) ?? own) : null;
    const list = totals.get(key) ?? [];
    list.push(Math.abs(t.amount_base_minor));
    totals.set(key, list);
  }

  return [...totals.entries()]
    .map(([categoryId, amounts]) => ({ categoryId, amountMinor: sumMinor(amounts) }))
    .sort(
      (a, b) =>
        b.amountMinor - a.amountMinor || String(a.categoryId).localeCompare(String(b.categoryId)),
    );
}

/** Spese per categoria (sottocategorie sommate nella madre); entrate e giroconti esclusi. */
export function spendByCategory(
  transactions: readonly CategorizedTransaction[],
  categories: readonly Pick<Category, 'id' | 'parent_id'>[],
  range: { from: string; to: string },
): CategorySpend[] {
  return totalsByCategory(transactions, categories, range, 'expense');
}

/** Entrate per categoria (sottocategorie sommate nella madre); spese e giroconti esclusi. */
export function incomeByCategory(
  transactions: readonly CategorizedTransaction[],
  categories: readonly Pick<Category, 'id' | 'parent_id'>[],
  range: { from: string; to: string },
): CategorySpend[] {
  return totalsByCategory(transactions, categories, range, 'income');
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

// ---- Vista annuale (selettore dell'anno) ----

/** Primo e ultimo giorno dell'anno. */
export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/**
 * Anni selezionabili, in ordine crescente: quelli con movimenti o con un conto aperto, più
 * l'anno in corso (che compare sempre, anche senza dati).
 */
export function availableYears(
  transactions: readonly Pick<Transaction, 'date'>[],
  accounts: readonly Pick<Account, 'opening_date'>[],
  now: Date = new Date(),
): number[] {
  const years = new Set<number>([now.getFullYear()]);
  for (const t of transactions) years.add(Number(t.date.slice(0, 4)));
  for (const a of accounts) years.add(Number(a.opening_date.slice(0, 4)));
  return [...years].filter((y) => Number.isInteger(y)).sort((a, b) => a - b);
}

type FlowTransaction = Pick<Transaction, 'date' | 'amount_base_minor' | 'transfer_group_id'>;

export interface YearSummary {
  incomeMinor: number;
  expenseMinor: number;
  /** Entrate − spese dell'anno (può essere negativo). */
  savingsMinor: number;
}

/** Entrate, spese e risparmio dell'anno, in EUR e con i giroconti esclusi. */
export function yearSummary(transactions: readonly FlowTransaction[], year: number): YearSummary {
  const { from, to } = yearRange(year);
  const months = monthlyFlow(
    transactions.filter((t) => t.date >= from && t.date <= to),
    year,
  );
  const incomeMinor = sumMinor(months.map((m) => m.incomeMinor));
  const expenseMinor = sumMinor(months.map((m) => m.expenseMinor));
  return { incomeMinor, expenseMinor, savingsMinor: incomeMinor - expenseMinor };
}

export interface MonthlyFlow {
  month: YearMonth;
  incomeMinor: number;
  /** Spese come valore positivo. */
  expenseMinor: number;
  /** Flusso di cassa del mese: entrate − spese. */
  netMinor: number;
}

/** I 12 mesi dell'anno con entrate, spese e flusso di cassa (giroconti esclusi, valori in EUR). */
export function monthlyFlow(transactions: readonly FlowTransaction[], year: number): MonthlyFlow[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const inMonth = transactions.filter((t) => !isTransfer(t) && t.date.startsWith(month));
    const incomeMinor = sumMinor(
      inMonth.filter((t) => t.amount_base_minor > 0).map((t) => t.amount_base_minor),
    );
    const expenseMinor = sumMinor(
      inMonth.filter((t) => t.amount_base_minor < 0).map((t) => -t.amount_base_minor),
    );
    return { month, incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor };
  });
}

/**
 * Le date da mostrare per un anno: fine di ogni mese, ma mai oltre oggi (il mese in corso termina
 * oggi, i mesi futuri non ci sono). Un anno futuro non ha date.
 */
export function yearEndDates(year: number, now: Date = new Date()): string[] {
  const today = todayIso(now);
  const dates: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, '0')}`;
    if (`${month}-01` > today) break; // mese non ancora iniziato
    const end = monthBounds(month).to;
    dates.push(end > today ? today : end);
  }
  return dates;
}

const EMPTY_PORTFOLIO: Portfolio = { assets: [], operations: [], prices: [] };

export interface Wealth {
  /** Saldi dei conti, in centesimi EUR. */
  accountsMinor: number;
  /** Valore degli investimenti (quantità × ultimo prezzo noto), in centesimi EUR. */
  investmentsMinor: number;
  /** Patrimonio totale = conti + investimenti. */
  totalMinor: number;
  /** Valute senza cambio (conti o asset): escluse dal totale. */
  missing: string[];
  /** Id degli asset posseduti senza alcun prezzo noto: esclusi dal totale. */
  unpriced: string[];
}

/**
 * Patrimonio alla data: saldi dei conti + valore degli investimenti, in EUR. Ciò che non si può
 * valutare (cambio o prezzo mancante) non si inventa: è escluso e segnalato.
 */
export function wealthAt(
  accounts: readonly AccountForTotals[],
  transactions: readonly TransactionForTotals[],
  portfolio: Portfolio,
  isoDate: string,
  rates: RateMap = {},
): Wealth {
  const fromAccounts = netWorthBase(accounts, transactions, isoDate, rates);
  const fromInvestments = investmentsValue(portfolio, isoDate, rates);
  return {
    accountsMinor: fromAccounts.totalMinor,
    investmentsMinor: fromInvestments.totalMinor,
    totalMinor: fromAccounts.totalMinor + fromInvestments.totalMinor,
    missing: [...new Set([...fromAccounts.missing, ...fromInvestments.missing])].sort(),
    unpriced: fromInvestments.unpriced,
  };
}

/**
 * Patrimonio totale (conti + investimenti) a fine mese per l'anno scelto, in EUR. Tutti i punti
 * usano gli stessi tassi; gli investimenti sono valutati con l'ultimo prezzo noto a ciascuna data.
 */
export function netWorthYearSeries(
  accounts: readonly AccountForTotals[],
  transactions: readonly TransactionForTotals[],
  year: number,
  rates: RateMap = {},
  now: Date = new Date(),
  portfolio: Portfolio = EMPTY_PORTFOLIO,
): { points: LiquidityPoint[]; missing: string[]; unpriced: string[] } {
  const missing = new Set<string>();
  const unpriced = new Set<string>();
  const points = yearEndDates(year, now).map((date) => {
    const wealth = wealthAt(accounts, transactions, portfolio, date, rates);
    for (const currency of wealth.missing) missing.add(currency);
    for (const id of wealth.unpriced) unpriced.add(id);
    return { date, balanceMinor: wealth.totalMinor };
  });
  return { points, missing: [...missing].sort(), unpriced: [...unpriced].sort() };
}

export type WealthKind = Account['type'] | 'investments';

export interface WealthShare {
  kind: WealthKind;
  /** Importo in centesimi EUR (sempre positivo). */
  amountMinor: number;
}

/**
 * Divisione del patrimonio per la torta: un pezzo per ogni tipo di conto con saldo positivo
 * (corrente, deposito, contanti, liquidità del conto di investimento) più "investimenti" (il valore
 * degli asset). Dal più grande al più piccolo; i conti in rosso non sono attività e non compaiono.
 */
export function wealthByKind(
  accounts: readonly AccountForTotals[],
  transactions: readonly TransactionForTotals[],
  portfolio: Portfolio,
  isoDate: string,
  rates: RateMap = {},
): {
  items: WealthShare[];
  totalMinor: number;
  accountsMinor: number;
  investmentsMinor: number;
  missing: string[];
  unpriced: string[];
} {
  const byAccount = assetsByAccountType(accounts, transactions, isoDate, rates);
  const invested = investmentsValue(portfolio, isoDate, rates);
  const items: WealthShare[] = byAccount.items.map((i) => ({
    kind: i.type,
    amountMinor: i.amountMinor,
  }));
  if (invested.totalMinor > 0)
    items.push({ kind: 'investments', amountMinor: invested.totalMinor });
  items.sort((a, b) => b.amountMinor - a.amountMinor || a.kind.localeCompare(b.kind));
  return {
    items,
    totalMinor: sumMinor(items.map((i) => i.amountMinor)),
    accountsMinor: byAccount.totalMinor,
    investmentsMinor: invested.totalMinor,
    missing: [...new Set([...byAccount.missing, ...invested.missing])].sort(),
    unpriced: invested.unpriced,
  };
}

export interface AssetShare {
  type: Account['type'];
  /** Saldo in centesimi EUR (sempre positivo). */
  amountMinor: number;
}

/**
 * Attività per tipo di conto alla data, in EUR, dal più alto al più basso. Si contano solo i saldi
 * positivi (un conto in rosso non è un'attività) e si omettono i tipi senza saldo.
 */
export function assetsByAccountType(
  accounts: readonly AccountForTotals[],
  transactions: readonly TransactionForTotals[],
  isoDate: string,
  rates: RateMap = {},
): { items: AssetShare[]; totalMinor: number; missing: string[] } {
  const byType = new Map<Account['type'], number[]>();
  const missing = new Set<string>();
  for (const account of accounts) {
    const value = balanceBaseAt(account, transactions, isoDate, rates);
    if (value === null) {
      missing.add(account.currency);
      continue;
    }
    if (value <= 0) continue;
    const list = byType.get(account.type) ?? [];
    list.push(value);
    byType.set(account.type, list);
  }
  const items = [...byType.entries()]
    .map(([type, amounts]) => ({ type, amountMinor: sumMinor(amounts) }))
    .sort((a, b) => b.amountMinor - a.amountMinor || a.type.localeCompare(b.type));
  return {
    items,
    totalMinor: sumMinor(items.map((i) => i.amountMinor)),
    missing: [...missing].sort(),
  };
}
