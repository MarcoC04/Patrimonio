import { describe, expect, it } from 'vitest';
import { addDaysIso, addMonthsIso } from './dates';
import { daysBetween, previousRange, resolvePeriod, type PeriodFilter } from './period';

const preset = (p: PeriodFilter['preset']): PeriodFilter => ({ preset: p, from: '', to: '' });
const TODAY = '2026-10-05';

describe('addDaysIso / addMonthsIso', () => {
  it('giorni sul calendario, a cavallo di mesi e anni', () => {
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2024-02-28', 1)).toBe('2024-02-29'); // anno bisestile
  });

  it('mesi: se il giorno non esiste si usa l’ultimo del mese', () => {
    expect(addMonthsIso('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsIso('2024-03-31', -1)).toBe('2024-02-29');
    expect(addMonthsIso('2026-10-05', -12)).toBe('2025-10-05');
    expect(addMonthsIso('2026-01-15', -2)).toBe('2025-11-15');
    expect(addMonthsIso('2026-11-30', 3)).toBe('2027-02-28');
  });
});

describe('resolvePeriod', () => {
  it.each([
    // Oggi 05/10/2026: 1M = dal 06/09 (un mese fa + 1 giorno) ecc.
    ['1M', '2026-09-06'],
    ['3M', '2026-07-06'],
    ['6M', '2026-04-06'],
    ['1A', '2025-10-06'],
    ['YTD', '2026-01-01'],
  ] as const)('%s → dal %s a oggi', (p, from) => {
    expect(resolvePeriod(preset(p), TODAY)).toEqual({ from, to: TODAY });
  });

  it('Max non ha un inizio', () => {
    expect(resolvePeriod(preset('MAX'), TODAY)).toEqual({ from: null, to: TODAY });
  });

  it('personalizzato: usa le date valide, ignora quelle non valide, la fine mancante è oggi', () => {
    expect(
      resolvePeriod({ preset: 'custom', from: '2026-02-01', to: '2026-02-28' }, TODAY),
    ).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(resolvePeriod({ preset: 'custom', from: '2026-02-01', to: '' }, TODAY)).toEqual({
      from: '2026-02-01',
      to: TODAY,
    });
    expect(resolvePeriod({ preset: 'custom', from: 'boh', to: 'no' }, TODAY)).toEqual({
      from: null,
      to: TODAY,
    });
  });

  it('1M a fine marzo: dal 1° marzo (febbraio è più corto)', () => {
    expect(resolvePeriod(preset('1M'), '2026-03-31')).toEqual({
      from: '2026-03-01',
      to: '2026-03-31',
    });
  });
});

describe('previousRange', () => {
  it('stessa durata, subito prima: 06/09–05/10 (30 giorni) → 07/08–05/09', () => {
    expect(previousRange({ from: '2026-09-06', to: '2026-10-05' })).toEqual({
      from: '2026-08-07',
      to: '2026-09-05',
    });
  });

  it('un anno intero → l’anno prima', () => {
    expect(previousRange({ from: '2026-01-01', to: '2026-12-31' })).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });

  it('senza inizio non c’è un periodo precedente', () => {
    expect(previousRange({ from: null, to: TODAY })).toBeNull();
  });
});

describe('daysBetween', () => {
  it('differenza in giorni', () => {
    expect(daysBetween('2026-09-06', '2026-10-05')).toBe(29);
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
    expect(daysBetween('2026-10-05', '2026-10-05')).toBe(0);
  });
});
