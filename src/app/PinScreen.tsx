import { useState, type ReactNode } from 'react';
import { alertClass, buttonClass, inputClass, secondaryButtonClass } from '../ui/styles';
import { strings } from '../ui/strings';
import { useLock } from './LockProvider';

/**
 * Mostra l'app solo da sbloccata. Da bloccata i figli NON sono montati: i dati in memoria
 * (DataProvider) vengono scartati e si rileggono dopo lo sblocco.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { locked } = useLock();
  return locked ? <PinScreen /> : <>{children}</>;
}

function PinScreen() {
  const { unlock, resetDevice } = useLock();
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const result = await unlock(pin);
      if (result.ok) return;
      setPin('');
      setMessage(
        result.reason === 'wait'
          ? strings.pin.screen.wait(result.seconds)
          : strings.pin.screen.wrong,
      );
    } finally {
      setBusy(false);
    }
  };

  const forgot = () => {
    if (
      window.confirm(`${strings.pin.screen.forgotConfirm}\n\n${strings.pin.screen.forgotWarning}`)
    ) {
      resetDevice();
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="mb-1 text-2xl font-bold">{strings.appTitle}</h1>
      <p className="mb-6 text-slate-700">{strings.pin.screen.title}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="pin-input" className="mb-1 block text-sm font-medium">
          {strings.pin.screen.label}
        </label>
        <input
          id="pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={8}
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          className={`${inputClass} mb-3 text-center text-xl tracking-widest`}
        />
        {message && (
          <p role="alert" className={`${alertClass} mb-3`}>
            {message}
          </p>
        )}
        <button type="submit" disabled={busy || pin.length < 4} className={`${buttonClass} w-full`}>
          {strings.pin.screen.unlock}
        </button>
      </form>
      <button type="button" className={`${secondaryButtonClass} mt-4`} onClick={forgot}>
        {strings.pin.screen.forgot}
      </button>
    </main>
  );
}
