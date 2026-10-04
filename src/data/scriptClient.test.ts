import { describe, expect, it } from 'vitest';
import { HttpError } from './retry';
import { messageForScriptError, messageForStatus, ScriptClient, ScriptError } from './scriptClient';

const URL = 'https://script.google.com/macros/s/ID-FINTO/exec';

interface Call {
  url: string;
  method: string;
  contentType: string | null;
  body: Record<string, unknown>;
}

type Reply = { status?: number; json?: unknown; text?: string };

/** Risponde con le risposte in coda, nell'ordine; registra le chiamate. */
function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      contentType: new Headers(init?.headers).get('Content-Type'),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    const next = replies.shift();
    if (!next) throw new Error('Nessuna risposta in coda');
    const payload = next.text ?? JSON.stringify(next.json ?? { ok: true, data: {} });
    return new Response(payload, { status: next.status ?? 200 });
  };
  return { fetchFn, calls };
}

function client(replies: Reply[], key = 'chiave-finta') {
  const { fetchFn, calls } = fakeFetch(replies);
  const script = new ScriptClient({ url: URL, getKey: () => key, fetchFn, sleep: async () => {} });
  return { script, calls };
}

describe('ScriptClient: richiesta', () => {
  it('usa POST text/plain (niente preflight) con la chiave nel corpo e non nell’URL', async () => {
    const { script, calls } = client([{ json: { ok: true, data: {} } }]);

    await script.ping();

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.contentType).toContain('text/plain');
    expect(calls[0]?.url).toBe(URL);
    expect(calls[0]?.url).not.toContain('chiave-finta');
    expect(calls[0]?.body).toEqual({ key: 'chiave-finta', action: 'ping' });
  });

  it('rifiuta indirizzi che non sono script Google, così la chiave non esce mai', () => {
    const make = (url: string) =>
      new ScriptClient({ url, getKey: () => 'k', fetchFn: async () => new Response('{}') });
    expect(() => make('https://example.com/exec')).toThrow(ScriptError);
    expect(() => make('http://script.google.com/macros/s/x/exec')).toThrow(ScriptError);
  });
});

describe('ScriptClient: operazioni', () => {
  it('init invia le schede e restituisce quante ne ha create', async () => {
    const { script, calls } = client([{ json: { ok: true, data: { created: ['prova'] } } }]);
    await expect(script.init({ prova: ['id', 'testo'] })).resolves.toBe(1);
    expect(calls[0]?.body).toMatchObject({ action: 'init', tabs: { prova: ['id', 'testo'] } });
  });

  it('read legge più schede in una sola richiesta', async () => {
    const data = { a: [['id']], b: [['id'], ['1']] };
    const { script, calls } = client([{ json: { ok: true, data } }]);
    await expect(script.read(['a', 'b'])).resolves.toEqual(data);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({ action: 'read', tabs: ['a', 'b'] });
  });

  it('append invia intestazioni e righe in una sola richiesta', async () => {
    const { script, calls } = client([{ json: { ok: true, data: { appended: [1] } } }]);
    await script.append([{ tab: 'prova', headers: ['id', 'testo'], rows: [['1', 'ciao']] }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({
      action: 'append',
      appends: [{ tab: 'prova', headers: ['id', 'testo'], rows: [['1', 'ciao']] }],
    });
  });
});

describe('ScriptClient: errori', () => {
  it('traduce i codici dello script in messaggi italiani', async () => {
    const { script } = client([{ json: { ok: false, error: 'unauthorized' } }]);
    const error = await script.ping().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScriptError);
    expect((error as ScriptError).code).toBe('unauthorized');
    expect((error as ScriptError).message).toBe('Chiave non valida.');
  });

  it('un codice sconosciuto non perde il codice e non mostra altro', () => {
    expect(messageForScriptError('boh')).toBe('Errore dello script (boh).');
  });

  it('se Google risponde con una pagina HTML segnala indirizzo/accesso, senza mostrarla', async () => {
    const { script } = client([{ text: '<html>Accedi a Google DATO-SEGRETO</html>' }]);
    const error = await script.ping().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScriptError);
    expect((error as ScriptError).code).toBe('bad_response');
    expect((error as ScriptError).message).not.toContain('DATO-SEGRETO');
  });

  it('una risposta JSON con forma inattesa è bad_response', async () => {
    const { script } = client([{ json: { qualcosa: 1 } }]);
    await expect(script.ping()).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('riprova su HTTP 429 e poi riesce', async () => {
    const { script, calls } = client([{ status: 429 }, { json: { ok: true, data: {} } }]);
    await expect(script.ping()).resolves.toBe(0); // versione vecchia: nessuna version nella risposta
    expect(calls).toHaveLength(2);
  });

  it('su altri errori HTTP non riprova e non include il corpo nel messaggio', async () => {
    const { script, calls } = client([{ status: 500, text: 'DATO-SEGRETO' }]);
    const error = await script.ping().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).message).not.toContain('DATO-SEGRETO');
    expect(calls).toHaveLength(1);
  });

  it('messageForStatus distingue quota, server e altro', () => {
    expect(messageForStatus(429)).toMatch(/Quota/);
    expect(messageForStatus(503)).toMatch(/servizio Google/);
    expect(messageForStatus(404)).toContain('404');
  });
});
