import { describe, expect, it } from 'vitest';
import type { CategorizationRule } from '../data/schema';
import {
  findRule,
  learnRule,
  matchesRule,
  registerHit,
  suggestPattern,
  type RuleTarget,
} from './rules';

const TS = '2026-01-02T03:04:05.000Z';
let n = 0;
const rule = (overrides: Partial<CategorizationRule> = {}): CategorizationRule => ({
  id: `r-${++n}`,
  created_at: TS,
  updated_at: TS,
  deleted: false,
  priority: 10,
  field: 'description',
  match_type: 'contains',
  pattern: 'negozio',
  category_id: 'cat-spesa',
  account_id: null,
  amount_min_minor: null,
  amount_max_minor: null,
  source: 'manual',
  hit_count: 0,
  is_enabled: true,
  ...overrides,
});

const target = (overrides: Partial<RuleTarget> = {}): RuleTarget => ({
  description: 'POS Negozio Uno Roma',
  rawDescription: '',
  amountMinor: -931,
  accountId: 'acc-1',
  ...overrides,
});

describe('matchesRule: descrizione', () => {
  it('contiene: senza badare a maiuscole, accenti e punteggiatura', () => {
    expect(matchesRule(rule({ pattern: 'NEGOZIO uno' }), target())).toBe(true);
    expect(
      matchesRule(rule({ pattern: 'caffe' }), target({ description: 'Caffè del Corso' })),
    ).toBe(true);
    expect(matchesRule(rule({ pattern: 'altro' }), target())).toBe(false);
  });

  it('contiene guarda anche il testo originale della banca', () => {
    const t = target({ description: 'Bonifico', rawDescription: 'Ord: STRIPE Info-Cli: SHOPIFY' });
    expect(matchesRule(rule({ pattern: 'shopify' }), t)).toBe(true);
  });

  it('inizia con / è uguale a: solo sulla descrizione', () => {
    expect(matchesRule(rule({ match_type: 'starts_with', pattern: 'pos negozio' }), target())).toBe(
      true,
    );
    expect(matchesRule(rule({ match_type: 'starts_with', pattern: 'negozio' }), target())).toBe(
      false,
    );
    expect(
      matchesRule(rule({ match_type: 'equals', pattern: 'pos negozio uno roma' }), target()),
    ).toBe(true);
    expect(matchesRule(rule({ match_type: 'equals', pattern: 'negozio' }), target())).toBe(false);
  });

  it('espressione regolare, insensibile alle maiuscole', () => {
    expect(matchesRule(rule({ match_type: 'regex', pattern: 'negozio (uno|due)' }), target())).toBe(
      true,
    );
    expect(matchesRule(rule({ match_type: 'regex', pattern: '^negozio' }), target())).toBe(false);
  });

  it('un’espressione regolare non valida non si applica (e non rompe nulla)', () => {
    expect(matchesRule(rule({ match_type: 'regex', pattern: '([' }), target())).toBe(false);
  });

  it('un testo vuoto o fatto solo di simboli non corrisponde a niente', () => {
    expect(matchesRule(rule({ pattern: '' }), target())).toBe(false);
    expect(matchesRule(rule({ pattern: '   ' }), target())).toBe(false);
    expect(matchesRule(rule({ pattern: '***' }), target())).toBe(false);
  });

  it('una regola disattivata non si applica', () => {
    expect(matchesRule(rule({ is_enabled: false }), target())).toBe(false);
  });
});

describe('matchesRule: conto e importo', () => {
  it('con un conto indicato vale solo per quel conto', () => {
    expect(matchesRule(rule({ account_id: 'acc-1' }), target())).toBe(true);
    expect(matchesRule(rule({ account_id: 'acc-2' }), target())).toBe(false);
  });

  it('l’intervallo guarda il valore assoluto: tra 5,00 e 10,00 € vale per una spesa di 9,31 €', () => {
    const r = rule({ amount_min_minor: 500, amount_max_minor: 1000 });
    expect(matchesRule(r, target({ amountMinor: -931 }))).toBe(true);
    expect(matchesRule(r, target({ amountMinor: 931 }))).toBe(true); // anche un'entrata
    expect(matchesRule(r, target({ amountMinor: -499 }))).toBe(false);
    expect(matchesRule(r, target({ amountMinor: -1001 }))).toBe(false);
    expect(matchesRule(r, target({ amountMinor: -500 }))).toBe(true); // estremi inclusi
    expect(matchesRule(r, target({ amountMinor: -1000 }))).toBe(true);
  });

  it('le condizioni si sommano: testo + importo + conto', () => {
    const r = rule({ pattern: 'negozio', amount_max_minor: 1000, account_id: 'acc-1' });
    expect(matchesRule(r, target())).toBe(true);
    expect(matchesRule(r, target({ amountMinor: -5000 }))).toBe(false);
  });

  it('regole sull’importo o sul conto senza testo', () => {
    expect(
      matchesRule(rule({ field: 'amount', pattern: '', amount_min_minor: 100 }), target()),
    ).toBe(true);
    expect(matchesRule(rule({ field: 'amount', pattern: '' }), target())).toBe(false); // nessuna condizione
    expect(
      matchesRule(rule({ field: 'account', pattern: '', account_id: 'acc-1' }), target()),
    ).toBe(true);
    expect(matchesRule(rule({ field: 'account', pattern: '', account_id: null }), target())).toBe(
      false,
    );
  });
});

describe('findRule', () => {
  it('vince la priorità più bassa tra quelle che corrispondono', () => {
    const generic = rule({
      id: 'generica',
      priority: 20,
      pattern: 'negozio',
      category_id: 'cat-A',
    });
    const specific = rule({
      id: 'specifica',
      priority: 5,
      pattern: 'negozio uno',
      category_id: 'cat-B',
    });
    expect(findRule([generic, specific], target())?.id).toBe('specifica');
  });

  it('a pari priorità vince la più vecchia', () => {
    const older = rule({ id: 'vecchia', priority: 5, created_at: '2026-01-01T00:00:00.000Z' });
    const newer = rule({ id: 'nuova', priority: 5, created_at: '2026-02-01T00:00:00.000Z' });
    expect(findRule([newer, older], target())?.id).toBe('vecchia');
  });

  it('salta le regole disattivate e restituisce null se nessuna corrisponde', () => {
    expect(findRule([rule({ is_enabled: false })], target())).toBeNull();
    expect(findRule([rule({ pattern: 'xyz' })], target())).toBeNull();
    expect(findRule([], target())).toBeNull();
  });
});

describe('suggestPattern', () => {
  it.each([
    ['POS Negozio Uno Roma 12345', 'negozio uno'], // "pos" è rumore, le cifre non contano
    ['Alipay', 'alipay'],
    ['Bonifico SEPA Estero', null], // solo parole di rumore
    ['12345 6789', null],
    ['  ', null],
    ['Caffè del Corso', 'caffe corso'], // accenti tolti, "del" è rumore
    ['Netflix.com 800-1234', 'netflix com'], // punteggiatura come separatore
  ])('"%s" → %s', (description, expected) => {
    expect(suggestPattern(description)).toBe(expected);
  });

  it('prende al massimo due parole', () => {
    expect(suggestPattern('Supermercato Centrale Via Roma Milano')).toBe('supermercato centrale');
  });
});

describe('learnRule', () => {
  const NOW = new Date('2026-03-20T10:00:00.000Z');

  it('crea una regola "contiene" in coda alle altre, marcata come imparata', () => {
    const existing = [rule({ priority: 10 }), rule({ priority: 30 })];
    const result = learnRule(
      { pattern: ' netflix ', categoryId: 'cat-svago', accountId: null },
      existing,
      NOW,
      () => 'new-id',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      kind: 'insert',
      rule: expect.objectContaining({
        id: 'new-id',
        priority: 31, // dopo la più alta
        field: 'description',
        match_type: 'contains',
        pattern: 'netflix',
        category_id: 'cat-svago',
        source: 'learned',
        hit_count: 0,
        is_enabled: true,
      }),
    });
  });

  it('la prima regola ha priorità 1', () => {
    const result = learnRule({ pattern: 'x pizza', categoryId: 'c', accountId: null }, [], NOW);
    expect(result.ok && result.value.kind === 'insert' && result.value.rule.priority).toBe(1);
  });

  it('se esiste già la stessa regola con la stessa categoria non fa nulla', () => {
    const existing = [rule({ pattern: 'Netflix', category_id: 'cat-svago' })];
    expect(
      learnRule({ pattern: 'netflix', categoryId: 'cat-svago', accountId: null }, existing, NOW),
    ).toEqual({
      ok: true,
      value: { kind: 'none' },
    });
  });

  it('se esiste con un’altra categoria ne aggiorna la categoria invece di duplicarla', () => {
    const old = rule({ id: 'esistente', pattern: 'Netflix', category_id: 'cat-vecchia' });
    const result = learnRule(
      { pattern: 'netflix', categoryId: 'cat-nuova', accountId: null },
      [old],
      NOW,
    );
    expect(result.ok && result.value).toEqual({
      kind: 'update',
      rule: expect.objectContaining({
        id: 'esistente',
        category_id: 'cat-nuova',
        updated_at: '2026-03-20T10:00:00.000Z',
      }),
    });
  });

  it('una regola limitata a un conto è diversa da una per tutti i conti', () => {
    const forAll = rule({ pattern: 'netflix', account_id: null });
    const result = learnRule(
      { pattern: 'netflix', categoryId: 'c', accountId: 'acc-1' },
      [forAll],
      NOW,
    );
    expect(result.ok && result.value.kind).toBe('insert');
  });

  it('rifiuta un testo vuoto o fatto di soli simboli e una categoria mancante', () => {
    expect(learnRule({ pattern: '  ', categoryId: 'c', accountId: null }, [], NOW)).toEqual({
      ok: false,
      issues: ['pattern'],
    });
    expect(learnRule({ pattern: '***', categoryId: 'c', accountId: null }, [], NOW)).toEqual({
      ok: false,
      issues: ['pattern'],
    });
    expect(learnRule({ pattern: 'ok', categoryId: '', accountId: null }, [], NOW)).toEqual({
      ok: false,
      issues: ['category'],
    });
  });
});

describe('registerHit', () => {
  it('aumenta il contatore di uno e aggiorna la data', () => {
    const updated = registerHit(rule({ hit_count: 4 }), new Date('2026-03-20T10:00:00.000Z'));
    expect(updated.hit_count).toBe(5);
    expect(updated.updated_at).toBe('2026-03-20T10:00:00.000Z');
  });
});
