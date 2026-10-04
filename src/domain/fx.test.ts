import { describe, expect, it } from 'vitest';
import { isSupportedCurrency } from './currencies';
import { findRate, formatRate, fromBaseMinor, toBaseMinor } from './fx';
import { MoneyError } from './money';

describe('toBaseMinor', () => {
  it('100,00 USD a 1,1476 → 100 / 1,1476 = 87,1383… → 87,14 € (8714 cent)', () => {
    // 1,1476 × 87 = 99,8412; resto 0,1588 / 1,1476 = 0,1383… → 87,1383 → arrotondato 87,14
    expect(toBaseMinor(10000, '1.1476', 2)).toBe(8714);
  });

  it('JPY (nessun decimale): 15.000 JPY a 182,85 → 82,0344… → 82,03 € (8203 cent)', () => {
    // 182,85 × 82 = 14.993,70; resto 6,30 / 182,85 = 0,0344… → 82,0344 → 82,03
    expect(toBaseMinor(15000, '182.85', 0)).toBe(8203);
  });

  it('un tasso 1 non cambia l’importo (conto in EUR)', () => {
    expect(toBaseMinor(123456, '1', 2)).toBe(123456);
    expect(toBaseMinor(-5, '1', 2)).toBe(-5);
  });

  it('tasso 0,5: 1,00 → 2,00 € (200 cent)', () => {
    expect(toBaseMinor(100, '0.5', 2)).toBe(200);
  });

  it('il segno si conserva e l’arrotondamento è simmetrico: ±87,14', () => {
    expect(toBaseMinor(-10000, '1.1476', 2)).toBe(-8714);
  });

  it('il mezzo centesimo va verso l’esterno: 0,01 a tasso 2 = 0,005 € → 1 cent (e −1 per il negativo)', () => {
    expect(toBaseMinor(1, '2', 2)).toBe(1);
    expect(toBaseMinor(-1, '2', 2)).toBe(-1);
  });

  it('meno di mezzo centesimo si perde: 0,01 a tasso 4 = 0,0025 € → 0', () => {
    expect(toBaseMinor(1, '4', 2)).toBe(0);
    expect(Object.is(toBaseMinor(-1, '4', 2), 0)).toBe(true); // niente -0
  });

  it('è esatto su importi grandi (nessuna perdita da float)', () => {
    // 1.000.000.000,00 USD a 1,25 → 800.000.000,00 € esatti
    expect(toBaseMinor(100_000_000_000, '1.25', 2)).toBe(80_000_000_000);
  });

  it.each([['0'], ['0.0'], ['-1'], ['abc'], ['1,5'], [''], ['1.2.3'], ['.5'], ['5.']])(
    'rifiuta il tasso non valido "%s"',
    (rate) => {
      expect(() => toBaseMinor(100, rate, 2)).toThrow(MoneyError);
    },
  );

  it('rifiuta importi non interi', () => {
    expect(() => toBaseMinor(10.5, '1.1', 2)).toThrow(MoneyError);
  });
});

describe('fromBaseMinor', () => {
  it('87,14 € a 1,1476 → 100,00 USD (10000 cent): 87,14 × 1,1476 = 100,0018…', () => {
    expect(fromBaseMinor(8714, '1.1476', 2)).toBe(10000);
  });

  it('82,03 € a 182,85 → 14.999 JPY: 82,03 × 182,85 = 14.999,1855', () => {
    expect(fromBaseMinor(8203, '182.85', 0)).toBe(14999);
  });

  it('tasso 1 non cambia l’importo; segno conservato', () => {
    expect(fromBaseMinor(777, '1', 2)).toBe(777);
    expect(fromBaseMinor(-777, '1', 2)).toBe(-777);
  });

  it('rifiuta un tasso non valido', () => {
    expect(() => fromBaseMinor(100, '0', 2)).toThrow(MoneyError);
  });
});

describe('findRate', () => {
  const rates = [
    { date: '2026-03-13', base_currency: 'EUR', quote_currency: 'USD', rate: '1.1476' },
    { date: '2026-03-13', base_currency: 'EUR', quote_currency: 'JPY', rate: '182.85' },
    { date: '2026-03-16', base_currency: 'EUR', quote_currency: 'USD', rate: '1.1500' },
  ];

  it('cerca per data e valuta esatte', () => {
    expect(findRate(rates, '2026-03-13', 'USD')).toBe('1.1476');
    expect(findRate(rates, '2026-03-13', 'JPY')).toBe('182.85');
    expect(findRate(rates, '2026-03-16', 'USD')).toBe('1.1500');
  });

  it('senza corrispondenza esatta non inventa nulla', () => {
    expect(findRate(rates, '2026-03-14', 'USD')).toBeUndefined(); // il sabato non è in cache
    expect(findRate(rates, '2026-03-13', 'GBP')).toBeUndefined();
  });

  it('l’euro vale sempre 1', () => {
    expect(findRate([], '2026-03-13', 'EUR')).toBe('1');
  });
});

describe('formatRate e valute', () => {
  it('usa la virgola decimale', () => {
    expect(formatRate('1.1476')).toBe('1,1476');
    expect(formatRate('182.85')).toBe('182,85');
    expect(formatRate('1')).toBe('1');
  });

  it('riconosce le valute supportate', () => {
    expect(isSupportedCurrency('EUR')).toBe(true);
    expect(isSupportedCurrency('USD')).toBe(true);
    expect(isSupportedCurrency('usd')).toBe(false);
    expect(isSupportedCurrency('XXX')).toBe(false);
  });
});
