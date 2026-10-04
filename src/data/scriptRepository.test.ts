import { beforeEach, describe, expect, it } from 'vitest';
import { DataError, softDelete } from './repository';
import { SchemaError } from './rows';
import {
  accountsTable,
  SCHEMA_VERSION,
  type Account,
  type Category,
  type Transaction,
} from './schema';
import { ScriptClient, ScriptError } from './scriptClient';
import { ScriptRepository } from './scriptRepository';
import { createScript, TEST_SECRET } from './testing/fakeAppsScript';

/**
 * Collaudo dell'intera catena senza rete: Repository → ScriptClient → Code.gs reale → finto foglio.
 * Dati sintetici inventati.
 */

const TS = '2026-01-02T03:04:05.000Z';
const common = { created_at: TS, updated_at: TS, deleted: false };

const account = (overrides: Partial<Account> = {}): Account => ({
  ...common,
  id: 'acc-1',
  name: 'Conto di prova',
  institution: 'Banca finta',
  type: 'checking',
  currency: 'EUR',
  opening_balance_minor: 150000, // 1.500,00 €
  opening_date: '2026-01-01',
  is_archived: false,
  ...overrides,
});

const category = (overrides: Partial<Category> = {}): Category => ({
  ...common,
  id: 'cat-1',
  name: 'Alimentari',
  parent_id: null,
  kind: 'expense',
  color: '#0f766e',
  icon: '',
  ...overrides,
});

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  ...common,
  id: 'tx-1',
  account_id: 'acc-1',
  date: '2026-03-15',
  description: 'Spesa di prova',
  raw_description: '',
  amount_minor: -1234, // uscita di 12,34 €
  currency: 'EUR',
  fx_rate: '1',
  amount_base_minor: -1234,
  category_id: 'cat-1',
  transfer_group_id: null,
  recurring_rule_id: null,
  import_batch_id: null,
  dedupe_hash: null,
  notes: '',
  ...overrides,
});

function setup() {
  const script = createScript();
  let requests = 0;
  const fetchFn: typeof fetch = (input, init) => {
    requests++;
    return script.fetchFn(input, init);
  };
  const client = new ScriptClient({
    url: 'https://script.google.com/macros/s/TEST/exec',
    getKey: () => TEST_SECRET,
    fetchFn,
    sleep: async () => {},
  });
  const repo = new ScriptRepository(client);
  return { script, repo, requests: () => requests };
}

describe('ScriptRepository.init', () => {
  it('crea tutte le schede e i valori di _meta; ripetuto non cambia nulla', async () => {
    const { script, repo } = setup();
    await repo.init();

    expect([...script.spreadsheet.sheets.keys()].sort()).toEqual(
      ['_meta', 'accounts', 'categories', 'fx_rates', 'transactions'].sort(),
    );
    const meta = (script.call({ action: 'read', tabs: ['_meta'] }).data as { _meta: string[][] })
      ._meta;
    expect(meta).toEqual([
      ['key', 'value'],
      ['schema_version', SCHEMA_VERSION],
      ['base_currency', 'EUR'],
      ['locale', 'it-IT'],
    ]);

    await repo.init(); // seconda volta: nessun duplicato, nessun errore
    const again = (script.call({ action: 'read', tabs: ['_meta'] }).data as { _meta: string[][] })
      ._meta;
    expect(again).toEqual(meta);
  });

  it('completa solo i valori mancanti di _meta', async () => {
    const { script, repo } = setup();
    await repo.init();
    // Simula un _meta con il solo schema_version: riscrive il foglio da zero
    const sheet = script.spreadsheet.getSheetByName('_meta');
    sheet?.setCell(3, 1, '');
    sheet?.setCell(3, 2, '');
    sheet?.setCell(4, 1, '');
    sheet?.setCell(4, 2, '');
    await repo.init();
    const rows = (script.call({ action: 'read', tabs: ['_meta'] }).data as { _meta: string[][] })
      ._meta;
    expect(rows.map((r) => r[0])).toEqual(['key', 'schema_version', 'base_currency', 'locale']);
  });
});

describe('ScriptRepository.load e save', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(async () => {
    ctx = setup();
    await ctx.repo.init();
  });

  it('un foglio appena creato dà un dataset vuoto', async () => {
    const data = await ctx.repo.load();
    expect(data).toEqual({
      accounts: [],
      categories: [],
      transactions: [],
      fxRates: [],
      meta: { schema_version: '1', base_currency: 'EUR', locale: 'it-IT' },
    });
  });

  it('la lettura è una sola richiesta per tutte le schede', async () => {
    const before = ctx.requests();
    await ctx.repo.load();
    expect(ctx.requests() - before).toBe(1);
  });

  it('salva più tabelle in una sola richiesta e le rilegge con i tipi giusti', async () => {
    await ctx.repo.load();
    const before = ctx.requests();

    await ctx.repo.save({
      accounts: { insert: [account()] },
      categories: { insert: [category()] },
      transactions: { insert: [transaction()] },
    });
    expect(ctx.requests() - before).toBe(1);

    const data = await ctx.repo.load();
    expect(data.accounts).toEqual([account()]);
    expect(data.categories).toEqual([category()]);
    expect(data.transactions).toEqual([transaction()]);
    expect(data.transactions[0]?.amount_minor).toBe(-1234); // numero intero, non stringa
    expect(data.transactions[0]?.transfer_group_id).toBeNull();
  });

  it('modifica una riga per id senza toccare le altre', async () => {
    await ctx.repo.load();
    await ctx.repo.save({
      accounts: { insert: [account(), account({ id: 'acc-2', name: 'Secondo conto' })] },
    });
    await ctx.repo.save({
      accounts: {
        update: [account({ name: 'Conto rinominato', updated_at: '2026-02-01T00:00:00.000Z' })],
      },
    });

    const { accounts } = await ctx.repo.load();
    expect(accounts.map((a) => [a.id, a.name])).toEqual([
      ['acc-1', 'Conto rinominato'],
      ['acc-2', 'Secondo conto'],
    ]);
  });

  it('cancellazione logica: sparisce dal dataset ma resta nel foglio con deleted=1', async () => {
    await ctx.repo.load();
    await ctx.repo.save({ accounts: { insert: [account()] } });
    await ctx.repo.save({
      accounts: { update: [softDelete(account(), new Date('2026-02-01T00:00:00.000Z'))] },
    });

    expect((await ctx.repo.load()).accounts).toEqual([]);
    const rows = (
      ctx.script.call({ action: 'read', tabs: ['accounts'] }).data as {
        accounts: string[][];
      }
    ).accounts;
    expect(rows).toHaveLength(2); // intestazione + la riga cancellata logicamente
    expect(rows[1]?.[accountsTable.headers.indexOf('deleted')]).toBe('1');
    expect(rows[1]?.[accountsTable.headers.indexOf('updated_at')]).toBe('2026-02-01T00:00:00.000Z');
  });

  it('nessuna modifica → nessuna richiesta', async () => {
    await ctx.repo.load();
    const before = ctx.requests();
    await ctx.repo.save({});
    await ctx.repo.save({ accounts: { insert: [], update: [] } });
    expect(ctx.requests()).toBe(before);
  });
});

describe('ScriptRepository: garanzie di sicurezza', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(async () => {
    ctx = setup();
    await ctx.repo.init();
  });

  it('non scrive se i dati non sono mai stati letti e validati', async () => {
    const before = ctx.requests();
    await expect(ctx.repo.save({ accounts: { insert: [account()] } })).rejects.toBeInstanceOf(
      DataError,
    );
    expect(ctx.requests()).toBe(before);
  });

  it('non invia al foglio un’entità non valida', async () => {
    await ctx.repo.load();
    const before = ctx.requests();
    await expect(
      ctx.repo.save({ accounts: { insert: [account({ currency: 'eur' })] } }),
    ).rejects.toMatchObject({ name: 'DataError', message: expect.stringContaining('currency') });
    expect(ctx.requests()).toBe(before); // nemmeno una richiesta
  });

  it('un insieme di modifiche è atomico: se una parte fallisce non si scrive nulla', async () => {
    await ctx.repo.load();
    // Inserimento valido + modifica di una riga che non esiste → lo script rifiuta tutto
    const error = await ctx.repo
      .save({
        accounts: { insert: [account()] },
        transactions: { update: [transaction({ id: 'non-esiste' })] },
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScriptError);
    expect((error as ScriptError).code).toBe('not_found');
    expect((await ctx.repo.load()).accounts).toEqual([]); // nemmeno il conto valido
  });

  it('rifiuta un id già esistente senza duplicare la riga', async () => {
    await ctx.repo.load();
    await ctx.repo.save({ accounts: { insert: [account()] } });
    await expect(ctx.repo.save({ accounts: { insert: [account()] } })).rejects.toMatchObject({
      code: 'duplicate_id',
    });
    expect((await ctx.repo.load()).accounts).toHaveLength(1);
  });

  it('un dato non valido nel foglio blocca la lettura, indica solo la posizione e blocca le scritture', async () => {
    await ctx.repo.load();
    await ctx.repo.save({ accounts: { insert: [account()] } });
    // Modifica a mano nel foglio: data inesistente e valore segreto nell'importo
    const sheet = ctx.script.spreadsheet.getSheetByName('accounts');
    sheet?.setCell(2, accountsTable.headers.indexOf('opening_date') + 1, '2026-02-30');
    sheet?.setCell(2, accountsTable.headers.indexOf('opening_balance_minor') + 1, 'IBAN-SEGRETO');

    const error = await ctx.repo.load().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    const dataError = error as DataError;
    expect(dataError.issues).toEqual([
      { table: 'accounts', row: 2, columns: ['opening_balance_minor', 'opening_date'] },
    ]);
    expect(dataError.message).toContain('"accounts"');
    expect(dataError.message).toContain('riga 2');
    expect(dataError.message).not.toContain('IBAN-SEGRETO');
    expect(dataError.message).not.toContain('2026-02-30');

    // La lettura fallita invalida la sessione: nessuna scrittura finché i dati non tornano validi
    await expect(
      ctx.repo.save({ accounts: { insert: [account({ id: 'x' })] } }),
    ).rejects.toBeInstanceOf(DataError);
  });

  it('segnala righe con lo stesso id', async () => {
    await ctx.repo.load();
    await ctx.repo.save({ accounts: { insert: [account(), account({ id: 'acc-2' })] } });
    const sheet = ctx.script.spreadsheet.getSheetByName('accounts');
    sheet?.setCell(3, 1, 'acc-1'); // la seconda riga prende l'id della prima
    await expect(ctx.repo.load()).rejects.toThrow(/stesso id/);
  });

  it('intestazioni modificate a mano: errore di struttura, nessuna scrittura', async () => {
    await ctx.repo.load();
    ctx.script.spreadsheet.getSheetByName('accounts')?.setCell(1, 5, 'nome-cambiato');
    await expect(ctx.repo.load()).rejects.toBeInstanceOf(SchemaError);
    await expect(ctx.repo.save({ accounts: { insert: [account()] } })).rejects.toBeInstanceOf(
      DataError,
    );
  });

  it('una versione di schema diversa blocca la lettura', async () => {
    ctx.script.spreadsheet.getSheetByName('_meta')?.setCell(2, 2, '999');
    await expect(ctx.repo.load()).rejects.toThrow(/versione dello schema/);
  });

  it('ignora le righe completamente vuote lasciate nel foglio', async () => {
    await ctx.repo.load();
    await ctx.repo.save({ accounts: { insert: [account()] } });
    const sheet = ctx.script.spreadsheet.getSheetByName('accounts');
    // riga 3 vuota in mezzo, poi una riga vera alla 4
    for (let c = 1; c <= accountsTable.headers.length; c++) {
      sheet?.setCell(4, c, accountsTable.toRow(account({ id: 'acc-9' }))[c - 1] ?? '');
    }
    const { accounts } = await ctx.repo.load();
    expect(accounts.map((a) => a.id)).toEqual(['acc-1', 'acc-9']);
  });
});
