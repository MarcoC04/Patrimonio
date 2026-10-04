import { describe, expect, it } from 'vitest';
import { softDelete } from './repository';
import type { Account } from './schema';
import { ScriptClient } from './scriptClient';
import { ScriptRepository } from './scriptRepository';
import { createScript, TEST_SECRET } from './testing/fakeAppsScript';

const TS = '2026-01-02T03:04:05.000Z';
const account = (id: string, name: string): Account => ({
  id,
  created_at: TS,
  updated_at: TS,
  deleted: false,
  name,
  institution: '',
  type: 'checking',
  currency: 'EUR',
  opening_balance_minor: 0,
  opening_date: '2026-01-01',
  is_archived: false,
});

describe('ScriptRepository.exportAll', () => {
  it('restituisce tutte le schede grezze, comprese le righe cancellate logicamente, in una richiesta', async () => {
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
    const repo = new ScriptRepository(client);
    await repo.init();
    await repo.load();
    await repo.save({ accounts: { insert: [account('a', 'Uno'), account('b', 'Due')] } });
    await repo.save({ accounts: { update: [softDelete(account('b', 'Due'))] } });

    const before = requests;
    const tabs = await repo.exportAll();
    expect(requests - before).toBe(1);

    expect(Object.keys(tabs).sort()).toEqual(
      ['_meta', 'accounts', 'categories', 'fx_rates', 'transactions'].sort(),
    );
    const accounts = tabs['accounts'] ?? [];
    expect(accounts[0]?.[0]).toBe('id'); // intestazioni incluse
    expect(accounts).toHaveLength(3); // intestazione + 2 righe, anche quella cancellata
    const deletedColumn = (accounts[0] ?? []).indexOf('deleted');
    expect(accounts.slice(1).map((row) => row[deletedColumn])).toEqual(['0', '1']);
    // I dati restano interi: il testo si legge come nel foglio
    expect(accounts[1]?.[(accounts[0] ?? []).indexOf('name')]).toBe('Uno');
  });
});
