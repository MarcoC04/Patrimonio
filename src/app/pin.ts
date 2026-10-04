/**
 * Blocco con PIN dell'interfaccia. NON è cifratura e non protegge i dati nel foglio Google:
 * impedisce solo di usare l'app su questo dispositivo senza conoscere il PIN.
 * Del PIN si conserva un hash con sale (PBKDF2-SHA256), mai il PIN in chiaro.
 */

const PIN_STORAGE_KEY = 'patrimonio.pin';
const AUTOLOCK_STORAGE_KEY = 'patrimonio.autolock_minutes';

/** Da 4 a 8 cifre. */
export const PIN_PATTERN = /^\d{4,8}$/;

export const PBKDF2_ITERATIONS = 100_000;
export const AUTOLOCK_OPTIONS = [1, 2, 5, 10, 15, 30] as const;
export const DEFAULT_AUTOLOCK_MINUTES = 5;

export interface PinRecord {
  /** Base64. */
  salt: string;
  /** Base64 dei 32 byte derivati. */
  hash: string;
  iterations: number;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export async function pbkdf2Sha256(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function createPinRecord(
  pin: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<PinRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Sha256(pin, salt, iterations);
  return { salt: toBase64(salt), hash: toBase64(hash), iterations };
}

/** Confronto a tempo costante rispetto al contenuto (non esce al primo byte diverso). */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  const hash = await pbkdf2Sha256(pin, fromBase64(record.salt), record.iterations);
  return sameBytes(hash, fromBase64(record.hash));
}

function isPinRecord(value: unknown): value is PinRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['salt'] === 'string' &&
    typeof v['hash'] === 'string' &&
    typeof v['iterations'] === 'number' &&
    Number.isInteger(v['iterations']) &&
    v['iterations'] > 0
  );
}

/** Legge il record salvato; un valore mancante o corrotto equivale a "nessun PIN". */
export function loadPinRecord(storage: Pick<Storage, 'getItem'> = localStorage): PinRecord | null {
  try {
    const raw = storage.getItem(PIN_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPinRecord(parsed) ? parsed : null;
  } catch {
    // Storage bloccato o JSON non valido: nessun PIN utilizzabile.
    return null;
  }
}

/** Salva il record. Restituisce false se lo storage non è accessibile. */
export function savePinRecord(
  record: PinRecord,
  storage: Pick<Storage, 'setItem'> = localStorage,
): boolean {
  try {
    storage.setItem(PIN_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    // Il chiamante mostra l'errore all'utente.
    return false;
  }
}

export function clearPinRecord(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  try {
    storage.removeItem(PIN_STORAGE_KEY);
  } catch {
    // Se lo storage non è accessibile non c'è nulla da rimuovere.
  }
}

export function loadAutolockMinutes(storage: Pick<Storage, 'getItem'> = localStorage): number {
  try {
    const value = Number(storage.getItem(AUTOLOCK_STORAGE_KEY));
    return (AUTOLOCK_OPTIONS as readonly number[]).includes(value)
      ? value
      : DEFAULT_AUTOLOCK_MINUTES;
  } catch {
    // Storage non accessibile: si usa il valore predefinito.
    return DEFAULT_AUTOLOCK_MINUTES;
  }
}

export function saveAutolockMinutes(
  minutes: number,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(AUTOLOCK_STORAGE_KEY, String(minutes));
  } catch {
    // Preferenza non essenziale: se non si può salvare resta il valore corrente in memoria.
  }
}

/** True se è passato almeno `timeoutMinutes` dall'ultima attività. */
export function shouldLock(lastActiveMs: number, nowMs: number, timeoutMinutes: number): boolean {
  return nowMs - lastActiveMs >= timeoutMinutes * 60_000;
}

/** Attesa dopo i tentativi sbagliati: nessuna fino a 4, poi 30 s, 2 min dall'8°, 5 min dal 10°. */
export function lockoutSeconds(failedAttempts: number): number {
  if (failedAttempts >= 10) return 300;
  if (failedAttempts >= 8) return 120;
  if (failedAttempts >= 5) return 30;
  return 0;
}
