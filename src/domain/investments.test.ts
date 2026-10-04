import { describe, expect, it } from 'vitest';
import type { Asset, InvestmentTransaction, PricePoint } from '../data/schema';
import {
  canDeleteAsset,
  canDeleteOperation,
  createAsset,
  createHolding,
  createPrice,
  createTrade,
  holdingsNeverNegative,
  investmentsValue,
  portfolioSummary,
  positionSummary,
  positionValue,
  priceAt,
  quantityAt,
  type TradeContext,
} from './investments';

// Dati sintetici inventati.
const TS = '2026-01-02T03:04:05.000Z';
const NOW = new Date('2026-03-20T10:00:00.000Z');

const asset = (id: string, currency = 'EUR', name = id): Asset => ({
  id,
  created_at: TS,
  updated_at: TS,
  deleted: false,
  name,
  symbol: '',
  isin: '',
  asset_class: 'etf',
  currency,
  price_source: 'manual',
});

let seq = 0;
const op = (
  asset_id: string,
  type: 'buy' | 'sell',
  date: string,
  quantity: string,
  unit_price: string,
  amount_base_minor = 0,
  id = `op-${++seq}`,
  created_at = TS,
): InvestmentTransaction => ({
  id,
  created_at,
  updated_at: created_at,
  deleted: false,
  account_id: null,
  asset_id,
  type,
  date,
  quantity,
  unit_price,
  fees_minor: 0,
  currency: 'EUR',
  fx_rate: '1',
  amount_base_minor,
});

const point = (asset_id: string, date: string, price: string, created_at = TS): PricePoint => ({
  id: `p-${++seq}`,
  created_at,
  updated_at: created_at,
  deleted: false,
  asset_id,
  date,
  price,
  currency: 'EUR',
  source: 'manual',
});

describe('quantityAt', () => {
  const ops = [
    op('A', 'buy', '2026-01-10', '10', '1'),
    op('A', 'buy', '2026-02-01', '5', '1'),
    op('A', 'sell', '2026-03-01', '3', '1'),
    op('B', 'buy', '2026-01-15', '99', '1'), // altro asset: ignorato
  ];

  it('acquisti − vendite alla data: 10, poi 15, poi 12', () => {
    expect(quantityAt('A', ops, '2026-01-31')).toBe('10');
    expect(quantityAt('A', ops, '2026-02-28')).toBe('15');
    expect(quantityAt('A', ops, '2026-03-01')).toBe('12'); // il giorno stesso è incluso
    expect(quantityAt('A', ops, '2026-12-31')).toBe('12');
  });

  it('prima del primo acquisto vale 0', () => {
    expect(quantityAt('A', ops, '2026-01-09')).toBe('0');
  });

  it('è esatta con i decimali: 0,1 + 0,2 = 0,3', () => {
    const decimals = [
      op('A', 'buy', '2026-01-01', '0.1', '1'),
      op('A', 'buy', '2026-01-02', '0.2', '1'),
    ];
    expect(quantityAt('A', decimals, '2026-02-01')).toBe('0.3');
  });

  it('frazioni di criptovaluta: 0,12345678 − 0,00000001 = 0,12345677', () => {
    const crypto = [
      op('C', 'buy', '2026-01-01', '0.12345678', '1'),
      op('C', 'sell', '2026-01-02', '0.00000001', '1'),
    ];
    expect(quantityAt('C', crypto, '2026-02-01')).toBe('0.12345677');
  });
});

describe('holdingsNeverNegative e cancellazione di operazioni', () => {
  it('vendere tutto va bene; vendere di più no', () => {
    expect(
      holdingsNeverNegative([
        op('A', 'buy', '2026-01-01', '10', '1'),
        op('A', 'sell', '2026-02-01', '10', '1'),
      ]),
    ).toBe(true);
    expect(
      holdingsNeverNegative([
        op('A', 'buy', '2026-01-01', '10', '1'),
        op('A', 'sell', '2026-02-01', '10.1', '1'),
      ]),
    ).toBe(false);
  });

  it('nello stesso giorno gli acquisti contano prima delle vendite, anche se inseriti dopo', () => {
    const sellFirst = op('A', 'sell', '2026-02-01', '5', '1', 0, 's', '2026-02-01T08:00:00.000Z');
    const buyLater = op('A', 'buy', '2026-02-01', '5', '1', 0, 'b', '2026-02-01T09:00:00.000Z');
    expect(holdingsNeverNegative([sellFirst, buyLater])).toBe(true);
  });

  it('una vendita prima dell’acquisto (per data) non è possibile', () => {
    expect(
      holdingsNeverNegative([
        op('A', 'sell', '2026-01-01', '1', '1'),
        op('A', 'buy', '2026-02-01', '5', '1'),
      ]),
    ).toBe(false);
  });

  it('eliminare un acquisto che copre una vendita non è ammesso', () => {
    const ops = [
      op('A', 'buy', '2026-01-10', '10', '1', 0, 'b1'),
      op('A', 'buy', '2026-02-01', '5', '1', 0, 'b2'),
      op('A', 'sell', '2026-03-01', '12', '1', 0, 's1'),
    ];
    expect(canDeleteOperation('b2', 'A', ops)).toBe(false); // resterebbe 10 − 12
    expect(canDeleteOperation('b1', 'A', ops)).toBe(false); // resterebbe 5 − 12
    expect(canDeleteOperation('s1', 'A', ops)).toBe(true); // eliminare la vendita va sempre bene
  });

  it('un asset con operazioni non si elimina', () => {
    const ops = [op('A', 'buy', '2026-01-10', '1', '1')];
    expect(canDeleteAsset('A', ops)).toBe(false);
    expect(canDeleteAsset('B', ops)).toBe(true);
  });
});

describe('priceAt', () => {
  const ops = [op('A', 'buy', '2026-01-05', '1', '95')];
  const prices = [point('A', '2026-01-10', '100'), point('A', '2026-02-10', '110')];

  it('usa l’ultimo prezzo noto: prima quello dell’acquisto, poi i prezzi inseriti', () => {
    expect(priceAt('A', prices, ops, '2026-01-07')).toEqual({ price: '95', date: '2026-01-05' });
    expect(priceAt('A', prices, ops, '2026-01-20')).toEqual({ price: '100', date: '2026-01-10' });
    expect(priceAt('A', prices, ops, '2026-02-10')).toEqual({ price: '110', date: '2026-02-10' });
    expect(priceAt('A', prices, ops, '2026-03-01')).toEqual({ price: '110', date: '2026-02-10' });
  });

  it('prima di qualsiasi dato non c’è prezzo', () => {
    expect(priceAt('A', prices, ops, '2026-01-04')).toBeNull();
    expect(priceAt('Z', prices, ops, '2026-03-01')).toBeNull();
  });

  it('a parità di data prevale il prezzo inserito a mano su quello dell’operazione', () => {
    const sameDay = [op('A', 'buy', '2026-02-01', '1', '99')];
    expect(priceAt('A', [point('A', '2026-02-01', '100')], sameDay, '2026-02-01')?.price).toBe(
      '100',
    );
  });

  it('con più prezzi nello stesso giorno vale l’ultimo inserito', () => {
    const two = [
      point('A', '2026-02-01', '100', '2026-02-01T08:00:00.000Z'),
      point('A', '2026-02-01', '101', '2026-02-01T09:00:00.000Z'),
    ];
    expect(priceAt('A', two, [], '2026-02-01')?.price).toBe('101');
  });

  it('un prezzo a zero nelle operazioni non conta', () => {
    expect(priceAt('A', [], [op('A', 'buy', '2026-01-01', '1', '0')], '2026-02-01')).toBeNull();
  });
});

describe('positionValue', () => {
  it('EUR: 10 quote × 12,50 € = 125,00 € (12500 cent), col prezzo dell’acquisto', () => {
    const portfolio = { operations: [op('A', 'buy', '2026-01-01', '10', '12.5')], prices: [] };
    const result = positionValue(asset('A'), portfolio, '2026-03-20', {});
    expect(result).toMatchObject({ quantity: '10', valueMinor: 12500, status: 'ok' });
  });

  it('un prezzo più recente aggiorna il valore: 10 × 13 = 130,00 €', () => {
    const portfolio = {
      operations: [op('A', 'buy', '2026-01-01', '10', '12.5')],
      prices: [point('A', '2026-03-01', '13')],
    };
    expect(positionValue(asset('A'), portfolio, '2026-03-20', {}).valueMinor).toBe(13000);
  });

  it('USD: 10 × 12,50 USD = 125,00 USD → a 1,25 sono 100,00 € (10000 cent)', () => {
    const portfolio = { operations: [op('U', 'buy', '2026-01-01', '10', '12.5')], prices: [] };
    expect(
      positionValue(asset('U', 'USD'), portfolio, '2026-03-20', { USD: '1.25' }),
    ).toMatchObject({
      valueMinor: 10000,
      status: 'ok',
    });
  });

  it('senza il cambio non inventa: valore nullo e stato "no_rate"', () => {
    const portfolio = { operations: [op('U', 'buy', '2026-01-01', '10', '12.5')], prices: [] };
    expect(positionValue(asset('U', 'USD'), portfolio, '2026-03-20', {})).toMatchObject({
      valueMinor: null,
      status: 'no_rate',
    });
  });

  it('JPY (nessun decimale): 100 × 3.000 JPY = 300.000 JPY → a 150 sono 2.000,00 € (200000 cent)', () => {
    const portfolio = { operations: [op('Y', 'buy', '2026-01-01', '100', '3000')], prices: [] };
    expect(
      positionValue(asset('Y', 'JPY'), portfolio, '2026-03-20', { JPY: '150' }).valueMinor,
    ).toBe(200000);
  });

  it('senza nessun prezzo noto lo segnala', () => {
    const portfolio = { operations: [op('A', 'buy', '2026-01-01', '10', '0')], prices: [] };
    expect(positionValue(asset('A'), portfolio, '2026-03-20', {})).toMatchObject({
      valueMinor: null,
      status: 'no_price',
    });
  });

  it('una posizione chiusa vale 0 anche senza prezzo; prima dell’acquisto vale 0', () => {
    const closed = {
      operations: [op('A', 'buy', '2026-01-01', '5', '0'), op('A', 'sell', '2026-02-01', '5', '0')],
      prices: [],
    };
    expect(positionValue(asset('A'), closed, '2026-03-20', {})).toMatchObject({
      valueMinor: 0,
      status: 'ok',
    });
    const later = { operations: [op('A', 'buy', '2026-06-01', '5', '10')], prices: [] };
    expect(positionValue(asset('A'), later, '2026-03-20', {}).valueMinor).toBe(0);
  });
});

describe('investmentsValue', () => {
  it('somma le posizioni: 125,00 + 100,00 (USD a 1,25) = 225,00 €', () => {
    const portfolio = {
      assets: [asset('A'), asset('U', 'USD')],
      operations: [
        op('A', 'buy', '2026-01-01', '10', '12.5'),
        op('U', 'buy', '2026-01-01', '10', '12.5'),
      ],
      prices: [],
    };
    expect(investmentsValue(portfolio, '2026-03-20', { USD: '1.25' })).toEqual({
      totalMinor: 22500,
      missing: [],
      unpriced: [],
    });
  });

  it('esclude e segnala ciò che non si può valutare', () => {
    const portfolio = {
      assets: [asset('A'), asset('U', 'USD'), asset('N')],
      operations: [
        op('A', 'buy', '2026-01-01', '10', '12.5'),
        op('U', 'buy', '2026-01-01', '10', '12.5'),
        op('N', 'buy', '2026-01-01', '3', '0'), // nessun prezzo
      ],
      prices: [],
    };
    expect(investmentsValue(portfolio, '2026-03-20', {})).toEqual({
      totalMinor: 12500, // solo l'asset in EUR
      missing: ['USD'],
      unpriced: ['N'],
    });
  });

  it('senza asset vale 0', () => {
    expect(investmentsValue({ assets: [], operations: [], prices: [] }, '2026-03-20', {})).toEqual({
      totalMinor: 0,
      missing: [],
      unpriced: [],
    });
  });
});

describe('positionSummary e rendimento', () => {
  it('ROI = (valore + incassi − pagato) / pagato: pagato 101,00 €, ora vale 120,00 € → +19,00 € = 18,8 %', () => {
    // Acquisto di 10 quote a 10,00 € + 1,00 € di commissioni = 101,00 € pagati (10100 cent)
    const portfolio = {
      operations: [op('A', 'buy', '2026-01-10', '10', '10', 10100)],
      prices: [point('A', '2026-02-01', '12')],
    };
    const summary = positionSummary(asset('A'), portfolio, '2026-03-01', {});
    expect(summary).toMatchObject({
      valueMinor: 12000,
      investedMinor: 10100,
      proceedsMinor: 0,
      gainMinor: 1900,
      roiTenthsPercent: 188, // 1900 / 10100 = 18,81 %
    });
  });

  it('con una vendita: incassi 60,00 €, restano 6 quote da 12,00 € = 72,00 € → +31,00 € = 30,7 %', () => {
    const portfolio = {
      operations: [
        op('A', 'buy', '2026-01-10', '10', '10', 10100),
        op('A', 'sell', '2026-02-15', '4', '15', 6000), // 4 × 15,00 = 60,00 € incassati
      ],
      prices: [point('A', '2026-02-20', '12')], // dopo la vendita
    };
    const summary = positionSummary(asset('A'), portfolio, '2026-03-01', {});
    expect(summary).toMatchObject({
      quantity: '6',
      valueMinor: 7200,
      investedMinor: 10100,
      proceedsMinor: 6000,
      gainMinor: 3100, // 7200 + 6000 − 10100
      roiTenthsPercent: 307, // 3100 / 10100 = 30,69 %
    });
  });

  it('una perdita ha rendimento negativo: valore 90,00 € su 100,00 € pagati = −10,0 %', () => {
    const portfolio = {
      operations: [op('A', 'buy', '2026-01-10', '10', '10', 10000)],
      prices: [point('A', '2026-02-01', '9')],
    };
    const summary = positionSummary(asset('A'), portfolio, '2026-03-01', {});
    expect(summary).toMatchObject({ gainMinor: -1000, roiTenthsPercent: -100 });
  });

  it('senza prezzo o senza cambio il guadagno non si calcola', () => {
    const portfolio = {
      operations: [op('U', 'buy', '2026-01-10', '10', '10', 8000)],
      prices: [],
    };
    const summary = positionSummary(asset('U', 'USD'), portfolio, '2026-03-01', {});
    expect(summary.gainMinor).toBeNull();
    expect(summary.roiTenthsPercent).toBeNull();
  });

  it('senza nulla pagato il rendimento è nullo (nessuna divisione per zero)', () => {
    const summary = positionSummary(asset('A'), { operations: [], prices: [] }, '2026-03-01', {});
    expect(summary).toMatchObject({ investedMinor: 0, valueMinor: 0, roiTenthsPercent: null });
  });

  it('il rendimento complessivo somma pagato, incassi e valore: 150 € investiti → 180 € = +20,0 %', () => {
    const a = positionSummary(
      asset('A'),
      {
        operations: [op('A', 'buy', '2026-01-10', '10', '10', 10000)],
        prices: [point('A', '2026-02-01', '12')],
      },
      '2026-03-01',
      {},
    ); // pagato 100, vale 120
    const b = positionSummary(
      asset('B'),
      {
        operations: [op('B', 'buy', '2026-01-10', '5', '10', 5000)],
        prices: [point('B', '2026-02-01', '12')],
      },
      '2026-03-01',
      {},
    ); // pagato 50, vale 60
    expect(portfolioSummary([a, b])).toEqual({
      valueMinor: 18000,
      investedMinor: 15000,
      proceedsMinor: 0,
      gainMinor: 3000,
      roiTenthsPercent: 200,
    });
  });
});

describe('createAsset', () => {
  it('normalizza e crea un asset manuale', () => {
    const result = createAsset(
      {
        name: ' Azioni ACME ',
        symbol: ' acme ',
        isin: 'us0378331005',
        assetClass: 'equity',
        currency: 'USD',
      },
      [],
      NOW,
      () => 'a-1',
    );
    expect(result.ok && result.value).toMatchObject({
      id: 'a-1',
      name: 'Azioni ACME',
      symbol: 'ACME',
      isin: 'US0378331005',
      asset_class: 'equity',
      currency: 'USD',
      price_source: 'manual',
    });
  });

  it('simbolo e ISIN sono facoltativi', () => {
    const result = createAsset(
      { name: 'Casa', symbol: '', isin: '', assetClass: 'real_estate', currency: 'EUR' },
      [],
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it('segnala tutti i campi sbagliati insieme', () => {
    expect(
      createAsset(
        { name: ' ', symbol: '', isin: 'XX', assetClass: 'boh', currency: 'XXX' },
        [],
        NOW,
      ),
    ).toEqual({ ok: false, issues: ['name', 'currency', 'isin', 'asset_class'] });
  });

  it('rifiuta un nome già usato, ignorando maiuscole e spazi', () => {
    const existing = [{ name: 'ETF Mondo' }];
    expect(
      createAsset(
        { name: ' etf mondo ', symbol: '', isin: '', assetClass: 'etf', currency: 'EUR' },
        existing,
        NOW,
      ),
    ).toEqual({ ok: false, issues: ['name_taken'] });
  });
});

describe('createTrade', () => {
  const baseCtx = (operations: InvestmentTransaction[] = []): TradeContext => ({
    assets: [asset('A'), asset('U', 'USD')],
    operations,
    accounts: [{ id: 'acc-1' }],
  });
  const input = (overrides = {}) => ({
    assetId: 'A',
    type: 'buy' as const,
    date: '2026-03-10',
    quantityText: '2,5',
    unitPriceText: '10,10',
    feesText: '1,00',
    accountId: null,
    ...overrides,
  });

  it('acquisto: 2,5 × 10,10 = 25,25 € + 1,00 € di commissioni = 26,25 € (2625 cent)', () => {
    const result = createTrade(input(), baseCtx(), NOW, () => 't-1');
    expect(result.ok && result.value).toMatchObject({
      id: 't-1',
      type: 'buy',
      quantity: '2.5',
      unit_price: '10.1',
      fees_minor: 100,
      currency: 'EUR',
      fx_rate: '1',
      amount_base_minor: 2625,
    });
  });

  it('vendita: 2 × 10,10 = 20,20 € − 1,00 € di commissioni = 19,20 € incassati (1920 cent)', () => {
    const held = [op('A', 'buy', '2026-01-10', '2.5', '10')];
    const result = createTrade(input({ type: 'sell', quantityText: '2' }), baseCtx(held), NOW);
    expect(result.ok && result.value.amount_base_minor).toBe(1920);
  });

  it('asset in dollari: 10 × 12,50 USD + 1,25 USD = 126,25 USD → a 1,25 sono 101,00 € (10100 cent)', () => {
    const result = createTrade(
      input({
        assetId: 'U',
        quantityText: '10',
        unitPriceText: '12,5',
        feesText: '1,25',
        fxRate: '1.25',
      }),
      baseCtx(),
      NOW,
    );
    expect(result.ok && result.value).toMatchObject({
      currency: 'USD',
      fees_minor: 125,
      fx_rate: '1.25',
      amount_base_minor: 10100,
    });
  });

  it('per un asset non in euro il tasso è obbligatorio', () => {
    expect(createTrade(input({ assetId: 'U' }), baseCtx(), NOW)).toEqual({
      ok: false,
      issues: ['fx_rate'],
    });
  });

  it('le commissioni sono facoltative (vuote = 0)', () => {
    const result = createTrade(input({ feesText: '' }), baseCtx(), NOW);
    expect(result.ok && result.value).toMatchObject({ fees_minor: 0, amount_base_minor: 2525 });
  });

  it('non si può vendere più di quanto si possiede, né prima di averlo comprato', () => {
    const held = [op('A', 'buy', '2026-03-01', '3', '10')];
    expect(createTrade(input({ type: 'sell', quantityText: '4' }), baseCtx(held), NOW)).toEqual({
      ok: false,
      issues: ['insufficient'],
    });
    expect(createTrade(input({ type: 'sell', quantityText: '3' }), baseCtx(held), NOW).ok).toBe(
      true,
    );
    expect(
      createTrade(
        input({ type: 'sell', quantityText: '1', date: '2026-02-01' }),
        baseCtx(held),
        NOW,
      ),
    ).toEqual({ ok: false, issues: ['insufficient'] });
  });

  it('quantità ambigua ("1.234"), nulla o negativa non valida', () => {
    for (const quantityText of ['1.234', '0', '-1', '', 'abc']) {
      expect(createTrade(input({ quantityText }), baseCtx(), NOW)).toEqual({
        ok: false,
        issues: ['quantity'],
      });
    }
  });

  it('prezzo e commissioni non validi', () => {
    expect(createTrade(input({ unitPriceText: '0' }), baseCtx(), NOW)).toEqual({
      ok: false,
      issues: ['unit_price'],
    });
    expect(createTrade(input({ feesText: 'abc' }), baseCtx(), NOW)).toEqual({
      ok: false,
      issues: ['fees'],
    });
  });

  it('asset, data e conto devono esistere; i messaggi seguono l’ordine del modulo', () => {
    expect(
      createTrade(
        input({
          assetId: 'zzz',
          date: 'x',
          quantityText: 'x',
          unitPriceText: 'y',
          accountId: 'nope',
        }),
        baseCtx(),
        NOW,
      ),
    ).toEqual({ ok: false, issues: ['asset', 'date', 'quantity', 'unit_price', 'account'] });
  });

  it('con un conto valido lo collega', () => {
    const result = createTrade(input({ accountId: 'acc-1' }), baseCtx(), NOW);
    expect(result.ok && result.value.account_id).toBe('acc-1');
  });
});

describe('createPrice', () => {
  const assets = [asset('A', 'USD')];

  it('crea un prezzo manuale nella valuta dell’asset', () => {
    const result = createPrice(
      { assetId: 'A', date: '2026-03-20', priceText: '12,5' },
      assets,
      [],
      NOW,
      () => 'p-1',
    );
    expect(result.ok && result.value).toMatchObject({
      isUpdate: false,
      point: {
        id: 'p-1',
        asset_id: 'A',
        date: '2026-03-20',
        price: '12.5',
        currency: 'USD',
        source: 'manual',
      },
    });
  });

  it('un secondo prezzo nello stesso giorno sostituisce il primo invece di duplicarlo', () => {
    const existing = [point('A', '2026-03-20', '12')];
    const result = createPrice(
      { assetId: 'A', date: '2026-03-20', priceText: '13' },
      assets,
      existing,
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isUpdate).toBe(true);
    expect(result.value.point).toMatchObject({ id: existing[0]?.id, price: '13' });
  });

  it('rifiuta prezzo nullo, data inesistente e asset sconosciuto', () => {
    expect(
      createPrice({ assetId: 'A', date: '2026-03-20', priceText: '0' }, assets, [], NOW),
    ).toEqual({
      ok: false,
      issues: ['price'],
    });
    expect(
      createPrice({ assetId: 'zzz', date: '2026-02-30', priceText: '5' }, assets, [], NOW),
    ).toEqual({
      ok: false,
      issues: ['asset', 'date'],
    });
  });
});

describe('createHolding (nuovo asset già posseduto)', () => {
  const ctx: TradeContext = { assets: [], operations: [], accounts: [{ id: 'acc-1' }] };
  const input = (overrides = {}) => ({
    asset: { name: 'ETF Mondo', symbol: 'swda', isin: '', assetClass: 'etf', currency: 'EUR' },
    quantityText: '10',
    purchasePriceText: '50,25',
    feesText: '2,00',
    purchaseDate: '2026-01-10',
    accountId: 'acc-1',
    currentPriceText: '55',
    currentPriceDate: '2026-03-20',
    ...overrides,
  });

  it('crea asset, acquisto iniziale e prezzo attuale; il valore e il rendimento tornano', () => {
    let n = 0;
    const result = createHolding(input(), ctx, NOW, () => `id-${++n}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { asset: created, trade, price } = result.value;
    expect(created).toMatchObject({ name: 'ETF Mondo', symbol: 'SWDA', asset_class: 'etf' });
    // 10 × 50,25 = 502,50 € + 2,00 € di commissioni = 504,50 € pagati
    expect(trade).toMatchObject({ asset_id: created.id, quantity: '10', amount_base_minor: 50450 });
    expect(price).toMatchObject({ asset_id: created.id, price: '55', date: '2026-03-20' });

    const portfolio = { assets: [created], operations: [trade], prices: price ? [price] : [] };
    const summary = positionSummary(created, portfolio, '2026-03-20', {});
    expect(summary.valueMinor).toBe(55000); // 10 × 55,00
    expect(summary.gainMinor).toBe(4550); // 550,00 − 504,50
    expect(summary.roiTenthsPercent).toBe(90); // 4550 / 50450 = 9,02 %
  });

  it('il prezzo attuale è facoltativo: senza, vale il prezzo pagato', () => {
    const result = createHolding(input({ currentPriceText: '' }), ctx, NOW);
    expect(result.ok && result.value.price).toBeNull();
  });

  it('segnala insieme i campi sbagliati di asset, acquisto e prezzo attuale', () => {
    const result = createHolding(
      input({
        asset: { name: ' ', symbol: '', isin: '', assetClass: 'etf', currency: 'EUR' },
        quantityText: 'x',
        currentPriceText: 'zzz',
      }),
      ctx,
      NOW,
    );
    expect(result).toEqual({ ok: false, issues: ['name', 'quantity', 'current_price'] });
  });

  it('un asset in valuta estera richiede il cambio dell’acquisto', () => {
    const result = createHolding(
      input({
        asset: { name: 'Azioni USA', symbol: '', isin: '', assetClass: 'equity', currency: 'USD' },
      }),
      ctx,
      NOW,
    );
    expect(result).toEqual({ ok: false, issues: ['fx_rate'] });
  });

  it('con un nome già usato non crea nulla', () => {
    const taken: TradeContext = { ...ctx, assets: [asset('X', 'EUR', 'ETF Mondo')] };
    expect(createHolding(input(), taken, NOW)).toEqual({ ok: false, issues: ['name_taken'] });
  });
});
