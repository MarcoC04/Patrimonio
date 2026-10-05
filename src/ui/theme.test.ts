import { describe, expect, it } from 'vitest';
import css from '../index.css?raw';
import { categoryColors, chartColors, palette } from './theme';

/** Luminanza relativa e rapporto di contrasto secondo WCAG 2.x. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe('contrasto (WCAG AA)', () => {
  // Testo normale: almeno 4,5:1 su ogni sfondo su cui può comparire.
  const backgrounds = {
    'sfondo in alto': palette.bgTop,
    'sfondo al centro': palette.bgMid,
    'sfondo in basso': palette.bgBottom,
    'barra laterale': palette.sidebar,
    riquadro: palette.surface,
    'campo/controllo': palette.surface2,
  };
  const texts = {
    testo: palette.fg,
    'testo secondario': palette.muted,
    'testo accento': palette.accent,
    entrate: palette.income,
    spese: palette.expense,
    avviso: palette.warn,
    info: palette.info,
  };

  for (const [textName, text] of Object.entries(texts)) {
    for (const [bgName, background] of Object.entries(backgrounds)) {
      it(`${textName} su ${bgName} ≥ 4,5:1`, () => {
        expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('il testo dei pulsanti principali è leggibile, anche al passaggio del mouse', () => {
    expect(contrast(palette.onAccent, palette.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.onAccent, palette.accentHover)).toBeGreaterThanOrEqual(4.5);
  });

  it('i bordi di campi, pulsanti e interruttori si distinguono dallo sfondo (≥ 3:1)', () => {
    expect(contrast(palette.control, palette.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(palette.control, palette.surface2)).toBeGreaterThanOrEqual(3);
    expect(contrast(palette.control, palette.bgBottom)).toBeGreaterThanOrEqual(3);
  });

  it('i bordi sottili dei riquadri sono visibili ma discreti (tra 1,1:1 e 2:1)', () => {
    for (const background of [palette.surface, palette.bgTop]) {
      const ratio = contrast(palette.line, background);
      expect(ratio).toBeGreaterThanOrEqual(1.1);
      expect(ratio).toBeLessThanOrEqual(2);
    }
  });

  it('i colori dei grafici si distinguono dal riquadro (≥ 3:1)', () => {
    for (const color of [
      chartColors.income,
      chartColors.expense,
      chartColors.flow,
      ...categoryColors,
    ]) {
      expect(contrast(color, palette.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('le categorie delle ciambelle hanno colori diversi tra loro', () => {
    expect(new Set(categoryColors).size).toBe(categoryColors.length);
  });

  it('il calcolo del contrasto è corretto: nero su bianco = 21, uguali = 1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#336699', '#336699')).toBeCloseTo(1, 5);
  });
});

describe('index.css e theme.ts coincidono', () => {
  const toCamel = (name: string) => name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

  const cssColors = Object.fromEntries(
    [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [
      toCamel(m[1] ?? ''),
      (m[2] ?? '').toLowerCase(),
    ]),
  );

  it('ogni colore del CSS ha lo stesso valore in palette', () => {
    expect(Object.keys(cssColors).length).toBeGreaterThan(10);
    for (const [name, value] of Object.entries(cssColors)) {
      expect(palette, `colore "${name}" assente da palette`).toHaveProperty(name);
      expect((palette as Record<string, string>)[name]).toBe(value);
    }
  });

  it('ogni colore della palette è dichiarato anche nel CSS', () => {
    for (const name of Object.keys(palette)) {
      expect(cssColors, `colore "${name}" assente da index.css`).toHaveProperty(name);
    }
  });
});
