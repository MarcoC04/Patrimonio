import { describe, expect, it } from 'vitest';
import {
  accountsTable,
  categoriesTable,
  fxRatesTable,
  metaTable,
  transactionsTable,
} from './schema';

const TS = '2026-01-02T03:04:05.000Z';
const common = { id: 'id-1', created_at: TS, updated_at: TS, deleted: '0' };

// Dati sintetici inventati: nessun dato reale.
const account = {
  ...common,
  name: 'Conto di prova',
  institution: 'Banca finta',
  type: 'checking',
  currency: 'EUR',
  opening_balance_minor: '150000', // 1.500,00 €
  opening_date: '2026-01-01',
  is_archived: '0',
};

const transaction = {
  ...common,
  account_id: 'acc-1',
  date: '2026-03-15',
  description: 'Spesa di prova',
  raw_description: '',
  amount_minor: '-1234', // uscita di 12,34 €
  currency: 'EUR',
  fx_rate: '1',
  amount_base_minor: '-1234',
  category_id: '',
  transfer_group_id: '',
  recurring_rule_id: '',
  import_batch_id: '',
  dedupe_hash: '',
  notes: '',
};

describe('accountsTable', () => {
  it('legge una riga valida convertendo i tipi', () => {
    const result = accountsTable.parse(account);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.opening_balance_minor).toBe(150000);
    expect(result.value.deleted).toBe(false);
    expect(result.value.is_archived).toBe(false);
    expect(result.value.type).toBe('checking');
  });

  it('le intestazioni sono nell’ordine dell’architettura, con le colonne comuni per prime', () => {
    expect(accountsTable.headers).toEqual([
      'id',
      'created_at',
      'updated_at',
      'deleted',
      'name',
      'institution',
      'type',
      'currency',
      'opening_balance_minor',
      'opening_date',
      'is_archived',
    ]);
  });

  it('lettura e scrittura sono inverse: la riga riletta è identica', () => {
    const parsed = accountsTable.parse(account);
    if (!parsed.ok) throw new Error('riga di prova non valida');
    expect(accountsTable.toRow(parsed.value)).toEqual(accountsTable.headers.map((h) => account[h]));
  });

  it.each([
    ['opening_date', '2026-02-30'], // giorno inesistente
    ['opening_date', '01/02/2026'], // formato non ISO
    ['opening_balance_minor', '12,5'], // non è un intero in centesimi
    ['opening_balance_minor', '12.5'],
    ['type', 'conto'], // fuori elenco
    ['is_archived', '2'],
    ['deleted', 'si'],
    ['currency', 'eur'], // deve essere maiuscolo
    ['currency', 'EURO'],
    ['created_at', '2026-01-02T03:04:05'], // senza Z: non è UTC esplicito
    ['name', ''], // obbligatorio
    ['id', ''],
  ])('rifiuta %s = "%s" e indica solo la colonna', (column, bad) => {
    const result = accountsTable.parse({ ...account, [column]: bad });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.columns).toEqual([column]);
  });

  it('i messaggi non riportano mai il valore sbagliato', () => {
    const result = accountsTable.parse({ ...account, opening_balance_minor: 'IBAN-SEGRETO' });
    expect(JSON.stringify(result)).not.toContain('IBAN-SEGRETO');
  });

  it('segnala tutte le colonne sbagliate insieme', () => {
    const result = accountsTable.parse({ ...account, type: 'x', opening_date: 'y' });
    expect(result).toEqual({ ok: false, columns: ['type', 'opening_date'] });
  });

  it('una cella mancante equivale a vuota', () => {
    const incomplete: Record<string, string> = { ...account };
    delete incomplete['name'];
    expect(accountsTable.parse(incomplete)).toEqual({ ok: false, columns: ['name'] });
  });
});

describe('transactionsTable', () => {
  it('i riferimenti opzionali vuoti diventano null e tornano vuoti', () => {
    const parsed = transactionsTable.parse(transaction);
    if (!parsed.ok) throw new Error('riga di prova non valida');
    expect(parsed.value.category_id).toBeNull();
    expect(parsed.value.transfer_group_id).toBeNull();
    expect(parsed.value.amount_minor).toBe(-1234);
    expect(transactionsTable.toRow(parsed.value)).toEqual(
      transactionsTable.headers.map((h) => transaction[h]),
    );
  });

  it('un riferimento valorizzato resta tale', () => {
    const parsed = transactionsTable.parse({ ...transaction, category_id: 'cat-1' });
    if (!parsed.ok) throw new Error('riga di prova non valida');
    expect(parsed.value.category_id).toBe('cat-1');
  });

  it('il tasso di cambio è un decimale esatto maggiore di zero', () => {
    for (const ok of ['1', '1.0852', '0.5']) {
      expect(transactionsTable.parse({ ...transaction, fx_rate: ok }).ok).toBe(true);
    }
    for (const bad of ['0', '0.0', '-1', '1,08', '', 'abc']) {
      expect(transactionsTable.parse({ ...transaction, fx_rate: bad })).toEqual({
        ok: false,
        columns: ['fx_rate'],
      });
    }
  });

  it('gli importi accettano il segno ma non i decimali', () => {
    expect(transactionsTable.parse({ ...transaction, amount_minor: '500' }).ok).toBe(true);
    expect(transactionsTable.parse({ ...transaction, amount_minor: '-500' }).ok).toBe(true);
    expect(transactionsTable.parse({ ...transaction, amount_minor: '5.00' }).ok).toBe(false);
  });

  it('rifiuta importi oltre il range sicuro', () => {
    const result = transactionsTable.parse({
      ...transaction,
      amount_minor: '99999999999999999999',
    });
    expect(result).toEqual({ ok: false, columns: ['amount_minor'] });
  });
});

describe('altre tabelle', () => {
  it('categories: tipo ammesso e genitore opzionale', () => {
    const raw = {
      ...common,
      name: 'Alimentari',
      parent_id: '',
      kind: 'expense',
      color: '#0f766e',
      icon: '',
    };
    expect(categoriesTable.parse(raw).ok).toBe(true);
    expect(categoriesTable.parse({ ...raw, kind: 'spesa' }).ok).toBe(false);
  });

  it('fx_rates: tasso positivo e data reale', () => {
    const raw = {
      ...common,
      date: '2026-03-15',
      base_currency: 'EUR',
      quote_currency: 'USD',
      rate: '1.0852',
      source: 'frankfurter',
      fetched_at: TS,
    };
    expect(fxRatesTable.parse(raw).ok).toBe(true);
    expect(fxRatesTable.parse({ ...raw, rate: '0' }).ok).toBe(false);
  });

  it('_meta: chiave obbligatoria, valore libero', () => {
    expect(metaTable.parse({ key: 'schema_version', value: '1' }).ok).toBe(true);
    expect(metaTable.parse({ key: '', value: '1' }).ok).toBe(false);
  });
});
