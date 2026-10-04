import type { CategorizationRule, Category } from '../data/schema';
import { normalizeDescription } from './dedupe';
import { uuidv7 } from './uuid7';

/**
 * Regole iniziali di categorizzazione: esercenti e parole comuni in Italia. Sono un punto di
 * partenza, modificabili e disattivabili. Hanno priorità da 1000 in su, così le regole create
 * dall'utente (che partono da 1) vincono sempre. Il testo si confronta senza accenti né maiuscole
 * ("contiene"): si usano solo parole abbastanza distintive da non scattare per caso.
 * L'ordine conta: le voci più specifiche stanno prima (es. "amazon prime" prima di "amazon").
 */
interface Seed {
  category: string;
  kind: Category['kind'];
  patterns: readonly string[];
}

const SEEDS: readonly Seed[] = [
  // — Entrate —
  { category: 'Stipendio', kind: 'income', patterns: ['stipendio', 'emolumenti', 'salary'] },
  {
    category: 'Interessi e dividendi',
    kind: 'income',
    patterns: ['interessi', 'interest payment', 'dividendo', 'dividend'],
  },
  { category: 'Rimborsi', kind: 'income', patterns: ['rimborso', 'refund', 'storno'] },

  // — Abbonamenti (prima di Shopping/Svago: "amazon prime" non è "amazon") —
  {
    category: 'Abbonamenti',
    kind: 'expense',
    patterns: [
      'netflix',
      'spotify',
      'disney plus',
      'disneyplus',
      'amazon prime',
      'prime video',
      'youtube premium',
      'apple com bill',
      'icloud',
      'dazn',
      'google one',
      'openai',
      'chatgpt',
      'microsoft 365',
      'adobe',
      'now tv',
      'sky italia',
      'audible',
    ],
  },

  // — Cibo —
  {
    category: 'Ristoranti',
    kind: 'expense',
    patterns: [
      'uber eats',
      'ubereats',
      'deliveroo',
      'glovo',
      'just eat',
      'justeat',
      'mcdonald',
      'burger king',
      'kfc',
      'starbucks',
      'pizzeria',
      'ristorante',
      'trattoria',
      'osteria',
      'sushi',
      'paninoteca',
      'gelateria',
      'pasticceria',
      'caffe',
    ],
  },
  {
    category: 'Alimentari',
    kind: 'expense',
    patterns: [
      'esselunga',
      'conad',
      'carrefour',
      'lidl',
      'eurospin',
      'aldi ',
      'penny market',
      'naturasi',
      'supermercato',
      'despar',
      'famila',
      'tigros',
      'bennet',
      'pam panorama',
      'iper ',
      'macelleria',
      'panificio',
      'ortofrutta',
      'coop ',
    ],
  },

  // — Trasporti —
  {
    category: 'Trasporti',
    kind: 'expense',
    patterns: [
      'trenitalia',
      'italo treno',
      'italo spa',
      'atm milano',
      'atac ',
      'flixbus',
      'ryanair',
      'easyjet',
      'wizz air',
      'telepass',
      'autostrade',
      'enilive',
      'q8 ',
      'tamoil',
      'benzina',
      'carburante',
      'parcheggio',
      'uber ',
      'bolt ',
      'taxi',
      'freenow',
    ],
  },

  // — Casa e utenze —
  {
    category: 'Casa',
    kind: 'expense',
    patterns: [
      'enel energia',
      'edison',
      'a2a energia',
      'iren ',
      'hera comm',
      'vodafone',
      'wind tre',
      'windtre',
      'iliad',
      'fastweb',
      'tim spa',
      'ikea',
      'leroy merlin',
      'bricoman',
      'affitto',
      'condominio',
      'canone locazione',
    ],
  },

  // — Salute —
  {
    category: 'Salute',
    kind: 'expense',
    patterns: [
      'farmacia',
      'parafarmacia',
      'ospedale',
      'dentista',
      'studio medico',
      'laboratorio analisi',
      'poliambulatorio',
      'ottica',
    ],
  },

  // — Svago —
  {
    category: 'Svago',
    kind: 'expense',
    patterns: [
      'cinema',
      'ticketone',
      'teatro',
      'museo',
      'steam',
      'playstation',
      'nintendo',
      'twitch',
      'booking com',
      'airbnb',
      'palestra',
    ],
  },

  // — Abbigliamento e shopping —
  {
    category: 'Abbigliamento',
    kind: 'expense',
    patterns: ['zara ', 'h m hennes', 'uniqlo', 'bershka', 'pull bear', 'decathlon', 'primark'],
  },
  {
    category: 'Shopping',
    kind: 'expense',
    patterns: [
      'amazon',
      'alipay',
      'aliexpress',
      'temu',
      'shein',
      'zalando',
      'ebay',
      'mediaworld',
      'unieuro',
      'apple store',
      'etsy',
    ],
  },

  // — Tasse —
  {
    category: 'Tasse',
    kind: 'expense',
    patterns: ['agenzia delle entrate', 'f24', 'imposta', 'bollo auto', 'tari ', 'imu '],
  },
];

/**
 * Regole iniziali dei giroconti tra i propri conti (es. bonifico dal conto corrente al deposito
 * Trade Republic). Hanno un numero di priorità più basso delle altre iniziali: "Trade Republic"
 * deve battere "Alimentari" o "Shopping". Modificabili come tutte le regole.
 */
const TRANSFER_PATTERNS = [
  'trade republic',
  'traderepublic',
  'giroconto',
  'giro conto',
  'trasferimento tra conti',
  'trasferimento a conto',
];

export const TRANSFER_RULE_PRIORITY_START = 950;

export function buildTransferRules(
  categories: readonly Category[],
  now: Date = new Date(),
  newId: () => string = () => uuidv7(now.getTime()),
): CategorizationRule[] {
  const category = categories.find((c) => c.kind === 'transfer');
  if (!category) return [];
  const timestamp = now.toISOString();
  return TRANSFER_PATTERNS.map((pattern, index) => ({
    id: newId(),
    created_at: timestamp,
    updated_at: timestamp,
    deleted: false,
    priority: TRANSFER_RULE_PRIORITY_START + index,
    field: 'description' as const,
    match_type: 'contains' as const,
    pattern,
    category_id: category.id,
    account_id: null,
    amount_min_minor: null,
    amount_max_minor: null,
    source: 'default' as const,
    hit_count: 0,
    is_enabled: true,
  }));
}

/** Priorità di partenza delle regole iniziali: sopra a qualunque regola creata dall'utente. */
export const DEFAULT_RULE_PRIORITY_START = 1000;

/**
 * Regole iniziali per le categorie esistenti (per nome e tipo). Le voci la cui categoria non
 * esiste più si saltano: non si inventano categorie.
 */
export function buildDefaultRules(
  categories: readonly Category[],
  now: Date = new Date(),
  newId: () => string = () => uuidv7(now.getTime()),
): CategorizationRule[] {
  const timestamp = now.toISOString();
  const rules: CategorizationRule[] = [];
  let priority = DEFAULT_RULE_PRIORITY_START;
  for (const seed of SEEDS) {
    const category = categories.find(
      (c) =>
        c.kind === seed.kind &&
        normalizeDescription(c.name) === normalizeDescription(seed.category),
    );
    for (const pattern of seed.patterns) {
      if (!category) {
        priority++;
        continue;
      }
      rules.push({
        id: newId(),
        created_at: timestamp,
        updated_at: timestamp,
        deleted: false,
        priority: priority++,
        field: 'description',
        // Spazio finale = "parola intera" ("zara " non deve scattare per "Zaragoza").
        match_type: pattern.endsWith(' ') ? 'regex' : 'contains',
        pattern: pattern.endsWith(' ') ? `\\b${pattern.trim()}\\b` : pattern,
        category_id: category.id,
        account_id: null,
        amount_min_minor: null,
        amount_max_minor: null,
        source: 'default',
        hit_count: 0,
        is_enabled: true,
      });
    }
  }
  return rules;
}
