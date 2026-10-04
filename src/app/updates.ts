import { registerSW } from 'virtual:pwa-register';

/**
 * Aggiornamento dell'app installata. Il service worker si aggiorna da solo (autoUpdate), ma una
 * PWA su iPhone di solito viene "ripresa" dal background invece di riaprirsi: senza questi controlli
 * resterebbe a lungo sulla versione vecchia. Quando c'è una versione nuova, la pagina si ricarica.
 */

const CHECK_EVERY_MS = 60 * 60 * 1000;

let registration: ServiceWorkerRegistration | undefined;

async function checkNow(): Promise<void> {
  if (!registration) return;
  try {
    await registration.update();
  } catch {
    // Offline o errore temporaneo: si riprova alla prossima occasione.
  }
}

export function registerUpdates(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, swRegistration) {
      registration = swRegistration;
      if (!swRegistration) return;
      setInterval(() => void checkNow(), CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkNow();
      });
    },
  });
}

/** Controllo manuale (pulsante in Impostazioni). Se esiste una versione nuova la pagina si ricarica da sola. */
export function checkForUpdates(): Promise<void> {
  return checkNow();
}

/** Identificativo della versione in uso: i primi 7 caratteri del commit usati per la build. */
export function buildId(): string {
  const raw: unknown = import.meta.env.VITE_BUILD_ID;
  return typeof raw === 'string' && raw.length > 0 ? raw.slice(0, 7) : 'locale';
}
