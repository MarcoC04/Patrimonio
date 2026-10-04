import { describe, expect, it } from 'vitest';
import { loadAll } from '../app/bootstrap';
import { applyChanges } from './dataset';
import { createFxService } from './fxService';
import type { Dataset } from './repository';
import { ScriptClient } from './scriptClient';
import { ScriptRepository } from './scriptRepository';
import { createScript, TEST_SECRET } from './testing/fakeAppsScript';

/**
 * Servizio cambi con tutta la catena reale (servizio → script → client → Repository → foglio),
 * senza rete. "Oggi" è fissato al 20/03/2026 (un venerdì).
 */

const NOW = new Date(2026, 2, 20, 12, 0, 0);

async function setup(options: Parameters<typeof createScript>[0] = {}) {
  const script = createScript(options);
  const client = new ScriptClient({
    url: 'https://script.google.com/macros/s/TEST/exec',
    getKey: () => TEST_SECRET,
    fetchFn: script.fetchFn,
    sleep: async () => {},
  });
  const repo = new ScriptRepository(client);
  let data: Dataset = await loadAll(client, repo, NOW);

  let failSave = false;
  const service = createFxService({
    fetchRates: (date, symbols) => repo.fetchRates(date, symbols),
    cache: () => data.fxRates,
    save: async (changes) => {
      if (failSave) throw new Error('rete assente');
      await repo.save(changes);
      data = applyChanges(data, changes);
    },
    now: () => NOW,
  });
  return {
    service,
    script,
    repo,
    cache: () => data.fxRates,
    breakSaving: () => {
      failSave = true;
    },
  };
}

describe('rateFor', () => {
  it('chiede il tasso una volta, lo salva in cache (anche sul foglio) e poi non lo richiede più', async () => {
    const { service, script, repo, cache } = await setup();

    expect(await service.rateFor('2026-03-13', 'USD')).toBe('1.1476');
    expect(script.fetchedUrls).toHaveLength(1);
    expect(cache()).toHaveLength(1);
    expect(cache()[0]).toMatchObject({
      date: '2026-03-13',
      base_currency: 'EUR',
      quote_currency: 'USD',
      rate: '1.1476',
      source: 'frankfurter:2026-03-13',
    });

    expect(await service.rateFor('2026-03-13', 'USD')).toBe('1.1476');
    expect(script.fetchedUrls).toHaveLength(1); // cache: nessuna nuova richiesta

    const persisted = await repo.load();
    expect(persisted.fxRates).toHaveLength(1); // è nel foglio, non solo in memoria
  });

  it('per un weekend usa il tasso del venerdì e ricorda la data effettiva', async () => {
    const { service, script, cache } = await setup();
    // 14/03/2026 è un sabato → il servizio risponde con il tasso di venerdì 13
    expect(await service.rateFor('2026-03-14', 'USD')).toBe('1.1476');
    expect(cache()[0]).toMatchObject({ date: '2026-03-14', source: 'frankfurter:2026-03-13' });
    await service.rateFor('2026-03-14', 'USD');
    expect(script.fetchedUrls).toHaveLength(1); // lo stesso sabato non si richiede due volte
  });

  it('l’euro vale sempre 1, senza richieste', async () => {
    const { service, script } = await setup();
    expect(await service.rateFor('2026-03-13', 'EUR')).toBe('1');
    expect(script.fetchedUrls).toHaveLength(0);
  });

  it('una data futura usa il tasso di oggi (l’ultimo disponibile)', async () => {
    const { service, script, cache } = await setup();
    expect(await service.rateFor('2026-04-15', 'USD')).toBe('1.1476');
    expect(script.fetchedUrls[0]).toContain('/v1/2026-03-20?'); // non la data futura
    expect(cache()[0]?.date).toBe('2026-03-20');
  });

  it('una valuta sconosciuta al servizio dà un errore chiaro e non sporca la cache', async () => {
    const { service, cache } = await setup();
    const error = await service.rateFor('2026-03-13', 'XXX').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'fx_unavailable' });
    expect(cache()).toEqual([]);
  });

  it('richieste identiche in parallelo condividono una sola richiesta e una sola riga in cache', async () => {
    const { service, script, cache } = await setup();
    const results = await Promise.all([
      service.rateFor('2026-03-13', 'JPY'),
      service.rateFor('2026-03-13', 'JPY'),
      service.rateFor('2026-03-13', 'JPY'),
    ]);
    expect(results).toEqual(['182.85', '182.85', '182.85']);
    expect(script.fetchedUrls).toHaveLength(1);
    expect(cache()).toHaveLength(1);
  });

  it('se non riesce a scrivere la cache, il tasso resta valido', async () => {
    const { service, breakSaving, cache } = await setup();
    breakSaving();
    expect(await service.rateFor('2026-03-13', 'USD')).toBe('1.1476');
    expect(cache()).toEqual([]);
  });

  it('valute diverse alla stessa data sono righe diverse', async () => {
    const { service, cache } = await setup();
    await service.rateFor('2026-03-13', 'USD');
    await service.rateFor('2026-03-13', 'JPY');
    expect(cache().map((r) => r.quote_currency)).toEqual(['USD', 'JPY']);
  });
});

describe('latestRates', () => {
  it('una sola richiesta per tutte le valute mancanti; l’euro vale 1; poi cache', async () => {
    const { service, script, cache } = await setup();
    const rates = await service.latestRates(['USD', 'JPY', 'EUR', 'USD']);
    expect(rates).toEqual({ EUR: '1', USD: '1.1476', JPY: '182.85' });
    expect(script.fetchedUrls).toHaveLength(1);
    expect(script.fetchedUrls[0]).toContain('/v1/latest?base=EUR&symbols=USD,JPY');
    // in cache con la data di oggi, e la data effettiva del tasso in source
    expect(cache().map((r) => [r.date, r.quote_currency, r.source])).toEqual([
      ['2026-03-20', 'USD', 'frankfurter:2026-10-02'],
      ['2026-03-20', 'JPY', 'frankfurter:2026-10-02'],
    ]);

    await service.latestRates(['USD', 'JPY']);
    expect(script.fetchedUrls).toHaveLength(1); // tutto in cache
  });

  it('chiede solo le valute che mancano', async () => {
    const { service, script } = await setup();
    await service.latestRates(['USD']);
    await service.latestRates(['USD', 'GBP']);
    expect(script.fetchedUrls).toHaveLength(2);
    expect(script.fetchedUrls[1]).toContain('symbols=GBP');
    expect(script.fetchedUrls[1]).not.toContain('USD');
  });

  it('solo euro: nessuna richiesta', async () => {
    const { service, script } = await setup();
    expect(await service.latestRates(['EUR'])).toEqual({ EUR: '1' });
    expect(await service.latestRates([])).toEqual({ EUR: '1' });
    expect(script.fetchedUrls).toHaveLength(0);
  });

  it('se una valuta non è disponibile lancia un errore chiaro', async () => {
    const { service } = await setup();
    await expect(service.latestRates(['USD', 'XXX'])).rejects.toMatchObject({
      code: 'fx_unavailable',
    });
  });
});
