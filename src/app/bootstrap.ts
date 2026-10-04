import { applyChanges } from '../data/dataset';
import type { ChangeSet, Dataset, Repository } from '../data/repository';
import { MIN_SCRIPT_VERSION, ScriptError, type ScriptClient } from '../data/scriptClient';
import { buildDefaultCategories } from '../domain/defaultCategories';
import { buildDefaultRules, buildTransferRules } from '../domain/defaultRules';
import { strings } from '../ui/strings';

/**
 * Sequenza di avvio: controlla la versione dello script, legge i dati (creando schede e
 * intestazioni al primo avvio) e prepara le categorie predefinite una volta sola.
 * Ogni errore risale al chiamante, che lo mostra: nessuna scrittura se i dati non sono validi.
 */
export async function loadAll(
  client: Pick<ScriptClient, 'ping'>,
  repository: Repository,
  now: Date = new Date(),
): Promise<Dataset> {
  // Verifica della versione e lettura partono insieme: ogni chiamata allo script costa 1-2 s e
  // in sequenza si sommerebbero. La lettura non scrive nulla; prima di qualsiasi scrittura
  // (creazione delle schede, semi) si aspetta comunque l'esito della verifica.
  const pinged = client.ping();
  const firstLoad = repository.load().then(
    (loaded) => ({ ok: true as const, loaded }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  const version = await pinged;
  if (version < MIN_SCRIPT_VERSION) {
    throw new ScriptError('outdated', strings.errors.scriptOutdated(version, MIN_SCRIPT_VERSION));
  }

  let data: Dataset;
  const first = await firstLoad;
  if (first.ok) {
    data = first.loaded;
  } else {
    // Foglio nuovo (o scheda mancante): si creano schede e intestazioni, poi si rilegge.
    const error = first.error;
    if (!(error instanceof ScriptError && error.code === 'missing_tab')) throw error;
    await repository.init();
    data = await repository.load();
  }

  // Categorie e regole predefinite si creano una volta sola: se l'utente le cancella, non tornano.
  const seedCategories = data.meta['defaults_seeded'] !== '1';
  const seedRules = data.meta['default_rules_seeded'] !== '1';
  // Regole dei giroconti: aggiunte una volta sola anche a chi aveva già le altre regole iniziali.
  const seedTransfers = data.meta['default_transfer_rules_seeded'] !== '1';
  if (!seedCategories && !seedRules && !seedTransfers) return data;

  const changes: ChangeSet = { meta: {} };
  const meta: Record<string, string> = {};
  let categories = data.categories;
  if (seedCategories) {
    meta['defaults_seeded'] = '1';
    if (data.categories.length === 0) {
      categories = buildDefaultCategories(now);
      changes.categories = { insert: categories };
    }
  }
  if (seedRules) {
    meta['default_rules_seeded'] = '1';
    // Solo se non ci sono già regole: non si aggiungono a quelle scritte dall'utente.
    const rules = data.categorizationRules.length === 0 ? buildDefaultRules(categories, now) : [];
    if (rules.length > 0) changes.categorizationRules = { insert: rules };
  }
  if (seedTransfers) {
    meta['default_transfer_rules_seeded'] = '1';
    const transfers = buildTransferRules(categories, now);
    if (transfers.length > 0) {
      const planned = changes.categorizationRules?.insert ?? [];
      changes.categorizationRules = { insert: [...planned, ...transfers] };
    }
  }
  changes.meta = meta;
  await repository.save(changes);
  return applyChanges(data, changes);
}
