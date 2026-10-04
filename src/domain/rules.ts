import type { CategorizationRule } from '../data/schema';
import { normalizeDescription } from './dedupe';
import { fail, type Result } from './result';
import { uuidv7 } from './uuid7';

/**
 * Categorizzazione a regole (ARCHITECTURE.md §7.2). Una regola si applica se TUTTE le sue
 * condizioni valgono: il conto (se indicato), l'intervallo di importo in valore assoluto (se
 * indicato) e, per le regole sulla descrizione, il testo. Vince la prima per priorità
 * (il numero più basso). Le regole "imparate" si aggiungono in coda.
 */

export interface RuleTarget {
  description: string;
  rawDescription: string;
  /** Importo con segno; gli intervalli delle regole guardano il valore assoluto. */
  amountMinor: number;
  accountId: string;
}

export function matchesRule(rule: CategorizationRule, target: RuleTarget): boolean {
  if (!rule.is_enabled) return false;
  if (rule.account_id !== null && rule.account_id !== target.accountId) return false;

  const amount = Math.abs(target.amountMinor);
  if (rule.amount_min_minor !== null && amount < rule.amount_min_minor) return false;
  if (rule.amount_max_minor !== null && amount > rule.amount_max_minor) return false;

  if (rule.field === 'account') return rule.account_id !== null;
  if (rule.field === 'amount')
    return rule.amount_min_minor !== null || rule.amount_max_minor !== null;

  // Regola sulla descrizione
  const pattern = rule.pattern.trim();
  if (pattern === '') return false;

  if (rule.match_type === 'regex') {
    try {
      return new RegExp(pattern, 'iu').test(`${target.description} ${target.rawDescription}`);
    } catch {
      // Espressione non valida (scritta a mano): la regola semplicemente non si applica.
      return false;
    }
  }

  const wanted = normalizeDescription(pattern);
  if (wanted === '') return false;
  const description = normalizeDescription(target.description);
  switch (rule.match_type) {
    case 'contains':
      return normalizeDescription(`${target.description} ${target.rawDescription}`).includes(
        wanted,
      );
    case 'starts_with':
      return description.startsWith(wanted);
    case 'equals':
      return description === wanted;
    default:
      return false;
  }
}

/** La prima regola che corrisponde, per priorità (poi per data di creazione). Null se nessuna. */
export function findRule(
  rules: readonly CategorizationRule[],
  target: RuleTarget,
): CategorizationRule | null {
  const ordered = [...rules]
    .filter((rule) => rule.is_enabled)
    .sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
  return ordered.find((rule) => matchesRule(rule, target)) ?? null;
}

/** Parole "rumore" dei movimenti bancari: non dicono nulla su chi ha incassato o pagato. */
const NOISE_WORDS = new Set([
  'pos',
  'pagamento',
  'pagamenti',
  'carta',
  'card',
  'bonifico',
  'sepa',
  'estero',
  'addebito',
  'sdd',
  'ord',
  'ben',
  'info',
  'cli',
  'dt',
  'acquisto',
  'visa',
  'mastercard',
  'debit',
  'credit',
  'transfer',
  'trasferimento',
  'bancomat',
  'pagobancomat',
  'commissione',
  'commissioni',
  'data',
  'del',
  'della',
  'per',
  'con',
  'iban',
  'ordinante',
  'beneficiario',
  'causale',
  'ref',
]);

/**
 * Testo suggerito per una regola "imparata": le prime due parole significative della descrizione
 * (solo lettere, almeno tre, non di rumore). Null se non ce ne sono. L'utente lo può modificare.
 */
export function suggestPattern(description: string): string | null {
  const words = normalizeDescription(description)
    .split(' ')
    .filter((word) => /^\p{L}{3,}$/u.test(word) && !NOISE_WORDS.has(word));
  return words.length === 0 ? null : words.slice(0, 2).join(' ');
}

export type LearnIssue = 'pattern' | 'category';

export interface LearnInput {
  pattern: string;
  categoryId: string;
  /** Limita la regola a un conto; null per tutti. */
  accountId: string | null;
}

export type LearnResult =
  | { kind: 'insert'; rule: CategorizationRule }
  | { kind: 'update'; rule: CategorizationRule }
  | { kind: 'none' };

/**
 * Impara una regola da una correzione dell'utente. Se esiste già una regola "contiene" con lo
 * stesso testo: non fa nulla se la categoria è la stessa, altrimenti ne aggiorna la categoria
 * (una seconda regola con lo stesso testo non scatterebbe mai, perché vince la prima).
 */
export function learnRule(
  input: LearnInput,
  existing: readonly CategorizationRule[],
  now: Date = new Date(),
  newId: () => string = () => uuidv7(now.getTime()),
): Result<LearnResult, LearnIssue> {
  const pattern = input.pattern.trim();
  if (normalizeDescription(pattern) === '') return fail<LearnIssue>(['pattern']);
  if (input.categoryId === '') return fail<LearnIssue>(['category']);

  const normalized = normalizeDescription(pattern);
  const same = existing.find(
    (rule) =>
      rule.field === 'description' &&
      rule.match_type === 'contains' &&
      rule.account_id === input.accountId &&
      normalizeDescription(rule.pattern) === normalized,
  );
  if (same) {
    if (same.category_id === input.categoryId) return { ok: true, value: { kind: 'none' } };
    return {
      ok: true,
      value: {
        kind: 'update',
        rule: { ...same, category_id: input.categoryId, updated_at: now.toISOString() },
      },
    };
  }

  const timestamp = now.toISOString();
  const priority = existing.reduce((max, rule) => Math.max(max, rule.priority), 0) + 1;
  return {
    ok: true,
    value: {
      kind: 'insert',
      rule: {
        id: newId(),
        created_at: timestamp,
        updated_at: timestamp,
        deleted: false,
        priority,
        field: 'description',
        match_type: 'contains',
        pattern,
        category_id: input.categoryId,
        account_id: input.accountId,
        amount_min_minor: null,
        amount_max_minor: null,
        source: 'learned',
        hit_count: 0,
        is_enabled: true,
      },
    },
  };
}

/** Conta un'applicazione in più della regola (statistica mostrata all'utente). */
export function registerHit(rule: CategorizationRule, now: Date = new Date()): CategorizationRule {
  return { ...rule, hit_count: rule.hit_count + 1, updated_at: now.toISOString() };
}
