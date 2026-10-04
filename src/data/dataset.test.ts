import { describe, expect, it } from 'vitest';
import { applyChanges } from './dataset';
import type { Dataset } from './repository';
import type { Account } from './schema';

const TS = '2026-01-02T03:04:05.000Z';
const account = (id: string, name: string, deleted = false): Account => ({
  id,
  created_at: TS,
  updated_at: TS,
  deleted,
  name,
  institution: '',
  type: 'checking',
  currency: 'EUR',
  opening_balance_minor: 0,
  opening_date: '2026-01-01',
  is_archived: false,
});

const empty: Dataset = {
  accounts: [],
  categories: [],
  transactions: [],
  fxRates: [],
  assets: [],
  investmentTransactions: [],
  priceHistory: [],
  importBatches: [],
  categorizationRules: [],
  meta: { schema_version: '1' },
};

describe('applyChanges', () => {
  const start: Dataset = { ...empty, accounts: [account('a', 'Uno'), account('b', 'Due')] };

  it('aggiunge le righe inserite in coda', () => {
    const result = applyChanges(start, { accounts: { insert: [account('c', 'Tre')] } });
    expect(result.accounts.map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('sostituisce per id le righe modificate, mantenendo l’ordine', () => {
    const result = applyChanges(start, { accounts: { update: [account('a', 'Uno bis')] } });
    expect(result.accounts.map((a) => a.name)).toEqual(['Uno bis', 'Due']);
  });

  it('una riga cancellata logicamente esce dai dati attivi', () => {
    const result = applyChanges(start, { accounts: { update: [account('a', 'Uno', true)] } });
    expect(result.accounts.map((a) => a.id)).toEqual(['b']);
  });

  it('inserimenti e modifiche insieme', () => {
    const result = applyChanges(start, {
      accounts: { insert: [account('c', 'Tre')], update: [account('b', 'Due bis')] },
    });
    expect(result.accounts.map((a) => a.name)).toEqual(['Uno', 'Due bis', 'Tre']);
  });

  it('unisce i valori di _meta senza perdere quelli esistenti', () => {
    const result = applyChanges(start, { meta: { defaults_seeded: '1' } });
    expect(result.meta).toEqual({ schema_version: '1', defaults_seeded: '1' });
  });

  it('non modifica il dataset di partenza', () => {
    const snapshot = JSON.stringify(start);
    applyChanges(start, { accounts: { insert: [account('c', 'Tre')] }, meta: { x: '1' } });
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('senza modifiche restituisce gli stessi dati', () => {
    expect(applyChanges(start, {})).toEqual(start);
  });
});
