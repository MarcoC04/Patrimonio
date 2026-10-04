import { describe, expect, it } from 'vitest';
import { assertMinor, formatMoney, minorExponent, MoneyError, parseMoney, sumMinor } from './money';

/** Intl usa lo spazio non separabile prima del simbolo: nei test lo si normalizza. */
const plain = (text: string) => text.replaceAll('\u00a0', ' ');

describe('parseMoney', () => {
  it.each([
    ['12,34', 1234], // 12 € e 34 cent
    ['12', 1200], // senza decimali: 12,00 €
    ['1,5', 150], // un solo decimale: 1,50 €
    ['0,1', 10], // 0,10 €
    ['-0,05', -5], // 5 cent in uscita
    ['+7,00', 700],
    ['1.234,56', 123456], // punto = migliaia: 1234,56 €
    ['1.234.567,89', 123456789],
    ['1234,56', 123456], // anche senza separatore delle migliaia
    ['12.5', 1250], // punto decimale con 1 cifra: 12,50 €
    ['12.50', 1250],
    ['1.234', 123400], // gruppo da 3 cifre = migliaia, non decimali
    ['  12,34  ', 1234], // spazi esterni ignorati
  ])('legge %s come %i centesimi', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each([
    [''],
    ['abc'],
    ['12,345'], // 3 decimali: ambiguo, rifiutato
    ['1.2.3'],
    ['1,2,3'],
    ['12 €'],
    ['1 234,56'], // spazio interno
    ['1.23,45'], // gruppo delle migliaia sbagliato
    ['--5'],
    ['12,'],
  ])('rifiuta "%s"', (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it('non produce -0', () => {
    expect(Object.is(parseMoney('-0'), 0)).toBe(true);
  });

  it('rifiuta importi oltre il range sicuro', () => {
    expect(parseMoney('99999999999999999999,99')).toBeNull();
  });

  it('rispetta gli esponenti diversi da 2 (JPY: 0 decimali)', () => {
    expect(parseMoney('1500', 0)).toBe(1500);
    expect(parseMoney('15,5', 0)).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formatta in it-IT con virgola decimale e simbolo', () => {
    expect(plain(formatMoney(5))).toBe('0,05 €'); // 5 cent
    expect(plain(formatMoney(0))).toBe('0,00 €');
    expect(plain(formatMoney(100))).toBe('1,00 €');
  });

  it('rispetta il raggruppamento delle migliaia della locale it-IT (CLDR)', () => {
    // In it-IT il punto delle migliaia compare solo da 5 cifre intere in su (come es, pl):
    // 1234,56 € ma 12.345,67 €. Seguiamo la locale invece di forzare un formato nostro.
    expect(plain(formatMoney(123456))).toBe('1234,56 €');
    expect(plain(formatMoney(1234567))).toBe('12.345,67 €');
    expect(plain(formatMoney(123456789))).toBe('1.234.567,89 €');
  });

  it('gestisce i negativi', () => {
    expect(plain(formatMoney(-123456))).toBe('-1234,56 €');
    expect(plain(formatMoney(-1234567))).toBe('-12.345,67 €');
    expect(plain(formatMoney(-5))).toBe('-0,05 €');
  });

  it('è esatto su importi enormi (nessun float): 9.007.199.254.740.991 cent', () => {
    // Number.MAX_SAFE_INTEGER = 9007199254740991 cent = 90.071.992.547.409,91 €
    expect(plain(formatMoney(Number.MAX_SAFE_INTEGER))).toBe('90.071.992.547.409,91 €');
  });

  it('usa gli esponenti della valuta (JPY senza decimali)', () => {
    expect(minorExponent('EUR')).toBe(2);
    expect(minorExponent('JPY')).toBe(0);
    // 15000 yen = 15.000 (nessun decimale: l'importo "minore" coincide con l'unità)
    const yen = plain(formatMoney(15000, 'JPY'));
    expect(yen).toContain('15.000');
    expect(yen).not.toContain(',');
  });

  it('rifiuta valori non interi', () => {
    expect(() => formatMoney(12.5)).toThrow(MoneyError);
  });

  it('parse e format sono inversi sul formato italiano', () => {
    for (const minor of [0, 1, 99, 100, 123456, -123456, 100000000]) {
      const text = plain(formatMoney(minor)).replace(' €', '');
      expect(parseMoney(text)).toBe(minor);
    }
  });
});

describe('sumMinor', () => {
  it('somma esatta: 10,00 − 2,50 + 0,05 = 7,55 €', () => {
    expect(sumMinor([1000, -250, 5])).toBe(755);
  });

  it('0,10 + 0,20 = 0,30 € esatti (in float darebbe 0.30000000000000004)', () => {
    expect(sumMinor([10, 20])).toBe(30);
  });

  it('lista vuota = 0', () => {
    expect(sumMinor([])).toBe(0);
  });

  it('rifiuta valori non interi e somme fuori range', () => {
    expect(() => sumMinor([1, 2.5])).toThrow(MoneyError);
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(MoneyError);
  });
});

describe('assertMinor', () => {
  it('accetta interi sicuri e rifiuta NaN, Infinity e decimali', () => {
    expect(assertMinor(42)).toBe(42);
    expect(() => assertMinor(Number.NaN)).toThrow(MoneyError);
    expect(() => assertMinor(Infinity)).toThrow(MoneyError);
    expect(() => assertMinor(0.1)).toThrow(MoneyError);
  });
});
