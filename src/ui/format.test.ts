import { describe, expect, it } from 'vitest';
import {
  formatEuroCompact,
  formatEuroWhole,
  formatMonthLabel,
  formatMonthShort,
  formatTenthsPercent,
  signedMoney,
  splitMoney,
} from './format';

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

describe('formatTenthsPercent', () => {
  it.each([
    [188, '+18,8%'],
    [307, '+30,7%'],
    [-100, '-10,0%'],
    [5, '+0,5%'],
    [-5, '-0,5%'],
    [0, '0,0%'],
    [1000, '+100,0%'],
    [12345, '+1234,5%'],
  ])('%i decimi → "%s"', (tenths, expected) => {
    expect(formatTenthsPercent(tenths)).toBe(expected);
  });
});

describe('formatEuroCompact', () => {
  it.each([
    [0, '0'],
    [80000, '800'], // 800 €
    [99900, '999'], // 999 €
    [100000, '1K'], // 1.000 €
    [105000, '1,1K'], // 1.050 € → 1,05 arrotondato a 1,1
    [1914300, '19,1K'], // 19.143 €
    [2000000, '20K'],
    [-250000, '-2,5K'], // −2.500 €
    [-80000, '-800'],
    [99950, '1K'], // 999,50 € arrotonda a 1.000 € e passa a "K"
    [10, '0'], // 10 centesimi: niente "-0" né "0,0"
    [-10, '0'],
  ])('%i centesimi → "%s"', (minor, expected) => {
    expect(formatEuroCompact(minor)).toBe(expected);
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

describe('splitMoney', () => {
  it('parte intera, centesimi e simbolo separati: 90.911,80 €', () => {
    expect(splitMoney(9091180)).toMatchObject({
      sign: '',
      whole: '90.911',
      fraction: ',80',
      currency: '€',
    });
  });

  it('importi piccoli: 0,05 € → intero 0, centesimi ,05', () => {
    expect(splitMoney(5)).toMatchObject({ whole: '0', fraction: ',05' });
  });

  it('importi negativi: il segno è a parte', () => {
    expect(splitMoney(-1234567)).toMatchObject({ sign: '-', whole: '12.345', fraction: ',67' });
  });

  it('zero', () => {
    expect(splitMoney(0)).toMatchObject({ sign: '', whole: '0', fraction: ',00' });
  });
});
