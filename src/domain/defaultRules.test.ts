import { describe, expect, it } from 'vitest';
import { buildDefaultCategories } from './defaultCategories';
import { buildDefaultRules, DEFAULT_RULE_PRIORITY_START } from './defaultRules';
import { findRule, learnRule } from './rules';

let n = 0;
const newId = () => `id-${++n}`;
const NOW = new Date('2026-10-04T10:00:00.000Z');
const categories = buildDefaultCategories(NOW, newId);
const rules = buildDefaultRules(categories, NOW, newId);

const categorize = (description: string, amountMinor = -1000): string | undefined => {
  const kind = amountMinor < 0 ? 'expense' : 'income';
  const usable = rules.filter((r) => categories.find((c) => c.id === r.category_id)?.kind === kind);
  const rule = findRule(usable, { description, rawDescription: '', amountMinor, accountId: 'a' });
  return categories.find((c) => c.id === rule?.category_id)?.name;
};

describe('regole iniziali', () => {
  it('sono molte, tutte attive, della fonte "default" e con priorità da 1000 in su, senza doppioni', () => {
    expect(rules.length).toBeGreaterThan(100);
    expect(rules.every((r) => r.source === 'default' && r.is_enabled)).toBe(true);
    expect(Math.min(...rules.map((r) => r.priority))).toBeGreaterThanOrEqual(
      DEFAULT_RULE_PRIORITY_START,
    );
    expect(new Set(rules.map((r) => r.priority)).size).toBe(rules.length);
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
  });

  it('puntano solo a categorie esistenti', () => {
    const ids = new Set(categories.map((c) => c.id));
    expect(rules.every((r) => ids.has(r.category_id))).toBe(true);
  });

  it.each([
    ['Alipay', 'Shopping'], // l'esempio dell'estratto Revolut
    ['POS ESSELUNGA MILANO', 'Alimentari'],
    ['Netflix.com', 'Abbonamenti'],
    ['AMAZON PRIME VIDEO', 'Abbonamenti'], // prima di "amazon"
    ['Amazon EU Sarl', 'Shopping'],
    ['Uber Eats', 'Ristoranti'], // prima di "uber"
    ['UBER *TRIP', 'Trasporti'],
    ['Trenitalia', 'Trasporti'],
    ['Farmacia Centrale', 'Salute'],
    ['Zara Milano', 'Abbigliamento'],
    ['Caffè del Corso', 'Ristoranti'],
    ['Agenzia delle Entrate F24', 'Tasse'],
  ])('"%s" → %s', (description, expected) => {
    expect(categorize(description)).toBe(expected);
  });

  it.each([
    ['Interessi maturati', 'Interessi e dividendi'],
    ['Rimborso spesa', 'Rimborsi'],
    ['Stipendio settembre', 'Stipendio'],
  ])('entrata "%s" → %s', (description, expected) => {
    expect(categorize(description, 5000)).toBe(expected);
  });

  it('un rimborso Amazon è un\'entrata: non si ferma alla regola di spesa "amazon"', () => {
    expect(categorize('Amazon rimborso', 2000)).toBe('Rimborsi');
  });

  it('le parole corte valgono solo come parola intera', () => {
    expect(categorize('Zaragoza viaggio')).toBeUndefined();
    expect(categorize('Iren Mercato')).toBe('Casa');
    expect(categorize('Direnzo SRL')).toBeUndefined();
  });

  it('una descrizione sconosciuta resta senza categoria', () => {
    expect(categorize('Negozio Uno')).toBeUndefined();
  });

  it('salta le voci la cui categoria è stata eliminata, senza inventarne', () => {
    const without = categories.filter((c) => c.name !== 'Shopping');
    const partial = buildDefaultRules(without, NOW, newId);
    expect(partial.length).toBeLessThan(rules.length);
    expect(partial.every((r) => without.some((c) => c.id === r.category_id))).toBe(true);
  });
});

describe('regole imparate e regole iniziali', () => {
  it("una correzione dell'utente batte la regola iniziale (priorità più bassa)", () => {
    const learned = learnRule(
      {
        pattern: 'amazon',
        categoryId: categories.find((c) => c.name === 'Casa')?.id ?? '',
        accountId: null,
      },
      rules,
      NOW,
      newId,
    );
    if (!learned.ok || learned.value.kind === 'none') throw new Error('regola non imparata');
    // "amazon" esiste già come regola iniziale con lo stesso testo: la si aggiorna, non si duplica
    expect(learned.value.kind).toBe('update');

    const fresh = learnRule(
      { pattern: 'negozio uno', categoryId: categories[0]?.id ?? '', accountId: null },
      rules,
      NOW,
      newId,
    );
    if (!fresh.ok || fresh.value.kind !== 'insert') throw new Error('regola non creata');
    expect(fresh.value.rule.priority).toBe(1); // prima delle iniziali, non dopo la 1000
  });
});
