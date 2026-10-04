import { applyChanges } from '../data/dataset';
import type { ChangeSet, Dataset, Repository } from '../data/repository';
import {
  messageForScriptError,
  MIN_SCRIPT_VERSION,
  ScriptError,
  type ScriptClient,
} from '../data/scriptClient';
import { buildDefaultCategories } from '../domain/defaultCategories';

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
    throw new ScriptError('outdated', messageForScriptError('outdated'));
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

  // Le categorie predefinite si creano una volta sola: se l'utente le cancella, non tornano.
  if (data.meta['defaults_seeded'] === '1') return data;
  const changes: ChangeSet = { meta: { defaults_seeded: '1' } };
  if (data.categories.length === 0) {
    changes.categories = { insert: buildDefaultCategories(now) };
  }
  await repository.save(changes);
  return applyChanges(data, changes);
}
