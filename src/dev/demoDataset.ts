import type { Dataset } from '../data/repository';
import type {
  Account,
  Asset,
  InvestmentTransaction,
  PricePoint,
  Transaction,
} from '../data/schema';
import { addDaysIso, todayIso } from '../domain/dates';
import { buildDefaultCategories } from '../domain/defaultCategories';
import { buildDefaultRules } from '../domain/defaultRules';

/**
 * Dati INVENTATI, solo per provare la grafica in una build di prova (VITE_DEMO=1). Non finiscono
 * nella versione pubblicata e non somigliano a dati reali. Generatore deterministico.
 */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemoDataset(now: Date = new Date()): Dataset {
  const rand = rng(7);
  const today = todayIso(now);
  const stamp = now.toISOString();
  let n = 0;
  const id = () => `demo-${++n}`;
  const base = { created_at: stamp, updated_at: stamp, deleted: false };

  const startDate = addDaysIso(today, -240);
  const account = (
    name: string,
    institution: string,
    type: Account['type'],
    opening: number,
  ): Account => ({
    id: id(),
    ...base,
    name,
    institution,
    type,
    currency: 'EUR',
    opening_balance_minor: opening,
    opening_date: startDate,
    is_archived: false,
  });
  const revolut = account('Revolut', 'Revolut', 'checking', 120000);
  const fineco = account('Fineco', 'Fineco', 'checking', 450000);
  const trade = account('Trade Republic', 'Trade Republic', 'savings', 300000);

  const categories = buildDefaultCategories(now, id);
  const cat = (name: string, kind: 'expense' | 'income' | 'transfer') =>
    categories.find((c) => c.name === name && c.kind === kind)?.id ?? null;

  const transactions: Transaction[] = [];
  const add = (
    acc: Account,
    date: string,
    amount: number,
    description: string,
    category: string | null,
    transferGroup: string | null = null,
  ) => {
    transactions.push({
      id: id(),
      ...base,
      account_id: acc.id,
      date,
      description,
      raw_description: description.toUpperCase(),
      amount_minor: amount,
      currency: 'EUR',
      fx_rate: '1',
      amount_base_minor: amount,
      category_id: category,
      transfer_group_id: transferGroup,
      recurring_rule_id: null,
      import_batch_id: null,
      dedupe_hash: null,
      notes: '',
    });
  };

  const shops: [string, string, number, number][] = [
    ['Esselunga', 'Alimentari', 1800, 8500],
    ['Conad', 'Alimentari', 900, 4200],
    ['Pizzeria Da Mario', 'Ristoranti', 1800, 4200],
    ['Trenitalia', 'Trasporti', 1500, 6800],
    ['Farmacia Centrale', 'Salute', 600, 3200],
    ['Amazon', 'Shopping', 1200, 9500],
    ['Zara', 'Abbigliamento', 2500, 7900],
    ['Cinema Odeon', 'Svago', 900, 2400],
    ['Alipay', 'Shopping', 500, 2500],
    ['Bar Centrale', 'Ristoranti', 150, 900],
  ];

  for (let d = -240; d <= 0; d++) {
    const date = addDaysIso(today, d);
    const day = Number(date.slice(8));
    if (day === 27) add(fineco, date, 195000, 'Stipendio', cat('Stipendio', 'income'));
    if (day === 1) add(fineco, date, -62000, 'Affitto', cat('Casa', 'expense'));
    if (day === 5) add(fineco, date, -9500, 'Enel Energia', cat('Casa', 'expense'));
    if (day === 8) add(revolut, date, -1299, 'Netflix', cat('Abbonamenti', 'expense'));
    if (day === 9) add(revolut, date, -1099, 'Spotify', cat('Abbonamenti', 'expense'));
    if (day === 28) {
      // Versamento verso il deposito: giroconto a un lato per conto
      const group = id();
      add(
        fineco,
        date,
        -40000,
        'Bonifico a Trade Republic',
        cat('Trasferimento', 'transfer'),
        group,
      );
      add(trade, date, 40000, 'Versamento da Fineco', cat('Trasferimento', 'transfer'), group);
    }
    if (day === 1) add(trade, date, 2113, 'Interessi', cat('Interessi e dividendi', 'income'));
    if (rand() < 0.55) {
      const shop = shops[Math.floor(rand() * shops.length)];
      if (shop) {
        const [name, category, min, max] = shop;
        const amount = -Math.round(min + rand() * (max - min));
        // Qualche movimento resta "da categorizzare", come nell'uso reale
        add(
          rand() < 0.5 ? revolut : fineco,
          date,
          amount,
          name,
          rand() < 0.12 ? null : cat(category, 'expense'),
        );
      }
    }
  }

  // Un ETF con piano di accumulo mensile e un paio di azioni
  const asset = (name: string, isin: string, cls: Asset['asset_class']): Asset => ({
    id: id(),
    ...base,
    name,
    symbol: '',
    isin,
    asset_class: cls,
    currency: 'EUR',
    price_source: 'manual',
  });
  const world = asset('Core MSCI World (Acc)', 'IE000BI8OT95', 'etf');
  const bonds = asset('Obbligazioni Euro Gov', 'IE00B3FH7618', 'bond');
  const crypto = asset('Bitcoin', '', 'crypto');
  const assets = [world, bonds, crypto];

  const operations: InvestmentTransaction[] = [];
  const prices: PricePoint[] = [];
  const buy = (a: Asset, date: string, quantity: string, unit: string, total: number) => {
    operations.push({
      id: id(),
      ...base,
      account_id: trade.id,
      asset_id: a.id,
      type: 'buy',
      date,
      quantity,
      unit_price: unit,
      fees_minor: 0,
      currency: 'EUR',
      fx_rate: '1',
      amount_base_minor: total,
    });
  };
  for (let m = 8; m >= 1; m--) {
    const date = addDaysIso(today, -m * 30);
    const price = 150 + (8 - m) * 3 + rand() * 4;
    buy(world, date, (150 / price).toFixed(6), price.toFixed(3), 15000);
    prices.push({
      id: id(),
      ...base,
      asset_id: world.id,
      date,
      price: price.toFixed(3),
      currency: 'EUR',
      source: 'manual',
    });
  }
  buy(bonds, addDaysIso(today, -150), '20', '98.5', 197000);
  buy(crypto, addDaysIso(today, -120), '0.05', '52000', 260000);
  prices.push(
    {
      id: id(),
      ...base,
      asset_id: world.id,
      date: today,
      price: '176.4',
      currency: 'EUR',
      source: 'manual',
    },
    {
      id: id(),
      ...base,
      asset_id: bonds.id,
      date: today,
      price: '99.2',
      currency: 'EUR',
      source: 'manual',
    },
    {
      id: id(),
      ...base,
      asset_id: crypto.id,
      date: today,
      price: '61000',
      currency: 'EUR',
      source: 'manual',
    },
  );

  return {
    accounts: [revolut, fineco, trade],
    categories,
    transactions,
    fxRates: [],
    assets,
    investmentTransactions: operations,
    priceHistory: prices,
    importBatches: [],
    categorizationRules: buildDefaultRules(categories, now, id),
    meta: { defaults_seeded: '1', default_rules_seeded: '1', default_transfer_rules_seeded: '1' },
  };
}
