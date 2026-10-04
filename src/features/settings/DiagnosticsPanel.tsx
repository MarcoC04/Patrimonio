import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HttpError } from '../../data/retry';
import { SchemaError } from '../../data/rows';
import { loadKey, removeKey, saveKey } from '../../data/secretStore';
import { ScriptClient, ScriptError } from '../../data/scriptClient';
import { appendTestRow, initTestSheet, readTestRows, type TestRow } from '../../data/testSheet';
import { strings } from '../../ui/strings';

const SCRIPT_URL: string | undefined = import.meta.env.VITE_SCRIPT_URL || undefined;

const buttonClass =
  'inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-45';
const inputClass =
  'min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base';

interface LogEntry {
  id: number;
  time: string;
  text: string;
  isError: boolean;
}

/** Solo gli errori nostri hanno messaggi sicuri da mostrare; gli altri restano generici. */
function userMessage(error: unknown): string {
  if (error instanceof HttpError || error instanceof SchemaError || error instanceof ScriptError) {
    return error.message;
  }
  if (error instanceof TypeError) return strings.errors.network;
  return strings.errors.unknown;
}

function keyState(): string {
  return loadKey() ? strings.labels.keySaved : strings.labels.keyMissing;
}

function Subsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mt-6 first:mt-0">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </section>
  );
}

export function DiagnosticsPanel() {
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(() => loadKey() !== null);
  const [rows, setRows] = useState<TestRow[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logCounter = useRef(0);

  const addLog = useCallback((message: string, isError = false) => {
    logCounter.current += 1;
    const entry: LogEntry = {
      id: logCounter.current,
      time: new Date().toLocaleTimeString('it-IT'),
      text: message,
      isError,
    };
    setLog((previous) => [entry, ...previous].slice(0, 50));
  }, []);

  // Il client si crea solo con un indirizzo valido; altrimenti l'errore è mostrato in evidenza.
  const { client, setupError } = useMemo(() => {
    if (!SCRIPT_URL) return { client: null, setupError: strings.errors.missingScriptUrl };
    try {
      const created = new ScriptClient({
        url: SCRIPT_URL,
        getKey: () => {
          const key = loadKey();
          if (!key) throw new ScriptError('no_key', strings.errors.noKey);
          return key;
        },
      });
      return { client: created, setupError: null };
    } catch (error) {
      return { client: null, setupError: userMessage(error) };
    }
  }, []);

  useEffect(() => {
    if (setupError) addLog(setupError, true);
    else addLog(strings.log.ready);
  }, [setupError, addLog]);

  // Test iOS: dopo il ritorno dal background la chiave salvata c'è ancora?
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setHasKey(loadKey() !== null);
      addLog(strings.log.backInForeground(keyState()));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [addLog]);

  /** Esegue un'azione registrando l'esito; gli errori non restano mai silenziosi. */
  const run = async (action: (script: ScriptClient) => Promise<void>) => {
    if (!client) return;
    setBusy(true);
    try {
      await action(client);
    } catch (error) {
      addLog(userMessage(error), true);
    } finally {
      setBusy(false);
    }
  };

  const onSaveKey = () => {
    const trimmed = keyInput.trim();
    if (trimmed === '') return;
    if (!saveKey(trimmed)) {
      addLog(strings.errors.keyStorage, true);
      return;
    }
    setKeyInput('');
    setHasKey(true);
    addLog(strings.log.keySaved);
  };

  const onRemoveKey = () => {
    removeKey();
    setHasKey(false);
    setRows(null);
    addLog(strings.log.keyRemoved);
  };

  const testConnection = () =>
    run(async (script) => {
      await script.ping();
      addLog(strings.log.connectionOk);
    });

  const initSheet = () =>
    run(async (script) => {
      addLog(strings.log.sheetReady(await initTestSheet(script)));
    });

  const readRows = () =>
    run(async (script) => {
      const result = await readTestRows(script);
      setRows(result);
      addLog(strings.log.rowsRead(result.length));
    });

  const addRow = () =>
    run(async (script) => {
      await appendTestRow(script, text.trim());
      addLog(strings.log.rowAdded);
      setText('');
      setRows(await readTestRows(script));
    });

  const ready = client !== null && hasKey;

  return (
    <div>
      <Subsection title={strings.sections.connection}>
        {setupError && (
          <p
            role="alert"
            className="mb-3 rounded-lg border-2 border-red-700 p-3 text-sm font-semibold text-red-700"
          >
            {setupError}
          </p>
        )}
        <p role="status" className="mb-3 text-sm text-slate-700">
          {hasKey ? strings.labels.keySaved : strings.labels.keyMissing}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSaveKey();
          }}
        >
          <label htmlFor="script-key" className="mb-1 block text-sm">
            {strings.labels.key}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="script-key"
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder={strings.labels.keyPlaceholder}
              autoComplete="off"
              className={inputClass}
            />
            <button type="submit" disabled={keyInput.trim() === ''} className={buttonClass}>
              {strings.actions.saveKey}
            </button>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={testConnection}
            disabled={!ready || busy}
            className={buttonClass}
          >
            {strings.actions.testConnection}
          </button>
          <button
            type="button"
            onClick={onRemoveKey}
            disabled={!hasKey || busy}
            className={buttonClass}
          >
            {strings.actions.removeKey}
          </button>
        </div>
      </Subsection>

      <Subsection title={strings.sections.sheet}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={initSheet}
            disabled={!ready || busy}
            className={buttonClass}
          >
            {strings.actions.initSheet}
          </button>
          <button
            type="button"
            onClick={readRows}
            disabled={!ready || busy}
            className={buttonClass}
          >
            {strings.actions.readRows}
          </button>
        </div>

        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void addRow();
          }}
        >
          <label htmlFor="row-text" className="mb-1 block text-sm">
            {strings.labels.rowText}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="row-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={strings.labels.rowTextPlaceholder}
              autoComplete="off"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={!ready || busy || text.trim() === ''}
              className={buttonClass}
            >
              {strings.actions.addRow}
            </button>
          </div>
        </form>

        {rows !== null &&
          (rows.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">{strings.labels.noRows}</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-col py-2 text-sm">
                  <strong>{row.testo}</strong>
                  <span className="text-slate-600">
                    {strings.labels.createdAt} {new Date(row.created_at).toLocaleString('it-IT')}
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </Subsection>

      <Subsection title={strings.sections.log}>
        <ul className="text-sm">
          {log.map((entry) => (
            <li
              key={entry.id}
              className={`py-1 ${entry.isError ? 'font-semibold text-red-700' : ''}`}
            >
              <time className="mr-2 text-slate-600">{entry.time}</time>
              {entry.text}
            </li>
          ))}
        </ul>
      </Subsection>
    </div>
  );
}
