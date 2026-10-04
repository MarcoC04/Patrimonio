import { describe, expect, it } from 'vitest';
import { strings } from '../ui/strings';
import { NAV_ITEMS } from './navigation';

describe('NAV_ITEMS', () => {
  it('la dashboard è la prima voce ed è la schermata iniziale (/)', () => {
    expect(NAV_ITEMS[0]).toEqual({ path: '/', key: 'dashboard' });
  });

  it('percorsi e chiavi sono univoci', () => {
    expect(new Set(NAV_ITEMS.map((i) => i.path)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((i) => i.key)).size).toBe(NAV_ITEMS.length);
  });

  it('ogni voce ha un’etichetta italiana in strings.nav', () => {
    for (const item of NAV_ITEMS) {
      expect(strings.nav[item.key]).toBeTruthy();
    }
  });
});
