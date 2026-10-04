import { describe, expect, it } from 'vitest';
import { formatPlain, MoneyError, parseMoney } from './money';

describe('formatPlain', () => {
  it.each([
    [1234, '12,34'], // 12 € e 34 cent
    [5, '0,05'], // 5 cent
    [0, '0,00'],
    [100, '1,00'],
    [-1234, '-12,34'],
    [-5, '-0,05'],
    [100000000, '1000000,00'], // niente separatore delle migliaia
  ])('%i centesimi → "%s"', (minor, expected) => {
    expect(formatPlain(minor)).toBe(expected);
  });

  it('senza decimali (JPY): 1500 → "1500"', () => {
    expect(formatPlain(1500, 0)).toBe('1500');
  });

  it('parseMoney rilegge esattamente quello che formatPlain ha scritto', () => {
    for (const minor of [0, 1, 9, 10, 99, 100, 1234, 123456789, -1, -1234, -123456789]) {
      expect(parseMoney(formatPlain(minor))).toBe(minor);
    }
  });

  it('rifiuta valori non interi', () => {
    expect(() => formatPlain(12.5)).toThrow(MoneyError);
  });
});
