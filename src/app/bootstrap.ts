import { applyChanges } from '../data/dataset';
import type { ChangeSet, Dataset, Repository } from '../data/repository';
import { MIN_SCRIPT_VERSION, ScriptError, type ScriptClient } from '../data/scriptClient';
import { buildDefaultCategories } from '../domain/defaultCategories';
import { buildDefaultRules } from '../domain/defaultRules';
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
  const version = await client.ping();
  if (version < MIN_SCRIPT_VERSION) {
    throw new ScriptError('outdated', strings.errors.scriptOutdated(version, MIN_SCRIPT_VERSION));
  }

  let data: Dataset;
  try {
    data = await repository.load();
  } catch (error) {
    // Foglio nuovo (o scheda mancante): si creano schede e intestazioni, poi si rilegge.
    if (!(error instanceof ScriptError && error.code === 'missing_tab')) throw error;
    await repository.init();
    data = await repository.load();
  }

  // Categorie e regole predefinite si creano una volta sola: se l'utente le cancella, non tornano.
  const seedCategories = data.meta['defaults_seeded'] !== '1';
  const seedRules = data.meta['default_rules_seeded'] !== '1';
  if (!seedCategories && !seedRules) return data;

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
  changes.meta = meta;
  await repository.save(changes);
  return applyChanges(data, changes);
}
