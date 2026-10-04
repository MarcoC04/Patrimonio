import { useState } from 'react';
import { useLock } from '../../app/LockProvider';
import { AUTOLOCK_OPTIONS, PIN_PATTERN } from '../../app/pin';
import { Card } from '../../ui/Card';
import { Field } from '../../ui/Field';
import {
  alertClass,
  buttonClass,
  dangerButtonClass,
  inputClass,
  secondaryButtonClass,
} from '../../ui/styles';
import { strings } from '../../ui/strings';

const digitsOnly = (value: string) => value.replace(/\D/g, '');

const pinInput = (id: string, value: string, onChange: (v: string) => void) => (
  <input
    id={id}
    type="password"
    inputMode="numeric"
    autoComplete="off"
    maxLength={8}
    value={value}
    onChange={(event) => onChange(digitsOnly(event.target.value))}
    className={inputClass}
  />
);

/** Attivazione, cambio e rimozione del PIN, più il tempo del blocco automatico. */
export function PinCard() {
  const lock = useLock();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  const fail = (text: string) => setMessage({ text, isError: true });

  /** Per cambiare o rimuovere serve il PIN attuale. */
  const currentIsValid = async (): Promise<boolean> => {
    if (!lock.hasPin) return true;
    if (await lock.checkPin(current)) return true;
    fail(strings.pin.issues.wrongCurrent);
    return false;
  };

  const save = async () => {
    setMessage(null);
    if (!PIN_PATTERN.test(next)) return fail(strings.pin.issues.format);
    if (next !== confirm) return fail(strings.pin.issues.mismatch);
    setBusy(true);
    try {
      if (!(await currentIsValid())) return;
      if (!(await lock.setPin(next))) return fail(strings.pin.issues.storage);
      reset();
      setMessage({ text: strings.pin.saved, isError: false });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setMessage(null);
    setBusy(true);
    try {
      if (!(await currentIsValid())) return;
      lock.removePin();
      reset();
      setMessage({ text: strings.pin.removed, isError: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={strings.pin.title} className="mb-4">
      <p className="mb-3 text-sm text-slate-700">{strings.pin.notice}</p>
      <p role="status" className="mb-3 text-sm font-medium">
        {lock.hasPin ? strings.pin.enabled : strings.pin.disabled}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {lock.hasPin && (
          <Field label={strings.pin.currentPin} htmlFor="pin-current">
            {pinInput('pin-current', current, setCurrent)}
          </Field>
        )}
        <Field label={strings.pin.newPin} htmlFor="pin-new">
          {pinInput('pin-new', next, setNext)}
        </Field>
        <Field label={strings.pin.confirmPin} htmlFor="pin-confirm">
          {pinInput('pin-confirm', confirm, setConfirm)}
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={buttonClass}>
            {lock.hasPin ? strings.pin.change : strings.pin.enable}
          </button>
          {lock.hasPin && (
            <button
              type="button"
              disabled={busy}
              className={dangerButtonClass}
              onClick={() => void remove()}
            >
              {strings.pin.remove}
            </button>
          )}
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

      {lock.hasPin && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <Field label={strings.pin.autolock} htmlFor="pin-autolock">
            <select
              id="pin-autolock"
              value={lock.autolockMinutes}
              onChange={(event) => lock.setAutolockMinutes(Number(event.target.value))}
              className={inputClass}
            >
              {AUTOLOCK_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {strings.pin.minutes(minutes)}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className={secondaryButtonClass} onClick={lock.lockNow}>
            {strings.pin.lockNow}
          </button>
        </div>
      )}
    </Card>
  );
}
