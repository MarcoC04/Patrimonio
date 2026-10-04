/** Errore HTTP delle API Google. Il corpo della risposta non viene incluso (potrebbe contenere dati). */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export interface BackoffOptions {
  /** Numero massimo di nuovi tentativi dopo il primo. */
  retries?: number;
  /** Attesa prima del primo nuovo tentativo; raddoppia a ogni tentativo. */
  baseDelayMs?: number;
  /** Iniettabile nei test. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Esegue `fn` e, su HTTP 429 (quota superata), riprova con backoff esponenziale:
 * baseDelayMs, 2×, 4×, ... Qualunque altro errore viene rilanciato subito.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  options: BackoffOptions = {},
): Promise<T> {
  const { retries = 5, baseDelayMs = 1000, sleep = defaultSleep } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isQuota = error instanceof HttpError && error.status === 429;
      if (!isQuota || attempt >= retries) throw error;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
}
