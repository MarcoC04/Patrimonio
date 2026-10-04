import { useState } from 'react';
import { buildId, checkForUpdates } from '../../app/updates';
import { Card } from '../../ui/Card';
import { secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';

/** Quale versione gira su questo dispositivo, e un controllo manuale degli aggiornamenti. */
export function AboutCard() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const check = async () => {
    setBusy(true);
    setDone(false);
    try {
      await checkForUpdates();
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={strings.about.title} className="mb-4">
      <p className="mb-3 text-sm">{strings.about.version(buildId())}</p>
      <button
        type="button"
        className={secondaryButtonClass}
        disabled={busy}
        onClick={() => void check()}
      >
        {busy ? strings.about.checking : strings.about.check}
      </button>
      {done && (
        <p role="status" className="mt-3 text-sm text-fg">
          {strings.about.checked}
        </p>
      )}
    </Card>
  );
}
