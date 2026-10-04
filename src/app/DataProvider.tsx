import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { applyChanges } from '../data/dataset';
import type { ChangeSet, Dataset } from '../data/repository';
import { loadKey } from '../data/secretStore';
import { userMessage } from '../ui/errors';
import { strings } from '../ui/strings';
import { loadAll } from './bootstrap';
import { connection } from './connection';

export type DataState =
  | { status: 'loading' }
  /** Manca l'indirizzo dello script o la chiave: l'utente deve andare in Impostazioni. */
  | { status: 'setup'; message: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Dataset };

export interface DataApi {
  state: DataState;
  /** Rilegge tutto dal foglio. Chiamate ravvicinate condividono la stessa lettura. */
  reload(): Promise<void>;
  /**
   * Salva un insieme di modifiche in modo atomico. In caso di errore lancia e i dati in
   * memoria restano invariati; a salvataggio riuscito li aggiorna senza riletture.
   */
  save(changes: ChangeSet): Promise<void>;
}

const DataContext = createContext<DataApi | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  // Una sola lettura alla volta: due avvii in parallelo creerebbero due volte le categorie predefinite.
  const inFlight = useRef<Promise<void> | null>(null);

  const reload = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;

    const run = async () => {
      if (!connection.ok) {
        setState({ status: 'setup', message: connection.message });
        return;
      }
      if (!loadKey()) {
        setState({ status: 'setup', message: strings.errors.noKey });
        return;
      }
      setState({ status: 'loading' });
      try {
        const data = await loadAll(connection.client, connection.repository);
        setState({ status: 'ready', data });
      } catch (error) {
        setState({ status: 'error', message: userMessage(error) });
      }
    };

    const promise = run().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (changes: ChangeSet) => {
    if (!connection.ok) throw new Error(connection.message);
    await connection.repository.save(changes);
    setState((previous) =>
      previous.status === 'ready'
        ? { status: 'ready', data: applyChanges(previous.data, changes) }
        : previous,
    );
  }, []);

  const api = useMemo<DataApi>(() => ({ state, reload, save }), [state, reload, save]);
  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}

export function useData(): DataApi {
  const api = useContext(DataContext);
  if (!api) throw new Error('useData va usato dentro DataProvider.');
  return api;
}

/** Dati pronti: per i componenti che vivono dentro <DataGate>. */
export function useReadyData(): Dataset {
  const { state } = useData();
  if (state.status !== 'ready') throw new Error('useReadyData va usato dentro DataGate.');
  return state.data;
}
