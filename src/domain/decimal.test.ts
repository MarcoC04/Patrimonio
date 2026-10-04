import { describe, expect, it } from 'vitest';
import {
  compareDecimals,
  decimalToMinor,
  formatDecimal,
  formatDecimalPlain,
  isPositiveDecimal,
  multiplyToMinor,
  parseDecimal,
  subtractDecimals,
  sumDecimals,
  toPlainDecimal,
} from './decimal';
import { MoneyError } from './money';

describe('parseDecimal', () => {
  it.each([
    ['12', '12'],
    ['12,5', '12.5'],
    ['12.5', '12.5'], // punto decimale (non ambiguo: la parte dopo il punto non ha 3 cifre)
    ['0,12345678', '0.12345678'], // 8 decimali, come una criptovaluta
    ['0.125', '0.125'], // zero davanti: è un decimale, non "125"
    ['1.234,56', '1234.56'], // punto = migliaia, virgola = decimali
    ['1.234.567', '1234567'], // più gruppi: migliaia, senza ambiguità
    ['0,50', '0.5'], // zeri finali tolti
    ['12,0', '12'],
    ['  7,25  ', '7.25'], // spazi esterni ignorati
    ['0', '0'],
    ['1234567,000000000001', '1234567.000000000001'], // 12 decimali: ancora ammesso
  ])('"%s" → "%s"', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it('"1.234" è ambiguo (1234 o 1,234?) e per le quantità viene rifiutato', () => {
    expect(parseDecimal('1.234')).toBeNull();
    expect(parseDecimal('12.345')).toBeNull();
    expect(parseDecimal('1234')).toBe('1234'); // senza punto è chiaro
    expect(parseDecimal('1,234')).toBe('1.234');
  });

  it.each([
    [''],
    ['abc'],
    ['-5'],
    ['+5'],
    ['1,2,3'],
    ['1.2.3'],
    ['12,'],
    [',5'],
    ['1 234'],
    ['1.23,4'], // gruppo delle migliaia sbagliato
    ['0,1234567890123'], // 13 decimali: oltre il massimo
    ['1e5'],
  ])('rifiuta "%s"', (input) => {
    expect(parseDecimal(input)).toBeNull();
  });

  it('il massimo di decimali è regolabile', () => {
    expect(parseDecimal('1,234', 2)).toBeNull();
    expect(parseDecimal('1,23', 2)).toBe('1.23');
  });
});

describe('toPlainDecimal (numeri come li salva Excel)', () => {
  it.each([
    ['329.73', '329.73'],
    ['329.73000000000002', '329.73'], // rumore da virgola mobile: 8 decimali al massimo
    ['-25.5', '-25.5'],
    ['1E-3', '0.001'], // notazione scientifica
    ['1.5E+3', '1500'],
    ['46295', '46295'],
    ['0.0000000001', '0'], // sotto la precisione: zero, senza "-0"
    ['-0.0000000001', '0'],
    ['.5', '0.5'],
    ['7.', '7'],
    ['  12  ', '12'],
  ])('"%s" → "%s"', (raw, expected) => {
    expect(toPlainDecimal(raw)).toBe(expected);
  });

  it.each([[''], ['abc'], ['1,5'], ['1.2.3'], ['--1'], ['e5']])('rifiuta "%s"', (raw) => {
    expect(toPlainDecimal(raw)).toBeNull();
  });
});

describe('formattazione', () => {
  it('formatDecimal usa la virgola e la regola it-IT delle migliaia', () => {
    expect(formatDecimal('0.12345678')).toBe('0,12345678');
    expect(formatDecimal('1234.5')).toBe('1234,5'); // 4 cifre intere: nessun punto in it-IT
    expect(formatDecimal('12345.5')).toBe('12.345,5');
    expect(formatDecimal('10')).toBe('10');
  });

  it('formatDecimalPlain è l’inverso di parseDecimal', () => {
    for (const value of ['0.12345678', '12', '1234567.5', '0.5']) {
      expect(parseDecimal(formatDecimalPlain(value))).toBe(value);
    }
    expect(formatDecimalPlain('1234.5')).toBe('1234,5');
  });
});

describe('aritmetica esatta', () => {
  it('0,1 + 0,2 = 0,3 esatto', () => {
    expect(sumDecimals(['0.1', '0.2'])).toBe('0.3');
  });

  it('somma di molte quantità e lista vuota', () => {
    expect(sumDecimals(['0.00000001', '0.00000002', '1'])).toBe('1.00000003');
    expect(sumDecimals([])).toBe('0');
  });

  it('sottrazione e confronto', () => {
    expect(subtractDecimals('1', '0.3')).toBe('0.7');
    expect(subtractDecimals('0.3', '1')).toBe('-0.7');
    expect(compareDecimals('0.1', '0.10')).toBe(0);
    expect(compareDecimals('2', '10')).toBe(-1); // confronto numerico, non di testo
    expect(compareDecimals('10', '2')).toBe(1);
  });

  it('isPositiveDecimal', () => {
    expect(isPositiveDecimal('0.001')).toBe(true);
    expect(isPositiveDecimal('0')).toBe(false);
    expect(isPositiveDecimal('0.0')).toBe(false);
    expect(isPositiveDecimal('-1')).toBe(false);
    expect(isPositiveDecimal('abc')).toBe(false);
  });
});

describe('decimalToMinor e multiplyToMinor', () => {
  it('decimale → centesimi: 25,25 € = 2525', () => {
    expect(decimalToMinor('25.25', 2)).toBe(2525);
    expect(decimalToMinor('1500', 0)).toBe(1500); // yen
  });

  it('2,5 × 10,1 = 25,25 € → 2525 cent', () => {
    expect(multiplyToMinor('2.5', '10.1', 2)).toBe(2525);
  });

  it('0,5 × 3,333 = 1,6665 → 166,65 cent → 167 (mezzo verso l’alto)', () => {
    expect(multiplyToMinor('0.5', '3.333', 2)).toBe(167);
  });

  it('0,1 × 0,1 = 0,01 € → 1 cent esatto (in float darebbe 0.010000000000000002)', () => {
    expect(multiplyToMinor('0.1', '0.1', 2)).toBe(1);
  });

  it('3 × 0,1 = 0,3 € esatti → 30 cent', () => {
    expect(multiplyToMinor('3', '0.1', 2)).toBe(30);
  });

  it('yen senza decimali: 1000 × 182,85 = 182.850', () => {
    expect(multiplyToMinor('1000', '182.85', 0)).toBe(182850);
  });

  it('criptovaluta: 0,12345678 × 40.000 = 4.938,2712 € → 493827 cent', () => {
    // 0,12345678 × 40000 = 4938,2712 → ×100 = 493827,12 → 493827
    expect(multiplyToMinor('0.12345678', '40000', 2)).toBe(493827);
  });

  it('quantità zero vale zero (senza -0)', () => {
    expect(Object.is(multiplyToMinor('0', '10', 2), 0)).toBe(true);
  });

  it('un valore enorme fuori dal range sicuro lancia un errore chiaro', () => {
    expect(() => multiplyToMinor('99999999999999', '99999999999999', 2)).toThrow(MoneyError);
  });
});
