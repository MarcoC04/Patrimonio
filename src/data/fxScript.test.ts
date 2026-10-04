import { describe, expect, it } from 'vitest';
import { ScriptClient, ScriptError } from './scriptClient';
import { createScript, TEST_SECRET, type FxReply } from './testing/fakeAppsScript';

/** Azione `fx` di Code.gs e relativo client, con il servizio dei cambi simulato. */

const ok = (body: unknown): FxReply => ({ code: 200, body: JSON.stringify(body) });

describe('Code.gs: azione fx', () => {
  it('chiede al servizio solo base EUR, valute e data: nessun importo', () => {
    const script = createScript();
    const reply = script.call({ action: 'fx', date: '2026-03-13', symbols: ['USD', 'JPY'] });
    expect(reply).toEqual({
      ok: true,
      data: { date: '2026-03-13', rates: { USD: '1.1476', JPY: '182.85' } },
    });
    expect(script.fetchedUrls).toEqual([
      'https://api.frankfurter.dev/v1/2026-03-13?base=EUR&symbols=USD,JPY',
    ]);
  });

  it('per un giorno festivo il servizio restituisce l’ultimo precedente: la data è quella effettiva', () => {
    const script = createScript();
    // 2026-03-15 è una domenica → il tasso è quello di venerdì 13
    const reply = script.call({ action: 'fx', date: '2026-03-15', symbols: ['USD'] });
    expect(reply).toEqual({ ok: true, data: { date: '2026-03-13', rates: { USD: '1.1476' } } });
  });

  it('"latest" chiede l’ultimo tasso pubblicato', () => {
    const script = createScript();
    const reply = script.call({ action: 'fx', date: 'latest', symbols: ['GBP'] });
    expect(reply).toEqual({ ok: true, data: { date: '2026-10-02', rates: { GBP: '0.8561' } } });
    expect(script.fetchedUrls[0]).toContain('/v1/latest?base=EUR&symbols=GBP');
  });

  it('i tassi tornano come testo decimale esatto, non come numero', () => {
    const script = createScript();
    const data = (script.call({ action: 'fx', date: '2026-03-13', symbols: ['JPY'] }).data ??
      {}) as {
      rates: Record<string, unknown>;
    };
    expect(typeof data.rates['JPY']).toBe('string');
    expect(data.rates['JPY']).toBe('182.85');
  });

  it.each([
    ['data non valida', { date: '13/03/2026', symbols: ['USD'] }],
    ['data mancante', { symbols: ['USD'] }],
    ['nessuna valuta', { date: '2026-03-13', symbols: [] }],
    ['valute non in lista', { date: '2026-03-13', symbols: 'USD' }],
    ['codice minuscolo', { date: '2026-03-13', symbols: ['usd'] }],
    ['codice troppo lungo', { date: '2026-03-13', symbols: ['USDX'] }],
    ['tentativo di iniettare parametri', { date: '2026-03-13', symbols: ['USD&base=XXX'] }],
    ['troppe valute', { date: '2026-03-13', symbols: Array.from({ length: 21 }, () => 'USD') }],
  ])('rifiuta senza contattare il servizio: %s', (_label, request) => {
    const script = createScript();
    expect(script.call({ action: 'fx', ...request })).toEqual({ ok: false, error: 'bad_request' });
    expect(script.fetchedUrls).toEqual([]);
  });

  it('con una chiave sbagliata non contatta il servizio', () => {
    const script = createScript();
    expect(script.call({ action: 'fx', date: 'latest', symbols: ['USD'] }, 'sbagliata')).toEqual({
      ok: false,
      error: 'unauthorized',
    });
    expect(script.fetchedUrls).toEqual([]);
  });

  it.each<[string, FxReply]>([
    ['risposta non 200', { code: 500, body: 'errore' }],
    ['valuta sconosciuta (404)', { code: 404, body: '{"message":"not found"}' }],
    ['servizio non raggiungibile', new Error('timeout')],
    ['corpo non JSON', { code: 200, body: '<html>' }],
    ['senza data', ok({ rates: { USD: 1.1 } })],
    ['data non valida', ok({ date: 'ieri', rates: { USD: 1.1 } })],
    ['senza tassi', ok({ date: '2026-03-13' })],
    ['tasso mancante', ok({ date: '2026-03-13', rates: {} })],
    ['tasso zero', ok({ date: '2026-03-13', rates: { USD: 0 } })],
    ['tasso negativo', ok({ date: '2026-03-13', rates: { USD: -1.2 } })],
    ['tasso come testo', ok({ date: '2026-03-13', rates: { USD: '1.1' } })],
    ['tasso in notazione scientifica', ok({ date: '2026-03-13', rates: { USD: 1e-7 } })],
  ])('risposta del servizio inaffidabile → fx_unavailable: %s', (_label, reply) => {
    const script = createScript({ fx: () => reply });
    expect(script.call({ action: 'fx', date: '2026-03-13', symbols: ['USD'] })).toEqual({
      ok: false,
      error: 'fx_unavailable',
    });
  });
});

describe('ScriptClient.fx', () => {
  const clientFor = (fetchFn: typeof fetch) =>
    new ScriptClient({
      url: 'https://script.google.com/macros/s/TEST/exec',
      getKey: () => TEST_SECRET,
      fetchFn,
      sleep: async () => {},
    });

  it('restituisce data effettiva e tassi', async () => {
    const script = createScript();
    await expect(clientFor(script.fetchFn).fx('2026-03-15', ['USD'])).resolves.toEqual({
      date: '2026-03-13',
      rates: { USD: '1.1476' },
    });
  });

  it('controlla gli argomenti prima di inviare qualsiasi richiesta', async () => {
    let requests = 0;
    const client = clientFor(async () => {
      requests++;
      return new Response('{}');
    });
    await expect(client.fx('oggi', ['USD'])).rejects.toMatchObject({ code: 'bad_request' });
    await expect(client.fx('latest', [])).rejects.toMatchObject({ code: 'bad_request' });
    await expect(client.fx('latest', ['usd'])).rejects.toMatchObject({ code: 'bad_request' });
    expect(requests).toBe(0);
  });

  it('uno script vecchio (non conosce "fx") dà un messaggio che chiede di aggiornarlo', async () => {
    const oldScript: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: false, error: 'bad_request' }));
    const error = await clientFor(oldScript)
      .fx('latest', ['USD'])
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScriptError);
    expect((error as ScriptError).code).toBe('fx_outdated');
    expect((error as ScriptError).message).toContain('versione 3');
  });

  it('un errore del servizio dei cambi arriva con un messaggio chiaro', async () => {
    const script = createScript({ fx: () => ({ code: 500, body: '' }) });
    const error = await clientFor(script.fetchFn)
      .fx('latest', ['USD'])
      .catch((e: unknown) => e);
    expect((error as ScriptError).code).toBe('fx_unavailable');
    expect((error as ScriptError).message).toMatch(/cambi/);
  });

  it('una risposta con forma inattesa è bad_response', async () => {
    const odd: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true, data: { date: 'x', rates: { USD: 5 } } }));
    await expect(clientFor(odd).fx('latest', ['USD'])).rejects.toMatchObject({
      code: 'bad_response',
    });
  });
});
