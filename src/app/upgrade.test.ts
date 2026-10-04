import { describe, expect, it } from 'vitest';
import {
  accountsTable,
  categoriesTable,
  fxRatesTable,
  metaTable,
  transactionsTable,
  type Account,
} from '../data/schema';
import { ScriptClient } from '../data/scriptClient';
import { ScriptRepository } from '../data/scriptRepository';
import { createScript, TEST_SECRET } from '../data/testing/fakeAppsScript';
import { loadAll } from './bootstrap';

/**
 * Un foglio creato prima degli investimenti ha solo le prime cinque schede. All'avvio le nuove si
 * creano da sole, senza toccare né perdere i dati esistenti. Dati sintetici.
 */

const TS = '2026-01-02T03:04:05.000Z';
const account: Account = {
  id: 'acc-1',
  created_at: TS,
  updated_at: TS,
  deleted: false,
  name: 'Conto di prova',
  institution: 'Banca finta',
  type: 'checking',
  currency: 'EUR',
  opening_balance_minor: 150000,
  opening_date: '2026-01-01',
  is_archived: false,
};

describe('aggiornamento di un foglio esistente', () => {
  it('crea le schede degli investimenti e conserva conti e metadati', async () => {
    const script = createScript();
    const client = new ScriptClient({
      url: 'https://script.google.com/macros/s/TEST/exec',
      getKey: () => TEST_SECRET,
      fetchFn: script.fetchFn,
      sleep: async () => {},
    });

    // Foglio "vecchio": solo le cinque schede di prima, con un conto e le categorie già create
    const oldTables = [metaTable, accountsTable, categoriesTable, transactionsTable, fxRatesTable];
    script.call({
      action: 'init',
      tabs: Object.fromEntries(oldTables.map((t) => [t.name, t.headers])),
    });
    script.call({
      action: 'append',
      appends: [
        {
          tab: '_meta',
          headers: metaTable.headers,
          rows: [
            ['schema_version', '1'],
            ['base_currency', 'EUR'],
            ['locale', 'it-IT'],
            ['defaults_seeded', '1'],
          ],
        },
        { tab: 'accounts', headers: accountsTable.headers, rows: [accountsTable.toRow(account)] },
      ],
    });
    expect(script.spreadsheet.sheets.has('assets')).toBe(false);

    const data = await loadAll(client, new ScriptRepository(client));

    // Le schede nuove ci sono, vuote; il conto di prima è intatto
    for (const tab of ['assets', 'investment_transactions', 'price_history']) {
      expect(script.spreadsheet.sheets.has(tab), `scheda ${tab}`).toBe(true);
    }
    expect(data.assets).toEqual([]);
    expect(data.investmentTransactions).toEqual([]);
    expect(data.priceHistory).toEqual([]);
    expect(data.accounts).toEqual([account]);
    expect(data.meta['defaults_seeded']).toBe('1');
  });
});
