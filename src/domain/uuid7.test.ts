import { describe, expect, it } from 'vitest';
import { uuidv7 } from './uuid7';

const zeros = (b: Uint8Array<ArrayBuffer>) => b.fill(0);

describe('uuidv7', () => {
  it('ha il formato UUID con versione 7 e variante 10xx', () => {
    const id = uuidv7(Date.now());
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('codifica il timestamp nei primi 48 bit', () => {
    // 0x0123456789ab ms = 1250999896491 → "01234567-89ab-..."
    const id = uuidv7(0x0123456789ab, zeros);
    expect(id).toBe('01234567-89ab-7000-8000-000000000000');
  });

  it('è ordinabile come stringa in base al tempo', () => {
    const a = uuidv7(1_700_000_000_000, zeros);
    const b = uuidv7(1_700_000_000_001, zeros);
    expect(a < b).toBe(true);
  });

  it('due id generati nello stesso istante sono diversi', () => {
    expect(uuidv7(1_700_000_000_000)).not.toBe(uuidv7(1_700_000_000_000));
  });
});
