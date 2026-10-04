import { describe, expect, it } from 'vitest';
import { FX_MIN_SCRIPT_VERSION, MIN_SCRIPT_VERSION, ScriptClient } from './scriptClient';
import { createScript, TEST_SECRET } from './testing/fakeAppsScript';

const URL = 'https://script.google.com/macros/s/TEST/exec';

function clientWith(fetchFn: typeof fetch) {
  return new ScriptClient({ url: URL, getKey: () => TEST_SECRET, fetchFn, sleep: async () => {} });
}

const replying =
  (data: unknown): typeof fetch =>
  async () =>
    new Response(JSON.stringify({ ok: true, data }));

describe('versione dello script', () => {
  it('lo script reale dichiara almeno la versione minima richiesta dall’app', async () => {
    const script = createScript();
    const version = await clientWith(script.fetchFn).ping();
    expect(version).toBeGreaterThanOrEqual(MIN_SCRIPT_VERSION);
  });

  it('lo script reale dichiara la versione che include i cambi', async () => {
    const script = createScript();
    await expect(clientWith(script.fetchFn).ping()).resolves.toBeGreaterThanOrEqual(
      FX_MIN_SCRIPT_VERSION,
    );
  });

  it('una risposta senza versione (script vecchio) vale 0, quindi inferiore al minimo', async () => {
    const version = await clientWith(replying({})).ping();
    expect(version).toBe(0);
    expect(version < MIN_SCRIPT_VERSION).toBe(true);
  });

  it('una versione non numerica vale 0', async () => {
    await expect(clientWith(replying({ version: 'due' })).ping()).resolves.toBe(0);
  });

  it('la versione dichiarata da un nuovo script supera il minimo', async () => {
    await expect(clientWith(replying({ version: 5 })).ping()).resolves.toBe(5);
  });
});
