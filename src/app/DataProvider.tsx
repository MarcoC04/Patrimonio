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
import { createFxService, type FxService } from '../data/fxService';
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

export interface DataApi extends FxService {
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
  // Copia dei dati pronti, sempre aggiornata: la usano il salvataggio e la cache dei cambi.
  const dataRef = useRef<Dataset | null>(null);

  const show = useCallback((next: DataState) => {
    dataRef.current = next.status === 'ready' ? next.data : null;
    setState(next);
  }, []);

  const reload = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;

    const run = async () => {
      // Build di prova (VITE_DEMO=1): dati inventati in memoria, senza foglio né chiave.
      // Nella versione pubblicata la condizione è sempre falsa e il modulo non viene incluso.
      if (import.meta.env.VITE_DEMO === '1') {
        const { buildDemoDataset } = await import('../dev/demoDataset');
        show({ status: 'ready', data: buildDemoDataset() });
        return;
      }
      if (!connection.ok) {
        show({ status: 'setup', message: connection.message });
        return;
      }
      if (!loadKey()) {
        show({ status: 'setup', message: strings.errors.noKey });
        return;
      }
      show({ status: 'loading' });
      try {
        const data = await loadAll(connection.client, connection.repository);
        show({ status: 'ready', data });
      } catch (error) {
        show({ status: 'error', message: userMessage(error) });
      }
    };

    const promise = run().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = promise;
    return promise;
  }, [show]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (changes: ChangeSet) => {
      if (import.meta.env.VITE_DEMO !== '1') {
        if (!connection.ok) throw new Error(connection.message);
        await connection.repository.save(changes);
      }
      const current = dataRef.current;
      if (current) show({ status: 'ready', data: applyChanges(current, changes) });
    },
    [show],
  );

  const fx = useMemo(
    () =>
      createFxService({
        fetchRates: (date, symbols) => {
          if (!connection.ok) return Promise.reject(new Error(connection.message));
          return connection.repository.fetchRates(date, symbols);
        },
        cache: () => dataRef.current?.fxRates ?? [],
        save,
      }),
    [save],
  );

  const api = useMemo<DataApi>(
    () => ({ state, reload, save, rateFor: fx.rateFor, latestRates: fx.latestRates }),
    [state, reload, save, fx],
  );
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
