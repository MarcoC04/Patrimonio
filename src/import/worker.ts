/// <reference lib="webworker" />
import { ImportFileError } from './errors';
import { processStatement, type ProcessedStatement } from './process';
import type { ParserId } from './types';

/**
 * Web Worker: il file si legge fuori dal thread dell'interfaccia e non lascia l'app (nessun
 * upload). Riceve i byte e il formato, risponde con le righe lette oppure con un messaggio.
 */
export interface WorkerRequest {
  bytes: Uint8Array;
  parserId: ParserId;
}

export type WorkerResponse =
  { ok: true; result: ProcessedStatement } | { ok: false; message: string | null };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { bytes, parserId } = event.data;
  processStatement(bytes, parserId).then(
    (result) => self.postMessage({ ok: true, result } satisfies WorkerResponse),
    (error: unknown) => {
      // Solo i messaggi già scritti per l'utente passano; altri errori restano generici (mai dati del file).
      const message = error instanceof ImportFileError ? error.message : null;
      self.postMessage({ ok: false, message } satisfies WorkerResponse);
    },
  );
};
