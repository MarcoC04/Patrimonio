import { describe, expect, it } from 'vitest';
import { applyChanges } from '../data/dataset';
import { createFxService } from '../data/fxService';
import type { Dataset } from '../data/repository';
import { ScriptClient } from '../data/scriptClient';
import { ScriptRepository } from '../data/scriptRepository';
import { createScript, TEST_SECRET } from '../data/testing/fakeAppsScript';
import { createAccount } from '../domain/accounts';
import { liquidityBase, netWorthBase } from '../domain/dashboard';
import { totalsMinor } from '../domain/ledger';
import { createMovement } from '../domain/movements';
import { loadAll } from './bootstrap';

/**
 * Percorso completo di un conto in dollari, senza rete: servizio dei cambi → script → Repository →
 * foglio → rilettura → patrimonio. Dati sintetici. "Oggi" è il 20/03/2026.
 */

const NOW = new Date(2026, 2, 20, 12, 0, 0);

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
  const save: (changes: Parameters<ScriptRepository['save']>[0]) => Promise<void> = async (c) => {
    await repo.save(c);
    data = applyChanges(data, c);
  };
  const fx = createFxService({
    fetchRates: (date, symbols) => repo.fetchRates(date, symbols),
    cache: () => data.fxRates,
    save,
    now: () => NOW,
  });
  return { repo, fx, save, script, data: () => data };
}

describe('conto in dollari: dal movimento al patrimonio', () => {
  it('salva lo snapshot in EUR al tasso del giorno e rivaluta il patrimonio al tasso più recente', async () => {
    const { repo, fx, save, data } = await setup();

    // Conto USD con 1.000,00 USD
    const account = createAccount(
      {
        name: 'Conto dollari',
        institution: '',
        type: 'checking',
        currency: 'USD',
        openingBalanceText: '1000,00',
        openingDate: '2026-01-01',
      },
      data().accounts,
      NOW,
      () => 'acc-usd',
    );
    if (!account.ok) throw new Error('conto di prova non valido');
    await save({ accounts: { insert: [account.value] } });

    // Spesa di 100,00 USD il 13/03/2026: tasso del giorno 1,1476
    const rate = await fx.rateFor('2026-03-13', 'USD');
    expect(rate).toBe('1.1476');
    const expense = createMovement(
      {
        kind: 'expense',
        amountText: '100,00',
        date: '2026-03-13',
        accountId: 'acc-usd',
        categoryId: null,
        description: 'Spesa di prova',
        notes: '',
        fxRate: rate,
      },
      { accounts: data().accounts, categories: data().categories },
      NOW,
      () => 'tx-usd',
    );
    if (!expense.ok) throw new Error('movimento di prova non valido');
    await save({ transactions: { insert: [expense.value] } });

    // Rilettura dal foglio: lo snapshot persiste
    const reloaded = await repo.load();
    expect(reloaded.transactions).toHaveLength(1);
    expect(reloaded.transactions[0]).toMatchObject({
      currency: 'USD',
      amount_minor: -10000, // −100,00 USD
      fx_rate: '1.1476',
      amount_base_minor: -8714, // 100 / 1,1476 = 87,1383… → 87,14 €
    });
    expect(reloaded.fxRates).toHaveLength(1); // il tasso è in cache, anche sul foglio

    // Le spese del periodo contano lo snapshot in EUR, non l'importo in dollari
    expect(totalsMinor(reloaded.transactions)).toEqual({
      incomeMinor: 0,
      expenseMinor: 8714,
      netMinor: -8714,
    });

    // Patrimonio: saldo 1.000 − 100 = 900,00 USD, rivalutato all'ultimo tasso (1,1476):
    // 900 / 1,1476 = 784,2453… → 784,25 € (78425 cent)
    const latest = await fx.latestRates(['USD']);
    expect(latest).toEqual({ EUR: '1', USD: '1.1476' });
    const today = '2026-03-20';
    expect(netWorthBase(reloaded.accounts, reloaded.transactions, today, latest)).toEqual({
      totalMinor: 78425,
      missing: [],
    });
    expect(liquidityBase(reloaded.accounts, reloaded.transactions, today, latest).totalMinor).toBe(
      78425,
    );

    // Senza i tassi il conto non si inventa: escluso e segnalato
    expect(netWorthBase(reloaded.accounts, reloaded.transactions, today, {})).toEqual({
      totalMinor: 0,
      missing: ['USD'],
    });
  });

  it('un weekend usa il tasso di venerdì e la richiesta non si ripete', async () => {
    const { fx, script } = await setup();
    // 15/03/2026 è domenica: il tasso è quello di venerdì 13
    expect(await fx.rateFor('2026-03-15', 'JPY')).toBe('182.85');
    expect(await fx.rateFor('2026-03-15', 'JPY')).toBe('182.85');
    expect(script.fetchedUrls).toHaveLength(1);
    expect(script.fetchedUrls[0]).toContain('/v1/2026-03-15?base=EUR&symbols=JPY');
  });
});
