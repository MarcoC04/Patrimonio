import { describe, expect, it } from 'vitest';
import { formatDateIt, isIsoDate, todayIso } from './dates';

describe('isIsoDate', () => {
  it.each([
    ['2026-03-15', true],
    ['2024-02-29', true], // 2024 è bisestile
    ['2026-02-29', false], // 2026 non lo è
    ['2026-02-30', false],
    ['2026-13-01', false],
    ['2026-00-10', false],
    ['2026-04-31', false], // aprile ha 30 giorni
    ['2026-1-1', false], // non a due cifre
    ['15/03/2026', false],
    ['', false],
    ['2026-03-15T10:00:00Z', false], // è un timestamp, non una data
  ])('%s → %s', (text, expected) => {
    expect(isIsoDate(text)).toBe(expected);
  });
});

describe('todayIso', () => {
  it('usa i campi locali: 23:59 del 5 gennaio resta 5 gennaio', () => {
    // new Date(y, m, d, h, min) è nel fuso locale: il risultato non dipende dal fuso della macchina
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayIso(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
});

describe('formatDateIt', () => {
  it('2026-03-15 → 15/03/2026', () => {
    expect(formatDateIt('2026-03-15')).toBe('15/03/2026');
  });
  it('un testo non ISO resta com’è', () => {
    expect(formatDateIt('boh')).toBe('boh');
  });
});
