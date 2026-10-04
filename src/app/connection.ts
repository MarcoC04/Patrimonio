import { ScriptClient, ScriptError } from '../data/scriptClient';
import { ScriptRepository } from '../data/scriptRepository';
import { loadKey } from '../data/secretStore';
import { userMessage } from '../ui/errors';
import { strings } from '../ui/strings';

/** Indirizzo dell'app web Apps Script (variabile d'ambiente: non è la chiave, ma non va nel codice). */
const SCRIPT_URL: string | undefined = import.meta.env.VITE_SCRIPT_URL || undefined;

export type Connection =
  { ok: true; client: ScriptClient; repository: ScriptRepository } | { ok: false; message: string };

function createConnection(): Connection {
  if (!SCRIPT_URL) return { ok: false, message: strings.errors.missingScriptUrl };
  try {
    const client = new ScriptClient({
      url: SCRIPT_URL,
      // La chiave si rilegge a ogni richiesta: salvarla o rimuoverla in Impostazioni ha effetto subito.
      getKey: () => {
        const key = loadKey();
        if (!key) throw new ScriptError('no_key', strings.errors.noKey);
        return key;
      },
    });
    return { ok: true, client, repository: new ScriptRepository(client) };
  } catch (error) {
    return { ok: false, message: userMessage(error) };
  }
}

/** Unica connessione dell'app: la UI non crea mai client o repository per conto suo. */
export const connection: Connection = createConnection();
