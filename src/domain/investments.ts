import { ASSET_CLASSES } from '../data/schema';
import type { Account, Asset, InvestmentTransaction, PricePoint } from '../data/schema';
import { isSupportedCurrency } from './currencies';
import {
  compareDecimals,
  isPositiveDecimal,
  multiplyToMinor,
  parseDecimal,
  subtractDecimals,
  sumDecimals,
} from './decimal';
import { isIsoDate } from './dates';
import { toBaseMinor } from './fx';
import { BASE_CURRENCY, minorExponentOr, parseMoney, sumMinor } from './money';
import { fail, type Result } from './result';
import { uuidv7 } from './uuid7';

/**
 * Investimenti: posizioni, valore e rendimento. Quantità e prezzi sono stringhe decimali esatte;
 * i valori in denaro sono interi (centesimi). Per ora le operazioni gestite sono acquisto e
 * vendita; gli altri tipi previsti dallo schema (dividendi, commissioni, split…) arriveranno dopo.
 */

export interface Portfolio {
  assets: readonly Asset[];
  operations: readonly InvestmentTransaction[];
  prices: readonly PricePoint[];
}

type Rates = Readonly<Record<string, string>>;
type Trade = Pick<
  InvestmentTransaction,
  'asset_id' | 'type' | 'date' | 'quantity' | 'unit_price' | 'created_at'
>;

// ---------------------------------------------------------------------------------------------
// Quantità e prezzi
// ---------------------------------------------------------------------------------------------

/** Acquisti prima delle vendite nello stesso giorno, poi per ordine di inserimento. */
function chronological<T extends Pick<Trade, 'date' | 'type' | 'created_at'>>(
  ops: readonly T[],
): T[] {
  const order = (type: string) => (type === 'buy' ? 0 : 1);
  return [...ops].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      order(a.type) - order(b.type) ||
      a.created_at.localeCompare(b.created_at),
  );
}

/** Quantità posseduta a una data (inclusa): acquisti − vendite. Esatta, come stringa decimale. */
export function quantityAt(
  assetId: string,
  operations: readonly Pick<Trade, 'asset_id' | 'type' | 'date' | 'quantity'>[],
  isoDate: string,
): string {
  const own = operations.filter((o) => o.asset_id === assetId && o.date <= isoDate);
  const bought = sumDecimals(own.filter((o) => o.type === 'buy').map((o) => o.quantity));
  const sold = sumDecimals(own.filter((o) => o.type === 'sell').map((o) => o.quantity));
  return subtractDecimals(bought, sold);
}

/** True se, in ogni momento, non si vende più di quanto si possiede. */
export function holdingsNeverNegative(operations: readonly Trade[]): boolean {
  let quantity = '0';
  for (const op of chronological(operations)) {
    if (op.type === 'buy') quantity = sumDecimals([quantity, op.quantity]);
    else if (op.type === 'sell') quantity = subtractDecimals(quantity, op.quantity);
    if (compareDecimals(quantity, '0') < 0) return false;
  }
  return true;
}

export interface KnownPrice {
  price: string;
  date: string;
}

/**
 * Ultimo prezzo noto di un asset a una data (inclusa): il più recente tra i prezzi inseriti e i
 * prezzi delle operazioni (a quella data il mercato valeva almeno quanto si è pagato/incassato).
 * A parità di data prevale il prezzo inserito a mano. Senza nessun dato: null.
 */
export function priceAt(
  assetId: string,
  prices: readonly Pick<PricePoint, 'asset_id' | 'date' | 'price' | 'created_at'>[],
  operations: readonly Pick<Trade, 'asset_id' | 'date' | 'unit_price' | 'type'>[],
  isoDate: string,
): KnownPrice | null {
  type Candidate = KnownPrice & { rank: number; created: string };
  const candidates: Candidate[] = [
    ...prices
      .filter((p) => p.asset_id === assetId && p.date <= isoDate)
      .map((p) => ({ price: p.price, date: p.date, rank: 1, created: p.created_at })),
    ...operations
      .filter(
        (o) =>
          o.asset_id === assetId &&
          (o.type === 'buy' || o.type === 'sell') &&
          o.date <= isoDate &&
          isPositiveDecimal(o.unit_price),
      )
      .map((o) => ({ price: o.unit_price, date: o.date, rank: 0, created: '' })),
  ];
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) => b.date.localeCompare(a.date) || b.rank - a.rank || b.created.localeCompare(a.created),
  );
  const best = candidates[0];
  return best ? { price: best.price, date: best.date } : null;
}

// ---------------------------------------------------------------------------------------------
// Valore delle posizioni
// ---------------------------------------------------------------------------------------------

export type PositionStatus = 'ok' | 'no_price' | 'no_rate';

export interface PositionValue {
  quantity: string;
  price: KnownPrice | null;
  /** Valore in centesimi EUR, o null se manca il prezzo o il cambio. */
  valueMinor: number | null;
  status: PositionStatus;
}

/** Valore di una posizione a una data, in EUR. Una posizione chiusa (quantità 0) vale 0. */
export function positionValue(
  asset: Asset,
  portfolio: Pick<Portfolio, 'operations' | 'prices'>,
  isoDate: string,
  rates: Rates,
): PositionValue {
  const quantity = quantityAt(asset.id, portfolio.operations, isoDate);
  const price = priceAt(asset.id, portfolio.prices, portfolio.operations, isoDate);
  if (compareDecimals(quantity, '0') <= 0) return { quantity, price, valueMinor: 0, status: 'ok' };
  if (!price) return { quantity, price: null, valueMinor: null, status: 'no_price' };

  const exponent = minorExponentOr(asset.currency);
  const inAssetCurrency = multiplyToMinor(quantity, price.price, exponent);
  if (asset.currency === BASE_CURRENCY) {
    return { quantity, price, valueMinor: inAssetCurrency, status: 'ok' };
  }
  const rate = rates[asset.currency];
  if (rate === undefined) return { quantity, price, valueMinor: null, status: 'no_rate' };
  return {
    quantity,
    price,
    valueMinor: toBaseMinor(inAssetCurrency, rate, exponent),
    status: 'ok',
  };
}

export interface InvestmentsTotal {
  /** Valore complessivo in centesimi EUR (solo le posizioni valutabili). */
  totalMinor: number;
  /** Valute con posizioni aperte ma senza cambio: escluse dal totale. */
  missing: string[];
  /** Id degli asset posseduti per cui non si conosce nessun prezzo: esclusi dal totale. */
  unpriced: string[];
}

/** Valore di tutti gli investimenti a una data, in EUR. Ciò che non si può valutare non si inventa. */
export function investmentsValue(
  portfolio: Portfolio,
  isoDate: string,
  rates: Rates,
): InvestmentsTotal {
  const parts: number[] = [];
  const missing = new Set<string>();
  const unpriced: string[] = [];
  for (const asset of portfolio.assets) {
    const position = positionValue(asset, portfolio, isoDate, rates);
    if (position.status === 'no_price') unpriced.push(asset.id);
    else if (position.status === 'no_rate') missing.add(asset.currency);
    else parts.push(position.valueMinor ?? 0);
  }
  return { totalMinor: sumMinor(parts), missing: [...missing].sort(), unpriced };
}

export interface PositionSummary extends PositionValue {
  asset: Asset;
  /** Totale pagato per gli acquisti (commissioni comprese), in centesimi EUR. */
  investedMinor: number;
  /** Totale incassato dalle vendite (al netto delle commissioni), in centesimi EUR. */
  proceedsMinor: number;
  /** Guadagno o perdita: valore attuale + incassi − pagato. Null se il valore non è noto. */
  gainMinor: number | null;
  /** Rendimento in decimi di punto percentuale (188 = 18,8 %). Null se non si è investito nulla. */
  roiTenthsPercent: number | null;
}

/**
 * Rendimento semplice secondo ARCHITECTURE.md §7.6:
 * ROI = (valore attuale + incassi − pagato) / pagato. Tutto in EUR, con gli importi salvati al
 * cambio del giorno di ogni operazione.
 */
export function positionSummary(
  asset: Asset,
  portfolio: Pick<Portfolio, 'operations' | 'prices'>,
  isoDate: string,
  rates: Rates,
): PositionSummary {
  const value = positionValue(asset, portfolio, isoDate, rates);
  const own = portfolio.operations.filter((o) => o.asset_id === asset.id && o.date <= isoDate);
  const investedMinor = sumMinor(
    own.filter((o) => o.type === 'buy').map((o) => o.amount_base_minor),
  );
  const proceedsMinor = sumMinor(
    own.filter((o) => o.type === 'sell').map((o) => o.amount_base_minor),
  );
  const gainMinor =
    value.valueMinor === null ? null : value.valueMinor + proceedsMinor - investedMinor;
  const roiTenthsPercent =
    gainMinor === null || investedMinor <= 0
      ? null
      : Math.round((gainMinor * 1000) / investedMinor);
  return { asset, ...value, investedMinor, proceedsMinor, gainMinor, roiTenthsPercent };
}

/** Rendimento complessivo di più posizioni (stessa formula, sommando pagato, incassi e valore). */
export function portfolioSummary(summaries: readonly PositionSummary[]): {
  valueMinor: number;
  investedMinor: number;
  proceedsMinor: number;
  gainMinor: number;
  roiTenthsPercent: number | null;
} {
  const valued = summaries.filter((s) => s.valueMinor !== null);
  const valueMinor = sumMinor(valued.map((s) => s.valueMinor ?? 0));
  const investedMinor = sumMinor(valued.map((s) => s.investedMinor));
  const proceedsMinor = sumMinor(valued.map((s) => s.proceedsMinor));
  const gainMinor = valueMinor + proceedsMinor - investedMinor;
  return {
    valueMinor,
    investedMinor,
    proceedsMinor,
    gainMinor,
    roiTenthsPercent: investedMinor > 0 ? Math.round((gainMinor * 1000) / investedMinor) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Inserimento e validazione
// ---------------------------------------------------------------------------------------------

type IdFactory = () => string;

function withDefaults(now: Date, newId: IdFactory | undefined) {
  const timestamp = now.toISOString();
  return {
    id: (newId ?? (() => uuidv7(now.getTime())))(),
    created_at: timestamp,
    updated_at: timestamp,
    deleted: false,
  };
}

export type AssetIssue = 'name' | 'name_taken' | 'currency' | 'isin' | 'asset_class';

export interface AssetInput {
  name: string;
  symbol: string;
  isin: string;
  assetClass: string;
  currency: string;
}

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** `existing`: asset attivi, per controllare che il nome non sia già usato. */
export function createAsset(
  input: AssetInput,
  existing: readonly Pick<Asset, 'name'>[],
  now: Date = new Date(),
  newId?: IdFactory,
): Result<Asset, AssetIssue> {
  const issues: AssetIssue[] = [];
  const name = input.name.trim();
  if (name === '') issues.push('name');
  else if (existing.some((a) => a.name.trim().toLowerCase() === name.toLowerCase())) {
    issues.push('name_taken');
  }
  if (!isSupportedCurrency(input.currency)) issues.push('currency');
  const isin = input.isin.trim().toUpperCase();
  if (isin !== '' && !ISIN.test(isin)) issues.push('isin');
  const assetClass = (ASSET_CLASSES as readonly string[]).find((c) => c === input.assetClass);
  if (!assetClass) issues.push('asset_class');
  if (issues.length > 0 || !assetClass) return fail(issues);

  return {
    ok: true,
    value: {
      ...withDefaults(now, newId),
      name,
      symbol: input.symbol.trim().toUpperCase(),
      isin,
      asset_class: assetClass as Asset['asset_class'],
      currency: input.currency,
      price_source: 'manual',
    },
  };
}

export type TradeIssue =
  | 'asset'
  | 'type'
  | 'date'
  | 'quantity'
  | 'unit_price'
  | 'fees'
  | 'fx_rate'
  | 'account'
  | 'insufficient';

export interface TradeInput {
  assetId: string;
  type: 'buy' | 'sell';
  date: string;
  /** Quantità scritta dall'utente ("0,5"); positiva. */
  quantityText: string;
  /** Prezzo di una unità nella valuta dell'asset. */
  unitPriceText: string;
  /** Commissioni nella valuta dell'asset; vuoto = 0. */
  feesText: string;
  /** Conto di investimento in cui è detenuto l'asset (facoltativo). */
  accountId: string | null;
  /** Tasso "1 EUR = fxRate unità della valuta dell'asset" alla data. Obbligatorio per asset non in EUR. */
  fxRate?: string | undefined;
}

export interface TradeContext {
  assets: readonly Asset[];
  operations: readonly InvestmentTransaction[];
  accounts: readonly Pick<Account, 'id'>[];
}

const ISSUE_ORDER: readonly TradeIssue[] = [
  'asset',
  'type',
  'date',
  'quantity',
  'unit_price',
  'fees',
  'fx_rate',
  'account',
  'insufficient',
];

function failTrade(issues: TradeIssue[]) {
  return fail([...issues].sort((a, b) => ISSUE_ORDER.indexOf(a) - ISSUE_ORDER.indexOf(b)));
}

/**
 * Acquisto o vendita. Il controvalore in EUR (`amount_base_minor`, sempre positivo) è:
 * acquisto = quantità × prezzo + commissioni; vendita = quantità × prezzo − commissioni.
 * Non si può vendere più di quanto si possiede (in nessun momento).
 */
export function createTrade(
  input: TradeInput,
  ctx: TradeContext,
  now: Date = new Date(),
  newId?: IdFactory,
): Result<InvestmentTransaction, TradeIssue> {
  const issues: TradeIssue[] = [];
  const asset = ctx.assets.find((a) => a.id === input.assetId);
  if (!asset) issues.push('asset');
  if (input.type !== 'buy' && input.type !== 'sell') issues.push('type');
  if (!isIsoDate(input.date)) issues.push('date');

  const quantity = parseDecimal(input.quantityText);
  if (quantity === null || !isPositiveDecimal(quantity)) issues.push('quantity');
  const unitPrice = parseDecimal(input.unitPriceText);
  if (unitPrice === null || !isPositiveDecimal(unitPrice)) issues.push('unit_price');

  const exponent = asset ? minorExponentOr(asset.currency) : 2;
  const feesText = input.feesText.trim();
  const fees = feesText === '' ? 0 : parseMoney(feesText, exponent);
  if (fees === null || fees < 0) issues.push('fees');

  if (input.accountId !== null && !ctx.accounts.some((a) => a.id === input.accountId)) {
    issues.push('account');
  }

  let rate = '1';
  if (asset && asset.currency !== BASE_CURRENCY) {
    if (input.fxRate !== undefined && isPositiveDecimal(input.fxRate)) rate = input.fxRate;
    else issues.push('fx_rate');
  }

  if (
    issues.length > 0 ||
    !asset ||
    quantity === null ||
    unitPrice === null ||
    fees === null ||
    (input.type !== 'buy' && input.type !== 'sell')
  ) {
    return failTrade(issues);
  }

  const gross = multiplyToMinor(quantity, unitPrice, exponent);
  const total = input.type === 'buy' ? gross + fees : Math.max(gross - fees, 0);
  const trade: InvestmentTransaction = {
    ...withDefaults(now, newId),
    account_id: input.accountId,
    asset_id: asset.id,
    type: input.type,
    date: input.date,
    quantity,
    unit_price: unitPrice,
    fees_minor: fees,
    currency: asset.currency,
    fx_rate: rate,
    amount_base_minor: toBaseMinor(total, rate, exponent),
  };

  if (input.type === 'sell') {
    const own = ctx.operations.filter((o) => o.asset_id === asset.id);
    if (!holdingsNeverNegative([...own, trade])) return failTrade(['insufficient']);
  }
  return { ok: true, value: trade };
}

export type PriceIssue = 'asset' | 'date' | 'price';

export interface PriceInput {
  assetId: string;
  date: string;
  priceText: string;
}

/**
 * Prezzo attuale (o di una data) di un asset. Se per quel giorno c'è già un prezzo lo si
 * **sostituisce** invece di duplicarlo (`isUpdate`).
 */
export function createPrice(
  input: PriceInput,
  assets: readonly Asset[],
  existing: readonly PricePoint[],
  now: Date = new Date(),
  newId?: IdFactory,
): Result<{ point: PricePoint; isUpdate: boolean }, PriceIssue> {
  const issues: PriceIssue[] = [];
  const asset = assets.find((a) => a.id === input.assetId);
  if (!asset) issues.push('asset');
  if (!isIsoDate(input.date)) issues.push('date');
  const price = parseDecimal(input.priceText);
  if (price === null || !isPositiveDecimal(price)) issues.push('price');
  if (issues.length > 0 || !asset || price === null) return fail(issues);

  const same = existing.find((p) => p.asset_id === asset.id && p.date === input.date);
  if (same) {
    return {
      ok: true,
      value: {
        isUpdate: true,
        point: { ...same, price, currency: asset.currency, updated_at: now.toISOString() },
      },
    };
  }
  return {
    ok: true,
    value: {
      isUpdate: false,
      point: {
        ...withDefaults(now, newId),
        asset_id: asset.id,
        date: input.date,
        price,
        currency: asset.currency,
        source: 'manual',
      },
    },
  };
}

export type HoldingIssue = AssetIssue | TradeIssue | 'current_price';

export interface HoldingInput {
  asset: AssetInput;
  /** Quantità posseduta e prezzo pagato per unità, alla data dell'acquisto. */
  quantityText: string;
  purchasePriceText: string;
  feesText: string;
  purchaseDate: string;
  accountId: string | null;
  fxRate?: string | undefined;
  /** Prezzo attuale per unità (facoltativo: se vuoto vale l'ultimo prezzo noto, cioè quello pagato). */
  currentPriceText: string;
  /** Data del prezzo attuale (di solito oggi). */
  currentPriceDate: string;
}

/**
 * Nuovo asset già posseduto: crea l'asset, l'acquisto iniziale (quantità e prezzo pagato) e, se
 * indicato, il prezzo attuale. Si salvano insieme in un solo passaggio.
 */
export function createHolding(
  input: HoldingInput,
  ctx: TradeContext,
  now: Date = new Date(),
  newId?: IdFactory,
): Result<{ asset: Asset; trade: InvestmentTransaction; price: PricePoint | null }, HoldingIssue> {
  const issues: HoldingIssue[] = [];

  const asset = createAsset(input.asset, ctx.assets, now, newId);
  if (!asset.ok) issues.push(...asset.issues);

  // Con l'asset ancora da creare si usa un segnaposto: serve solo per le regole dell'acquisto.
  const placeholder: Asset = asset.ok
    ? asset.value
    : {
        ...withDefaults(now, () => 'nuovo-asset'),
        name: input.asset.name,
        symbol: '',
        isin: '',
        asset_class: 'other',
        currency: isSupportedCurrency(input.asset.currency) ? input.asset.currency : BASE_CURRENCY,
        price_source: 'manual',
      };

  const trade = createTrade(
    {
      assetId: placeholder.id,
      type: 'buy',
      date: input.purchaseDate,
      quantityText: input.quantityText,
      unitPriceText: input.purchasePriceText,
      feesText: input.feesText,
      accountId: input.accountId,
      fxRate: input.fxRate,
    },
    { ...ctx, assets: [...ctx.assets, placeholder] },
    now,
    newId,
  );
  if (!trade.ok) issues.push(...trade.issues.filter((i) => i !== 'asset'));

  let price: PricePoint | null = null;
  if (input.currentPriceText.trim() !== '') {
    const point = createPrice(
      { assetId: placeholder.id, date: input.currentPriceDate, priceText: input.currentPriceText },
      [placeholder],
      [],
      now,
      newId,
    );
    if (point.ok) price = point.value.point;
    else issues.push('current_price');
  }

  if (issues.length > 0 || !asset.ok || !trade.ok) return fail(issues);
  return { ok: true, value: { asset: asset.value, trade: trade.value, price } };
}

/** Si può eliminare un asset solo se non ha operazioni (altrimenti si cancellano prima quelle). */
export function canDeleteAsset(
  assetId: string,
  operations: readonly Pick<InvestmentTransaction, 'asset_id'>[],
): boolean {
  return !operations.some((o) => o.asset_id === assetId);
}

/** Eliminare un'operazione non deve lasciare quantità negative in nessun momento. */
export function canDeleteOperation(
  operationId: string,
  assetId: string,
  operations: readonly (Trade & Pick<InvestmentTransaction, 'id'>)[],
): boolean {
  const remaining = operations.filter((o) => o.asset_id === assetId && o.id !== operationId);
  return holdingsNeverNegative(remaining);
}
