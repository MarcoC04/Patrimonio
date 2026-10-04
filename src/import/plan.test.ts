import { describe, expect, it } from 'vitest';
import { applyChanges } from '../data/dataset';
import type { Dataset } from '../data/repository';
import type { Account, Asset, CategorizationRule, Transaction } from '../data/schema';
import { buildDefaultCategories } from '../domain/defaultCategories';
import { buildImport, buildPlan, mapAssetClass, type ImportInput, type PlannedRow } from './plan';
import type { ImportedRow } from './types';

const TS = '2026-01-02T03:04:05.000Z';
const NOW = new Date('2026-10-04T10:00:00.000Z');

let counter = 0;
const newId = () => `id-${++counter}`;

const account = (over: Partial<Account> = {}): Account => ({
  id: 'acc-1',
  created_at: TS,
  updated_at: TS,
  deleted: false,
  name: 'Conto di prova',
  institution: '',
  type: 'checking',
  currency: 'EUR',
  opening_balance_minor: 0,
  opening_date: '2026-01-01',
  is_archived: false,
  ...over,
});

function dataset(over: Partial<Dataset> = {}): Dataset {
  return {
    accounts: [account()],
    categories: buildDefaultCategories(NOW, newId),
    transactions: [],
    fxRates: [],
    assets: [],
    investmentTransactions: [],
    priceHistory: [],
    importBatches: [],
    categorizationRules: [],
    meta: {},
    ...over,
  };
}

const category = (data: Dataset, name: string, kind: string) => {
  const found = data.categories.find((c) => c.name === name && c.kind === kind);
  if (!found) throw new Error(`categoria di prova mancante: ${name}`);
  return found;
};

const imported = (over: Partial<ImportedRow> = {}): ImportedRow => ({
  line: 2,
  date: '2026-09-01',
  amountMinor: -931,
  currency: 'EUR',
  description: 'Negozio Uno',
  rawDescription: 'POS NEGOZIO UNO ROMA',
  externalId: null,
  trade: null,
  warnings: [],
  ...over,
});

const rule = (over: Partial<CategorizationRule> = {}): CategorizationRule => ({
  id: 'rule-1',
  created_at: TS,
  updated_at: TS,
  deleted: false,
  priority: 1,
  field: 'description',
  match_type: 'contains',
  pattern: 'negozio',
  category_id: 'x',
  account_id: null,
  amount_min_minor: null,
  amount_max_minor: null,
  source: 'manual',
  hit_count: 0,
  is_enabled: true,
  ...over,
});

async function plan(data: Dataset, rows: ImportedRow[], fileHash = 'h1') {
  const result = await buildPlan({ accountId: 'acc-1', rows, fileHash, dataset: data });
  if (!result.ok) throw new Error(`piano non riuscito: ${result.issue}`);
  return result.plan;
}

function importInput(data: Dataset, rows: PlannedRow[], over: Partial<ImportInput> = {}) {
  return {
    accountId: 'acc-1',
    parserId: 'revolut' as const,
    filename: 'estratto-finto.csv',
    fileHash: 'h1',
    rows,
    dataset: data,
    ...over,
  };
}

describe('buildPlan', () => {
  it('rifiuta un conto inesistente o non in EUR (per ora si importa solo in EUR)', async () => {
    expect(
      await buildPlan({ accountId: 'zzz', rows: [], fileHash: '', dataset: dataset() }),
    ).toEqual({ ok: false, issue: 'account' });
    const usd = dataset({ accounts: [account({ currency: 'USD' })] });
    expect(await buildPlan({ accountId: 'acc-1', rows: [], fileHash: '', dataset: usd })).toEqual({
      ok: false,
      issue: 'currency',
    });
  });

  it('le righe pulite sono incluse, quelle con avvisi no', async () => {
    const p = await plan(dataset(), [
      imported(),
      imported({ description: 'Sospeso', warnings: ['not_completed'] }),
      imported({ description: 'Dollari', currency: 'USD' }),
    ]);
    expect(p.rows.map((r) => r.include)).toEqual([true, false, false]);
    expect(p.rows[2]?.warnings).toEqual(['other_currency']); // aggiunto dal confronto col conto
  });

  it('segnala come duplicata una riga giÃ  importata (stesso conto) e la esclude', async () => {
    const first = await plan(dataset(), [imported()]);
    const built = buildImport(importInput(dataset(), first.rows), NOW, newId);
    if (!built.ok) throw new Error('import non riuscito');
    const after = applyChanges(dataset(), built.changes);

    const again = await plan(after, [imported()]);
    expect(again.rows[0]?.duplicate).toBe(true);
    expect(again.rows[0]?.include).toBe(false);
    expect(again.fileAlreadyImported).toBe(true);
  });

  it('un conto diverso con la stessa riga non Ã¨ un duplicato', async () => {
    const first = await plan(dataset(), [imported()]);
    const built = buildImport(importInput(dataset(), first.rows), NOW, newId);
    if (!built.ok) throw new Error('import non riuscito');
    const after = applyChanges(dataset(), built.changes);
    const other = {
      ...after,
      transactions: after.transactions.map((t) => ({ ...t, account_id: 'acc-2' })),
      importBatches: after.importBatches.map((b) => ({ ...b, account_id: 'acc-2' })),
    };
    const again = await plan(other, [imported()]);
    expect(again.rows[0]?.duplicate).toBe(false);
    expect(again.fileAlreadyImported).toBe(false);
  });

  it('propone la categoria dalla regola, ma solo se il tipo (spesa/entrata) combacia', async () => {
    const data = dataset();
    const alimentari = category(data, 'Alimentari', 'expense');
    const withRule = { ...data, categorizationRules: [rule({ category_id: alimentari.id })] };

    const spesa = await plan(withRule, [imported()]);
    expect(spesa.rows[0]?.categoryId).toBe(alimentari.id);
    expect(spesa.rows[0]?.ruleId).toBe('rule-1');

    const entrata = await plan(withRule, [imported({ amountMinor: 931 })]); // categoria di spesa su un'entrata
    expect(entrata.rows[0]?.categoryId).toBeNull();
    expect(entrata.rows[0]?.ruleId).toBeNull();
  });
});

describe('buildImport: movimenti', () => {
  it('crea spese (negative) ed entrate con lotto, testo originale e hash', async () => {
    const data = dataset();
    const p = await plan(data, [
      imported(),
      imported({ date: '2026-09-02', amountMinor: 32973, description: 'Stipendio finto' }),
    ]);
    const built = buildImport(importInput(data, p.rows), NOW, newId);
    if (!built.ok) throw new Error('import non riuscito');

    const txs = built.changes.transactions?.insert ?? [];
    expect(txs.map((t) => t.amount_minor)).toEqual([-931, 32973]);
    expect(txs.map((t) => t.amount_base_minor)).toEqual([-931, 32973]); // EUR: base = importo
    expect(txs[0]?.raw_description).toBe('POS NEGOZIO UNO ROMA');
    expect(txs[0]?.dedupe_hash).toMatch(/^[0-9a-f]{64}$/);
    const batch = built.changes.importBatches?.insert?.[0];
    expect(txs.every((t) => t.import_batch_id === batch?.id)).toBe(true);
    expect(batch).toMatchObject({
      account_id: 'acc-1',
      filename: 'estratto-finto.csv',
      file_hash: 'h1',
      parser_id: 'revolut',
      status: 'committed',
      row_count: 2,
    });
    expect(built.changes.meta).toEqual({ 'import_format:acc-1': 'revolut' });
    expect(built.summary).toEqual({ transactions: 2, trades: 0, newAssets: 0, newRules: 0 });
  });

  it('salta le righe escluse e rispetta le modifiche dellâ€™utente (importo, data, categoria)', async () => {
    const data = dataset();
    const svago = category(data, 'Svago', 'expense');
    const p = await plan(data, [imported(), imported({ description: 'Da scartare' })]);
    const [first, second] = p.rows;
    if (!first || !second) throw new Error('righe mancanti');
    const edited: PlannedRow[] = [
      {
        ...first,
        amountMinor: -1000,
        date: '2026-09-05',
        description: 'Cena',
        categoryId: svago.id,
      },
      { ...second, include: false },
    ];
    const built = buildImport(importInput(data, edited), NOW, newId);
    if (!built.ok) throw new Error('import non riuscito');
    const txs = built.changes.transactions?.insert ?? [];
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      amount_minor: -1000,
      date: '2026-09-05',
      description: 'Cena',
      category_id: svago.id,
    });
  });

  it('una riga non valida blocca tutto: nessun ChangeSet (niente scritture parziali)', async () => {
    const data = dataset();
    const p = await plan(data, [imported(), imported({ date: '2025-12-31' })]); // prima dell'apertura del conto
    const built = buildImport(importInput(data, p.rows), NOW, newId);
    expect(built).toEqual({ ok: false, rowIssues: [{ key: 1, issue: 'before_opening' }] });
  });
});

describe('buildImport: regole', () => {
  it('conta gli usi delle regole e impara quelle nuove dalle correzioni', async () => {
    const data = dataset();
    const alimentari = category(data, 'Alimentari', 'expense');
    const svago = category(data, 'Svago', 'expense');
    const withRule = {
      ...data,
      categorizationRules: [rule({ category_id: alimentari.id, hit_count: 4, priority: 3 })],
    };
    const p = await plan(withRule, [
      imported(),
      imported({ description: 'Negozio Due' }),
      imported({ description: 'Cinema Centrale', rawDescription: '' }),
    ]);
    const rows = p.rows.map((r) =>
      r.description === 'Cinema Centrale'
        ? { ...r, categoryId: svago.id, learnPattern: 'cinema centrale' }
        : r,
    );
    const built = buildImport(importInput(withRule, rows), NOW, newId);
    if (!built.ok) throw new Error('import non riuscito');

    const rules = built.changes.categorizationRules;
    expect(rules?.update?.map((r) => [r.id, r.hit_count])).toEqual([['rule-1', 6]]); // due righe â†’ +2
    expect(rules?.insert).toHaveLength(1);
    expect(rules?.insert?.[0]).toMatchObject({
      pattern: 'cinema centrale',
      category_id: svago.id,
      source: 'learned',
      priority: 4,
    });
    expect(built.summary.newRules).toBe(1);
  });

  it('senza regole nÃ© correzioni il ChangeSet non tocca la scheda delle regole', async () => {
    const data = dataset();
    const p = await plan(data, [imported()]);
    const built = buildImport(importInput(data, p.rows), NOW, newId);
    if (!built.ok) throw new Error('import non riuscito');
    expect(built.changes.categorizationRules).toBeUndefined();
  });
});

describe('buildImport: acquisti e vendite (Trade Republic)', () => {
  const buy = (over: Partial<ImportedRow> = {}): ImportedRow =>
    imported({
      description: 'Acquisto ETF Mondo Finto',
      rawDescription: '',
      // 2 quote Ã— 50,00 â‚¬ + 1,00 â‚¬ di commissione = 101,00 â‚¬ in uscita dal deposito
      amountMinor: -10100,
      externalId: 'tx-buy-1',
      trade: {
        type: 'buy',
        name: 'ETF Mondo Finto',
        symbol: 'IE00TEST0001',
        assetClass: 'FUND',
        quantity: '2',
        unitPrice: '50',
        feeMinor: 100,
      },
      ...over,
    });

  it('crea asset, operazione e il lato contanti del giroconto, tutto in un unico ChangeSet', async () => {
    const data = dataset();
    const p = await plan(data, [buy()]);
    expect(p.rows[0]?.categoryId).toBe(category(data, 'Trasferimento', 'transfer').id);

    const built = buildImport(
      importInput(data, p.rows, { parserId: 'trade_republic' }),
      NOW,
      newId,
    );
    if (!built.ok) throw new Error(`import non riuscito: ${JSON.stringify(built)}`);

    const asset = built.changes.assets?.insert?.[0];
    expect(asset).toMatchObject({
      name: 'ETF Mondo Finto',
      isin: 'IE00TEST0001',
      symbol: '',
      asset_class: 'etf',
      currency: 'EUR',
    });
    const op = built.changes.investmentTransactions?.insert?.[0];
    expect(op).toMatchObject({
      asset_id: asset?.id,
      type: 'buy',
      quantity: '2',
      unit_price: '50',
      fees_minor: 100,
      account_id: 'acc-1',
      amount_base_minor: 10100,
    });
    const cash = built.changes.transactions?.insert?.[0];
    expect(cash).toMatchObject({
      amount_minor: -10100,
      dedupe_hash: 'ext:tx-buy-1',
      category_id: category(data, 'Trasferimento', 'transfer').id,
    });
    expect(cash?.transfer_group_id).toBeTruthy();
    expect(built.summary).toEqual({ transactions: 1, trades: 1, newAssets: 1, newRules: 0 });
  });

  it('riusa lâ€™asset esistente (stesso ISIN) invece di crearne un altro', async () => {
    const existingAsset: Asset = {
      id: 'asset-1',
      created_at: TS,
      updated_at: TS,
      deleted: false,
      name: 'Altro nome',
      symbol: '',
      isin: 'IE00TEST0001',
      asset_class: 'etf',
      currency: 'EUR',
      price_source: 'manual',
    };
    const data = dataset({ assets: [existingAsset] });
    const p = await plan(data, [buy()]);
    const built = buildImport(importInput(data, p.rows), NOW, newId);
    if (!built.ok) throw new Error('import non riuscito');
    expect(built.changes.assets).toBeUndefined();
    expect(built.changes.investmentTransactions?.insert?.[0]?.asset_id).toBe('asset-1');
  });

  it('una vendita oltre le quote possedute blocca lâ€™import', async () => {
    const data = dataset();
    const sell = buy({
      amountMinor: 20000,
      externalId: 'tx-sell-1',
      date: '2026-09-10',
      trade: {
        type: 'sell',
        name: 'ETF Mondo Finto',
        symbol: 'IE00TEST0001',
        assetClass: 'FUND',
        quantity: '3', // ne ha comprate 2
        unitPrice: '70',
        feeMinor: 0,
      },
    });
    const p = await plan(data, [buy(), sell]);
    const built = buildImport(importInput(data, p.rows), NOW, newId);
    expect(built).toEqual({ ok: false, rowIssues: [{ key: 1, issue: 'insufficient' }] });
  });

  it('le righe vengono applicate in ordine di data anche se nel file sono al contrario', async () => {
    const data = dataset();
    const sell = buy({
      amountMinor: 5000,
      externalId: 'tx-sell-2',
      date: '2026-09-10',
      trade: {
        type: 'sell',
        name: 'ETF Mondo Finto',
        symbol: 'IE00TEST0001',
        assetClass: 'FUND',
        quantity: '1',
        unitPrice: '50',
        feeMinor: 0,
      },
    });
    // vendita (10/09) prima dell'acquisto (01/09) nel file
    const p = await plan(data, [sell, buy()]);
    const built = buildImport(importInput(data, p.rows), NOW, newId);
    expect(built.ok).toBe(true);
  });
});

describe('mapAssetClass', () => {
  it.each([
    ['FUND', 'etf'],
    ['etf', 'etf'],
    ['STOCK', 'equity'],
    ['CRYPTO', 'crypto'],
    ['BOND', 'bond'],
    ['QUALCOSA', 'other'],
    ['', 'other'],
  ])('%s â†’ %s', (raw, expected) => {
    expect(mapAssetClass(raw)).toBe(expected);
  });
});

// Evita che un campo nuovo di Transaction passi inosservato nei test sopra.
describe('forma dei movimenti importati', () => {
  it('ha tutti i campi della scheda', async () => {
    const data = dataset();
    const p = await plan(data, [imported()]);
    const built = buildImport(importInput(data, p.rows), NOW, newId);
    if (!built.ok) throw new Error('import non riuscito');
    const tx: Transaction | undefined = built.changes.transactions?.insert?.[0];
    expect(Object.keys(tx ?? {}).sort()).toEqual(
      [
        'id',
        'created_at',
        'updated_at',
        'deleted',
        'account_id',
        'date',
        'description',
        'raw_description',
        'amount_minor',
        'currency',
        'fx_rate',
        'amount_base_minor',
        'category_id',
        'transfer_group_id',
        'recurring_rule_id',
        'import_batch_id',
        'dedupe_hash',
        'notes',
      ].sort(),
    );
  });
});
