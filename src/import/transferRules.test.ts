import { describe, expect, it } from 'vitest';
import { loadAll } from '../app/bootstrap';
import { applyChanges } from '../data/dataset';
import type { Dataset } from '../data/repository';
import { ScriptClient } from '../data/scriptClient';
import { ScriptRepository } from '../data/scriptRepository';
import { createScript, TEST_SECRET } from '../data/testing/fakeAppsScript';
import type { Account } from '../data/schema';
import { buildDefaultCategories } from '../domain/defaultCategories';
import { buildDefaultRules, buildTransferRules } from '../domain/defaultRules';
import { totalsMinor } from '../domain/ledger';
import { buildImport, buildPlan, type PlannedRow } from './plan';
import type { ImportedRow } from './types';

const STAMP = '2026-01-01T00:00:00.000Z';
const NOW = new Date('2026-10-04T10:00:00.000Z');
let n = 0;
const newId = () => `t-${++n}`;

const account: Account = {
  id: 'acc-fineco',
  created_at: STAMP,
  updated_at: STAMP,
  deleted: false,
  name: 'Fineco di prova',
  institution: '',
  type: 'checking',
  currency: 'EUR',
  opening_balance_minor: 0,
  opening_date: '2026-01-01',
  is_archived: false,
};

const categories = buildDefaultCategories(NOW, newId);
const dataset: Dataset = {
  accounts: [account],
  categories,
  transactions: [],
  fxRates: [],
  assets: [],
  investmentTransactions: [],
  priceHistory: [],
  importBatches: [],
  categorizationRules: [
    ...buildTransferRules(categories, NOW, newId),
    ...buildDefaultRules(categories, NOW, newId),
  ],
  meta: {},
};
const transferCategory = categories.find((c) => c.kind === 'transfer');

const imported = (over: Partial<ImportedRow>): ImportedRow => ({
  line: 2,
  date: '2026-09-05',
  amountMinor: -50000,
  currency: 'EUR',
  description: 'Bonifico',
  rawDescription: '',
  externalId: null,
  trade: null,
  balanceMinor: null,
  warnings: [],
  ...over,
});

async function plan(rows: ImportedRow[], data = dataset) {
  const result = await buildPlan({ accountId: 'acc-fineco', rows, fileHash: 'h', dataset: data });
  if (!result.ok) throw new Error(result.issue);
  return result.plan.rows;
}

const run = (rows: PlannedRow[], data = dataset) => {
  const built = buildImport(
    {
      accountId: 'acc-fineco',
      parserId: 'fineco',
      filename: 'f.xlsx',
      fileHash: 'h',
      rows,
      dataset: data,
    },
    NOW,
    newId,
  );
  if (!built.ok) throw new Error('import non riuscito');
  return { built, after: applyChanges(data, built.changes) };
};

describe('giroconti riconosciuti dalle regole', () => {
  it('un bonifico verso Trade Republic diventa un giroconto, anche se è un’uscita', async () => {
    const rows = await plan([
      imported({ description: 'Bonifico a favore di TRADE REPUBLIC BANK', amountMinor: -50000 }),
    ]);
    expect(rows[0]).toMatchObject({
      transfer: true,
      categoryId: transferCategory?.id,
      include: true,
    });
  });

  it('batte le altre regole iniziali (priorità più bassa) e vale anche per le entrate', async () => {
    const rows = await plan([
      imported({ description: 'Trade Republic Amazon Netflix', amountMinor: 30000 }),
    ]);
    expect(rows[0]?.transfer).toBe(true);
  });

  it('una spesa normale non diventa un giroconto', async () => {
    const rows = await plan([imported({ description: 'Esselunga Milano', amountMinor: -4210 })]);
    expect(rows[0]?.transfer).toBe(false);
    expect(rows[0]?.categoryId).not.toBe(transferCategory?.id);
  });

  it('salvato come giroconto: non conta come spesa nei totali ma muove il saldo', async () => {
    const rows = await plan([
      imported({ description: 'Bonifico a TRADE REPUBLIC', amountMinor: -50000 }),
      imported({ line: 3, description: 'Esselunga Milano', amountMinor: -4210 }),
    ]);
    const { after } = run(rows);
    const bank = after.transactions.find((t) => t.amount_minor === -50000);
    expect(bank?.transfer_group_id).toBeTruthy();
    expect(bank?.category_id).toBe(transferCategory?.id);
    // Nei totali solo la spesa vera: 42,10 €
    expect(totalsMinor(after.transactions).expenseMinor).toBe(4210);
    // Il saldo scende di entrambe
    expect(after.transactions.reduce((sum, t) => sum + t.amount_minor, 0)).toBe(-54210);
  });
});

describe('giroconto scelto a mano in anteprima', () => {
  it('una riga qualsiasi può essere segnata come giroconto', async () => {
    const rows = await plan([
      imported({ description: 'Operazione sconosciuta', amountMinor: -10000 }),
    ]);
    expect(rows[0]?.transfer).toBe(false);
    const edited = rows.map((r) => ({
      ...r,
      transfer: true,
      categoryId: transferCategory?.id ?? null,
    }));
    const { after } = run(edited);
    expect(after.transactions[0]?.transfer_group_id).toBeTruthy();
    expect(totalsMinor(after.transactions).expenseMinor).toBe(0);
  });

  it('con "ricorda" si crea una regola verso Trasferimento che vale dal prossimo estratto', async () => {
    const rows = await plan([
      imported({ description: 'Mario Rossi giroconto personale altro', amountMinor: -10000 }),
    ]);
    const edited = rows.map((r) => ({
      ...r,
      description: 'Bonifico a Mario Rossi',
      transfer: true,
      categoryId: transferCategory?.id ?? null,
      learnPattern: 'mario rossi',
    }));
    // senza regole iniziali, così non fa da sfondo
    const bare: Dataset = { ...dataset, categorizationRules: [] };
    const { built, after } = run(edited, bare);
    const learned = built.changes.categorizationRules?.insert?.[0];
    expect(learned).toMatchObject({
      pattern: 'mario rossi',
      category_id: transferCategory?.id,
      source: 'learned',
    });

    // Il mese dopo la stessa descrizione è già un giroconto
    const next = await plan(
      [
        imported({
          description: 'Bonifico a MARIO ROSSI',
          amountMinor: -20000,
          date: '2026-10-02',
        }),
      ],
      after,
    );
    expect(next[0]).toMatchObject({ transfer: true, categoryId: transferCategory?.id });
  });

  it('senza la categoria Trasferimento l’import segnala il problema e non salva nulla', async () => {
    const withoutTransfer: Dataset = {
      ...dataset,
      categories: categories.filter((c) => c.kind !== 'transfer'),
    };
    const rows = (await plan([imported({ description: 'Operazione', amountMinor: -100 })])).map(
      (r) => ({ ...r, transfer: true }),
    );
    const built = buildImport(
      {
        accountId: 'acc-fineco',
        parserId: 'fineco',
        filename: 'f.xlsx',
        fileHash: 'h',
        rows,
        dataset: withoutTransfer,
      },
      NOW,
      newId,
    );
    expect(built).toEqual({ ok: false, rowIssues: [{ key: 0, issue: 'transfer_category' }] });
  });
});

describe('regole iniziali dei giroconti', () => {
  it('senza categoria Trasferimento non si creano', () => {
    expect(
      buildTransferRules(
        categories.filter((c) => c.kind !== 'transfer'),
        NOW,
        newId,
      ),
    ).toEqual([]);
  });

  it('chi aveva già le altre regole iniziali le riceve una sola volta', async () => {
    const script = createScript();
    const client = new ScriptClient({
      url: 'https://script.google.com/macros/s/TEST/exec',
      getKey: () => TEST_SECRET,
      fetchFn: script.fetchFn,
      sleep: async () => {},
    });
    const repo = new ScriptRepository(client);
    const first = await loadAll(client, repo);
    // Simula un'app precedente: regole iniziali già presenti, ma non quelle dei giroconti
    const sheetTransfer = first.categories.find((c) => c.kind === 'transfer');
    const transferRuleIds = first.categorizationRules
      .filter((r) => r.category_id === sheetTransfer?.id)
      .map((r) => r.id);
    expect(transferRuleIds).toHaveLength(6);
    const without = first.categorizationRules.filter((r) => !transferRuleIds.includes(r.id));
    await repo.save({
      categorizationRules: {
        update: first.categorizationRules
          .filter((r) => transferRuleIds.includes(r.id))
          .map((r) => ({ ...r, deleted: true })),
      },
      meta: { default_transfer_rules_seeded: '0' },
    });

    const second = await loadAll(client, new ScriptRepository(client));
    expect(second.categorizationRules.length).toBe(without.length + transferRuleIds.length);
    expect(second.categorizationRules.some((r) => r.pattern === 'trade republic')).toBe(true);

    const third = await loadAll(client, new ScriptRepository(client));
    expect(third.categorizationRules.length).toBe(second.categorizationRules.length);
  });
});
