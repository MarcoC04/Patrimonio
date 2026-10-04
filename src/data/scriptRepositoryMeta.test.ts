import { beforeEach, describe, expect, it } from 'vitest';
import { DataError } from './repository';
import type { Account } from './schema';
import { ScriptClient } from './scriptClient';
import { ScriptRepository } from './scriptRepository';
import { createScript, TEST_SECRET } from './testing/fakeAppsScript';

/** Scrittura dei valori di _meta tramite il Repository, sul finto foglio. Dati sintetici. */

const TS = '2026-01-02T03:04:05.000Z';
const account: Account = {
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
};

function setup() {
  const script = createScript();
  let requests = 0;
  const client = new ScriptClient({
    url: 'https://script.google.com/macros/s/TEST/exec',
    getKey: () => TEST_SECRET,
    fetchFn: (input, init) => {
      requests++;
      return script.fetchFn(input, init);
    },
    sleep: async () => {},
  });
  return { repo: new ScriptRepository(client), requests: () => requests };
}

describe('ScriptRepository: _meta', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(async () => {
    ctx = setup();
    await ctx.repo.init();
    await ctx.repo.load();
  });

  it('un valore nuovo si aggiunge, uno esistente si aggiorna, nella stessa richiesta del resto', async () => {
    const before = ctx.requests();
    await ctx.repo.save({
      accounts: { insert: [account] },
      meta: { defaults_seeded: '1', locale: 'it-CH' }, // uno nuovo e uno già presente
    });
    expect(ctx.requests() - before).toBe(1);

    const data = await ctx.repo.load();
    expect(data.meta).toEqual({
      schema_version: '1',
      base_currency: 'EUR',
      locale: 'it-CH',
      defaults_seeded: '1',
    });
    expect(data.accounts).toHaveLength(1);
  });

  it('scrivere due volte lo stesso valore nuovo aggiorna invece di duplicare', async () => {
    await ctx.repo.save({ meta: { defaults_seeded: '1' } });
    await ctx.repo.save({ meta: { defaults_seeded: '2' } });
    const data = await ctx.repo.load();
    expect(data.meta['defaults_seeded']).toBe('2');
  });

  it('una chiave _meta vuota è rifiutata prima dell’invio', async () => {
    const before = ctx.requests();
    await expect(ctx.repo.save({ meta: { '': 'x' } })).rejects.toBeInstanceOf(DataError);
    expect(ctx.requests()).toBe(before);
  });
});
