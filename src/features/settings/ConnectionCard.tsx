import { useState } from 'react';
import { connection } from '../../app/connection';
import { useData } from '../../app/DataProvider';
import { loadKey, removeKey, saveKey } from '../../data/secretStore';
import { Card } from '../../ui/Card';
import { userMessage } from '../../ui/errors';
import { Field } from '../../ui/Field';
import { alertClass, buttonClass, inputClass, secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';

interface Message {
  text: string;
  isError: boolean;
}

/** Chiave dello script e prova del collegamento. La chiave resta sul dispositivo (ARCHITECTURE.md §2). */
export function ConnectionCard() {
  const { reload } = useData();
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(() => loadKey() !== null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);

  const onSaveKey = async () => {
    const trimmed = keyInput.trim();
    if (trimmed === '') return;
    if (!saveKey(trimmed)) {
      setMessage({ text: strings.errors.keyStorage, isError: true });
      return;
    }
    setKeyInput('');
    setHasKey(true);
    setMessage(null);
    await reload(); // con la chiave appena salvata si caricano subito i dati
  };

  const onRemoveKey = async () => {
    removeKey();
    setHasKey(false);
    setMessage(null);
    await reload();
  };

  const onTest = async () => {
    if (!connection.ok) {
      setMessage({ text: connection.message, isError: true });
      return;
    }
    setBusy(true);
    try {
      const version = await connection.client.ping();
      setMessage({ text: strings.connection.testOk(version), isError: false });
    } catch (error) {
      setMessage({ text: userMessage(error), isError: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={strings.connection.title} className="mb-4">
      {!connection.ok && (
        <p role="alert" className={`${alertClass} mb-3`}>
          {connection.message}
        </p>
      )}
      <p role="status" className="mb-3 text-sm text-slate-700">
        {hasKey ? strings.connection.keySaved : strings.connection.keyMissing}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSaveKey();
        }}
      >
        <Field label={strings.connection.keyLabel} htmlFor="script-key">
          <input
            id="script-key"
            type="password"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            placeholder={strings.connection.keyPlaceholder}
            autoComplete="off"
            className={inputClass}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={keyInput.trim() === ''} className={buttonClass}>
            {strings.connection.saveKey}
          </button>
          <button
            type="button"
            onClick={() => void onTest()}
            disabled={!hasKey || busy}
            className={secondaryButtonClass}
          >
            {busy ? strings.connection.testing : strings.connection.test}
          </button>
          <button
            type="button"
            onClick={() => void onRemoveKey()}
            disabled={!hasKey}
            className={secondaryButtonClass}
          >
            {strings.connection.removeKey}
          </button>
        </div>
      </form>

      {message && (
        <p
          role={message.isError ? 'alert' : 'status'}
          className={`mt-3 text-sm ${message.isError ? alertClass : 'text-slate-800'}`}
        >
          {message.text}
        </p>
      )}
    </Card>
  );
}
