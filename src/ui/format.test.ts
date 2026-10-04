import { describe, expect, it } from 'vitest';
import { formatEuroWhole, formatMonthLabel, formatMonthShort, signedMoney } from './format';

const plain = (text: string) => text.replaceAll(' ', ' ');

describe('signedMoney', () => {
  it('mette il + sulle entrate e lascia il − sulle uscite', () => {
    expect(plain(signedMoney(1234))).toBe('+12,34 €');
    expect(plain(signedMoney(-1234))).toBe('-12,34 €');
    expect(plain(signedMoney(0))).toBe('0,00 €');
  });
});

describe('formatMonthLabel e formatMonthShort', () => {
  it('nomi italiani dei mesi', () => {
    expect(formatMonthLabel('2026-03')).toBe('marzo 2026');
    expect(formatMonthLabel('2026-01')).toBe('gennaio 2026');
    expect(formatMonthLabel('2025-12')).toBe('dicembre 2025');
  });
  it('forma breve per gli assi', () => {
    expect(formatMonthShort('2026-01-31')).toBe('gen 26');
    expect(formatMonthShort('2025-09-15')).toBe('set 25');
  });
  it('un testo non valido resta com’è', () => {
    expect(formatMonthLabel('boh')).toBe('boh');
    expect(formatMonthShort('boh')).toBe('boh');
  });
});

describe('formatEuroWhole', () => {
  it('euro interi con la regola it-IT delle migliaia (da 5 cifre in su)', () => {
    expect(formatEuroWhole(120000)).toBe('1200'); // 1.200,00 € → 4 cifre: nessun punto
    expect(formatEuroWhole(12345600)).toBe('123.456');
    expect(formatEuroWhole(0)).toBe('0');
    expect(formatEuroWhole(-50000)).toBe('-500');
  });
});
