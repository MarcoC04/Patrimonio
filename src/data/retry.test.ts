import { describe, expect, it } from 'vitest';
import { HttpError, withBackoff } from './retry';

function flaky(failures: number, status: number) {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls <= failures) throw new HttpError(status, 'errore');
    return 'ok';
  };
  return { fn, calls: () => calls };
}

describe('withBackoff', () => {
  it('riprova su 429 con attese 1000, 2000, 4000 ms e poi riesce', async () => {
    const waits: number[] = [];
    const { fn, calls } = flaky(3, 429);
    const result = await withBackoff(fn, { sleep: async (ms) => void waits.push(ms) });
    expect(result).toBe('ok');
    expect(calls()).toBe(4); // 1 tentativo + 3 nuovi tentativi
    expect(waits).toEqual([1000, 2000, 4000]);
  });

  it('si arrende dopo il numero massimo di tentativi', async () => {
    const { fn, calls } = flaky(100, 429);
    await expect(withBackoff(fn, { retries: 2, sleep: async () => {} })).rejects.toBeInstanceOf(
      HttpError,
    );
    expect(calls()).toBe(3); // 1 + 2 nuovi tentativi
  });

  it('non riprova su errori diversi da 429', async () => {
    const { fn, calls } = flaky(1, 403);
    await expect(withBackoff(fn, { sleep: async () => {} })).rejects.toMatchObject({ status: 403 });
    expect(calls()).toBe(1);
  });

  it('non riprova su errori che non sono HttpError', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error('rete');
    };
    await expect(withBackoff(fn, { sleep: async () => {} })).rejects.toThrow('rete');
    expect(calls).toBe(1);
  });
});
