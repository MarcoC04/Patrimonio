import { describe, expect, it } from 'vitest';
import { applyChanges } from '../data/dataset';
import { createFxService } from '../data/fxService';
import { softDelete, type ChangeSet, type Dataset } from '../data/repository';
import { ScriptClient } from '../data/scriptClient';
import { ScriptRepository } from '../data/scriptRepository';
import { createScript, TEST_SECRET } from '../data/testing/fakeAppsScript';
import { createAccount } from '../domain/accounts';
import { wealthAt, wealthByKind } from '../domain/dashboard';
import {
  canDeleteOperation,
  createHolding,
  createTrade,
  portfolioSummary,
  positionSummary,
  quantityAt,
  type HoldingInput,
  type Portfolio,
} from '../domain/investments';
import { loadAll } from './bootstrap';

/**
 * Percorso completo degli investimenti, senza rete: modulo → script → Repository → foglio →
 * rilettura → patrimonio. Dati sintetici. "Oggi" è il 20/03/2026.
 */

const NOW = new Date(2026, 2, 20, 12, 0, 0);
const TODAY = '2026-03-20';

async function setup() {
  const script = createScript();
  const client = new ScriptClient({
    url: 'https://script.google.com/macros/s/TEST/exec',
    getKey: () => TEST_SECRET,
    fetchFn: script.fetchFn,
    sleep: async () => {},
  });
  const repo = new ScriptRepository(client);
  let data: Dataset = await loadAll(client, repo, NOW);
  const save = async (changes: ChangeSet) => {
    await repo.save(changes);
    data = applyChanges(data, changes);
  };
  const fx = createFxService({
    fetchRates: (date, symbols) => repo.fetchRates(date, symbols),
    cache: () => data.fxRates,
    save,
    now: () => NOW,
  });

  // Un conto corrente con 1.000,00 €
  const account = createAccount(
    {
      name: 'Conto',
      institution: '',
      type: 'checking',
      currency: 'EUR',
      openingBalanceText: '1000,00',
      openingDate: '2026-01-01',
    },
    [],
    NOW,
    () => 'acc-1',
  );
  if (!account.ok) throw new Error('conto di prova non valido');
  await save({ accounts: { insert: [account.value] } });

  const portfolioOf = (d: Dataset): Portfolio => ({
    assets: d.assets,
    operations: d.investmentTransactions,
    prices: d.priceHistory,
  });
  const ctx = () => ({
    assets: data.assets,
    operations: data.investmentTransactions,
    accounts: data.accounts,
  });
  return { repo, save, fx, data: () => data, portfolioOf, ctx };
}

const etf = (overrides: Partial<HoldingInput> = {}): HoldingInput => ({
  asset: { name: 'ETF Mondo', symbol: 'swda', isin: '', assetClass: 'etf', currency: 'EUR' },
  quantityText: '10',
  purchasePriceText: '50,25',
  feesText: '2,00',
  purchaseDate: '2026-01-10',
  accountId: null,
  currentPriceText: '55',
  currentPriceDate: TODAY,
  ...overrides,
});

describe('investimenti: dal modulo al patrimonio', () => {
  it('asset, acquisto e prezzo si salvano insieme e si rileggono identici; il patrimonio li include', async () => {
    const { repo, save, portfolioOf, ctx } = await setup();

    const holding = createHolding(etf(), ctx(), NOW);
    if (!holding.ok) throw new Error('asset di prova non valido');
    const { asset, trade, price } = holding.value;
    await save({
      assets: { insert: [asset] },
      investmentTransactions: { insert: [trade] },
      ...(price ? { priceHistory: { insert: [price] } } : {}),
    });

    // Rilettura dal foglio: quantità e prezzi sono stringhe decimali esatte, le commissioni intere
    const reloaded = await repo.load();
    expect(reloaded.assets).toHaveLength(1);
    expect(reloaded.assets[0]).toMatchObject({
      name: 'ETF Mondo',
      symbol: 'SWDA',
      currency: 'EUR',
    });
    expect(reloaded.investmentTransactions[0]).toMatchObject({
      type: 'buy',
      quantity: '10',
      unit_price: '50.25',
      fees_minor: 200,
      amount_base_minor: 50450, // 10 × 50,25 = 502,50 € + 2,00 € di commissioni
    });
    expect(reloaded.priceHistory[0]).toMatchObject({ price: '55', date: TODAY });

    // Patrimonio = 1.000,00 € di conto + 10 × 55,00 € = 550,00 € → 1.550,00 €
    const portfolio = portfolioOf(reloaded);
    const wealth = wealthAt(reloaded.accounts, reloaded.transactions, portfolio, TODAY, {});
    expect(wealth).toMatchObject({
      accountsMinor: 100000,
      investmentsMinor: 55000,
      totalMinor: 155000,
    });

    // Torta: conto corrente 1.000 € + investimenti 550 €
    const split = wealthByKind(reloaded.accounts, reloaded.transactions, portfolio, TODAY, {});
    expect(split.items).toEqual([
      { kind: 'checking', amountMinor: 100000 },
      { kind: 'investments', amountMinor: 55000 },
    ]);

    // Rendimento: (550,00 − 504,50) / 504,50 = +9,0 %
    const summary = positionSummary(asset, portfolio, TODAY, {});
    expect(summary).toMatchObject({ gainMinor: 4550, roiTenthsPercent: 90 });
  });

  it('acquisti e vendite cambiano la quantità; non si vende più di quanto si possiede', async () => {
    const { save, data, ctx } = await setup();
    const holding = createHolding(etf(), ctx(), NOW);
    if (!holding.ok) throw new Error('asset di prova non valido');
    await save({
      assets: { insert: [holding.value.asset] },
      investmentTransactions: { insert: [holding.value.trade] },
    });
    const assetId = holding.value.asset.id;

    const buy = createTrade(
      {
        assetId,
        type: 'buy',
        date: '2026-02-01',
        quantityText: '5',
        unitPriceText: '60',
        feesText: '',
        accountId: null,
      },
      ctx(),
      NOW,
    );
    if (!buy.ok) throw new Error('acquisto di prova non valido');
    await save({ investmentTransactions: { insert: [buy.value] } });
    expect(quantityAt(assetId, data().investmentTransactions, TODAY)).toBe('15');

    // Vendere 20 quando se ne possiedono 15 non è possibile
    const tooMany = createTrade(
      {
        assetId,
        type: 'sell',
        date: TODAY,
        quantityText: '20',
        unitPriceText: '55',
        feesText: '',
        accountId: null,
      },
      ctx(),
      NOW,
    );
    expect(tooMany).toEqual({ ok: false, issues: ['insufficient'] });

    // Vendita valida di 4 a 70,00 € = 280,00 € incassati
    const sell = createTrade(
      {
        assetId,
        type: 'sell',
        date: TODAY,
        quantityText: '4',
        unitPriceText: '70',
        feesText: '',
        accountId: null,
      },
      ctx(),
      NOW,
    );
    if (!sell.ok) throw new Error('vendita di prova non valida');
    expect(sell.value.amount_base_minor).toBe(28000);
    await save({ investmentTransactions: { insert: [sell.value] } });
    expect(quantityAt(assetId, data().investmentTransactions, TODAY)).toBe('11');
  });

  it('eliminare un acquisto che copre una vendita è bloccato; eliminare la vendita no', async () => {
    const { save, data, ctx } = await setup();
    const holding = createHolding(etf({ quantityText: '10' }), ctx(), NOW);
    if (!holding.ok) throw new Error('asset di prova non valido');
    await save({
      assets: { insert: [holding.value.asset] },
      investmentTransactions: { insert: [holding.value.trade] },
    });
    const assetId = holding.value.asset.id;
    const sell = createTrade(
      {
        assetId,
        type: 'sell',
        date: TODAY,
        quantityText: '8',
        unitPriceText: '55',
        feesText: '',
        accountId: null,
      },
      ctx(),
      NOW,
    );
    if (!sell.ok) throw new Error('vendita di prova non valida');
    await save({ investmentTransactions: { insert: [sell.value] } });

    const ops = data().investmentTransactions;
    expect(canDeleteOperation(holding.value.trade.id, assetId, ops)).toBe(false);
    expect(canDeleteOperation(sell.value.id, assetId, ops)).toBe(true);

    // Cancellazione logica della vendita: sparisce dai dati attivi e la quantità torna a 10
    await save({ investmentTransactions: { update: [softDelete(sell.value, NOW)] } });
    expect(quantityAt(assetId, data().investmentTransactions, TODAY)).toBe('10');
  });

  it('le quantità frazionarie restano esatte dopo il giro nel foglio', async () => {
    const { repo, save, ctx } = await setup();
    const holding = createHolding(
      etf({
        asset: { name: 'Bitcoin', symbol: 'btc', isin: '', assetClass: 'crypto', currency: 'EUR' },
        quantityText: '0,12345678',
        purchasePriceText: '40000',
        feesText: '',
        currentPriceText: '',
      }),
      ctx(),
      NOW,
    );
    if (!holding.ok) throw new Error('asset di prova non valido');
    await save({
      assets: { insert: [holding.value.asset] },
      investmentTransactions: { insert: [holding.value.trade] },
    });

    const reloaded = await repo.load();
    expect(reloaded.investmentTransactions[0]?.quantity).toBe('0.12345678');
    // 0,12345678 × 40.000,00 € = 4.938,2712 € → 4.938,27 € (493827 cent)
    expect(reloaded.investmentTransactions[0]?.amount_base_minor).toBe(493827);
    const summary = positionSummary(
      holding.value.asset,
      { operations: reloaded.investmentTransactions, prices: reloaded.priceHistory },
      TODAY,
      {},
    );
    expect(summary.valueMinor).toBe(493827); // senza prezzo attuale vale il prezzo pagato
  });

  it('un asset in dollari usa il cambio del giorno dell’acquisto e l’ultimo cambio per il valore', async () => {
    const { save, fx, data, portfolioOf, ctx } = await setup();

    // Acquisto il 13/03/2026: cambio del giorno 1,1476
    const rate = await fx.rateFor('2026-03-13', 'USD');
    const holding = createHolding(
      etf({
        asset: {
          name: 'Azioni USA',
          symbol: 'usa',
          isin: '',
          assetClass: 'equity',
          currency: 'USD',
        },
        quantityText: '10',
        purchasePriceText: '100',
        feesText: '',
        purchaseDate: '2026-03-13',
        fxRate: rate,
        currentPriceText: '110',
      }),
      ctx(),
      NOW,
    );
    if (!holding.ok) throw new Error('asset di prova non valido');
    await save({
      assets: { insert: [holding.value.asset] },
      investmentTransactions: { insert: [holding.value.trade] },
      ...(holding.value.price ? { priceHistory: { insert: [holding.value.price] } } : {}),
    });

    // Pagato: 1.000,00 USD / 1,1476 = 871,38 €
    expect(holding.value.trade.amount_base_minor).toBe(87138);

    // Valore attuale: 10 × 110,00 USD = 1.100,00 USD → a 1,1476 = 958,52 €
    const latest = await fx.latestRates(['USD']);
    const portfolio = portfolioOf(data());
    const wealth = wealthAt(data().accounts, data().transactions, portfolio, TODAY, latest);
    expect(wealth.investmentsMinor).toBe(95852);
    expect(wealth.totalMinor).toBe(100000 + 95852);

    // Senza cambio l'asset è escluso e segnalato
    const noRates = wealthAt(data().accounts, data().transactions, portfolio, TODAY, {});
    expect(noRates.investmentsMinor).toBe(0);
    expect(noRates.missing).toEqual(['USD']);
  });

  it('il rendimento complessivo somma più asset', async () => {
    const { save, data, portfolioOf, ctx } = await setup();
    for (const [name, qty, price, current] of [
      ['Uno', '10', '10', '12'], // pagato 100,00 → vale 120,00
      ['Due', '5', '10', '12'], // pagato 50,00 → vale 60,00
    ] as const) {
      const holding = createHolding(
        etf({
          asset: { name, symbol: '', isin: '', assetClass: 'etf', currency: 'EUR' },
          quantityText: qty,
          purchasePriceText: price,
          feesText: '',
          currentPriceText: current,
        }),
        ctx(),
        NOW,
      );
      if (!holding.ok) throw new Error('asset di prova non valido');
      await save({
        assets: { insert: [holding.value.asset] },
        investmentTransactions: { insert: [holding.value.trade] },
        ...(holding.value.price ? { priceHistory: { insert: [holding.value.price] } } : {}),
      });
    }
    const portfolio = portfolioOf(data());
    const summaries = data().assets.map((a) => positionSummary(a, portfolio, TODAY, {}));
    // Pagato 150,00 € → vale 180,00 € → +30,00 € = +20,0 %
    expect(portfolioSummary(summaries)).toMatchObject({
      valueMinor: 18000,
      investedMinor: 15000,
      gainMinor: 3000,
      roiTenthsPercent: 200,
    });
  });
});
