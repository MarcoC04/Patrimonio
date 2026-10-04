import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { removeKey } from '../data/secretStore';
import {
  clearPinRecord,
  createPinRecord,
  loadAutolockMinutes,
  loadPinRecord,
  lockoutSeconds,
  saveAutolockMinutes,
  savePinRecord,
  shouldLock,
  verifyPin,
  type PinRecord,
} from './pin';

export type UnlockResult =
  { ok: true } | { ok: false; reason: 'wrong' } | { ok: false; reason: 'wait'; seconds: number };

export interface LockApi {
  hasPin: boolean;
  locked: boolean;
  autolockMinutes: number;
  lockNow(): void;
  /** Confronta il PIN con quello salvato, con attese crescenti dopo troppi errori. */
  unlock(pin: string): Promise<UnlockResult>;
  /** Controlla il PIN attuale senza sbloccare (serve per cambiarlo o rimuoverlo). */
  checkPin(pin: string): Promise<boolean>;
  /** Imposta o cambia il PIN. Restituisce false se non si può salvare su questo dispositivo. */
  setPin(pin: string): Promise<boolean>;
  removePin(): void;
  setAutolockMinutes(minutes: number): void;
  /** PIN dimenticato: rimuove PIN e chiave da questo dispositivo (i dati nel foglio non si toccano). */
  resetDevice(): void;
}

const LockContext = createContext<LockApi | null>(null);

/** Quanto spesso si controlla l'inattività mentre l'app è aperta. */
const CHECK_INTERVAL_MS = 5_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;

export function LockProvider({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<PinRecord | null>(() => loadPinRecord());
  // Con un PIN attivo l'app si apre sempre bloccata.
  const [locked, setLocked] = useState(() => loadPinRecord() !== null);
  const [autolockMinutes, setAutolock] = useState(() => loadAutolockMinutes());

  const failedAttempts = useRef(0);
  const lockedUntil = useRef(0);
  const lastActive = useRef(Date.now());

  const hasPin = record !== null;

  // Blocco automatico: dopo `autolockMinutes` senza attività, e al ritorno da un lungo background.
  useEffect(() => {
    if (!hasPin || locked) return;
    lastActive.current = Date.now();

    const markActive = () => {
      lastActive.current = Date.now();
    };
    const check = () => {
      if (shouldLock(lastActive.current, Date.now(), autolockMinutes)) setLocked(true);
    };
    const onVisibility = () => {
      // In background i timer si fermano: al ritorno si controlla subito, prima di toccare altro.
      if (document.visibilityState === 'visible') check();
    };

    for (const event of ACTIVITY_EVENTS)
      window.addEventListener(event, markActive, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, markActive);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }, [hasPin, locked, autolockMinutes]);

  const unlock = useCallback(
    async (pin: string): Promise<UnlockResult> => {
      const now = Date.now();
      if (now < lockedUntil.current) {
        return {
          ok: false,
          reason: 'wait',
          seconds: Math.ceil((lockedUntil.current - now) / 1000),
        };
      }
      if (!record) {
        setLocked(false);
        return { ok: true };
      }
      if (await verifyPin(pin, record)) {
        failedAttempts.current = 0;
        lockedUntil.current = 0;
        lastActive.current = Date.now();
        setLocked(false);
        return { ok: true };
      }
      failedAttempts.current += 1;
      const wait = lockoutSeconds(failedAttempts.current);
      if (wait > 0) {
        lockedUntil.current = Date.now() + wait * 1000;
        return { ok: false, reason: 'wait', seconds: wait };
      }
      return { ok: false, reason: 'wrong' };
    },
    [record],
  );

  const checkPin = useCallback(
    async (pin: string) => (record ? verifyPin(pin, record) : false),
    [record],
  );

  const setPin = useCallback(async (pin: string) => {
    const next = await createPinRecord(pin);
    if (!savePinRecord(next)) return false;
    setRecord(next);
    return true;
  }, []);

  const removePin = useCallback(() => {
    clearPinRecord();
    setRecord(null);
    setLocked(false);
  }, []);

  const setAutolockMinutes = useCallback((minutes: number) => {
    saveAutolockMinutes(minutes);
    setAutolock(minutes);
  }, []);

  const resetDevice = useCallback(() => {
    clearPinRecord();
    removeKey();
    setRecord(null);
    setLocked(false);
    failedAttempts.current = 0;
    lockedUntil.current = 0;
  }, []);

  const api = useMemo<LockApi>(
    () => ({
      hasPin,
      locked,
      autolockMinutes,
      lockNow: () => setLocked(true),
      unlock,
      checkPin,
      setPin,
      removePin,
      setAutolockMinutes,
      resetDevice,
    }),
    [
      hasPin,
      locked,
      autolockMinutes,
      unlock,
      checkPin,
      setPin,
      removePin,
      setAutolockMinutes,
      resetDevice,
    ],
  );

  return <LockContext.Provider value={api}>{children}</LockContext.Provider>;
}

export function useLock(): LockApi {
  const api = useContext(LockContext);
  if (!api) throw new Error('useLock va usato dentro LockProvider.');
  return api;
}
