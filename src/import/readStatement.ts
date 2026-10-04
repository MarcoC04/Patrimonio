import { strings } from '../ui/strings';
import { ImportFileError } from './errors';
import { processStatement, type ProcessedStatement } from './process';
import type { ParserId } from './types';
import type { WorkerRequest, WorkerResponse } from './worker';

/**
 * Legge il file scelto dall'utente in un Web Worker; dove i worker non ci sono (o non partono)
 * lo legge nel thread principale. In ogni caso il contenuto resta in memoria e viene scartato.
 */
export async function readStatement(file: File, parserId: ParserId): Promise<ProcessedStatement> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (typeof Worker === 'undefined') return processStatement(bytes, parserId);

  return new Promise<ProcessedStatement>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    } catch {
      // Worker non disponibile (ambiente restrittivo): si legge qui.
      processStatement(bytes, parserId).then(resolve, reject);
      return;
    }
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      const response = event.data;
      if (response.ok) resolve(response.result);
      else reject(new ImportFileError(response.message ?? strings.errors.import.generic));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new ImportFileError(strings.errors.import.generic));
    };
    const request: WorkerRequest = { bytes, parserId };
    worker.postMessage(request);
  });
}
