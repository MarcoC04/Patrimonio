import { useState } from 'react';
import { connection } from '../../app/connection';
import { SCHEMA_VERSION } from '../../data/schema';
import { buildCsvZipExport, buildJsonExport, type ExportFile } from '../../domain/export';
import { Card } from '../../ui/Card';
import { downloadFile } from '../../ui/download';
import { userMessage } from '../../ui/errors';
import { alertClass, secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';

type Format = 'json' | 'csv';

/** Esportazione dell'intero dataset in un click: JSON, oppure un CSV per scheda in un unico zip. */
export function ExportCard() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const run = async (format: Format) => {
    if (!connection.ok) {
      setMessage({ text: connection.message, isError: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      // Si legge fresco dal foglio: la copia comprende tutto, non solo ciò che è in memoria.
      const tabs = await connection.repository.exportAll();
      const file: ExportFile =
        format === 'json' ? buildJsonExport(tabs, SCHEMA_VERSION) : buildCsvZipExport(tabs);
      downloadFile(file.filename, file.mime, file.data);
      setMessage({ text: strings.exportData.done(file.filename), isError: false });
    } catch (error) {
      setMessage({ text: userMessage(error), isError: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={strings.exportData.title} className="mb-4">
      <p className="mb-3 text-sm text-muted">{strings.exportData.description}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={busy}
          onClick={() => void run('json')}
        >
          {busy ? strings.exportData.exporting : strings.exportData.json}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={busy}
          onClick={() => void run('csv')}
        >
          {busy ? strings.exportData.exporting : strings.exportData.csv}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">{strings.exportData.iosHint}</p>
      {message && (
        <p
          role={message.isError ? 'alert' : 'status'}
          className={`mt-3 text-sm ${message.isError ? alertClass : 'text-fg'}`}
        >
          {message.text}
        </p>
      )}
    </Card>
  );
}
