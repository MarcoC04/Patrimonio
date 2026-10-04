/**
 * Chiave dello script salvata sul dispositivo (decisione del proprietario, opzione b).
 * È un'eccezione documentata alla regola "niente localStorage per i token".
 * Nessun dato finanziario passa di qui.
 */
const STORAGE_KEY = 'patrimonio.script_key';

/** Restituisce la chiave salvata, o null se manca o lo storage non è accessibile. */
export function loadKey(storage: Pick<Storage, 'getItem'> = localStorage): string | null {
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    // Storage bloccato (modalità privata, dati del sito disattivati): equivale a "nessuna chiave".
    return null;
  }
}

/** Salva la chiave. Restituisce false se lo storage non è accessibile. */
export function saveKey(key: string, storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try {
    storage.setItem(STORAGE_KEY, key);
    return true;
  } catch {
    // Il chiamante mostra l'errore all'utente.
    return false;
  }
}

export function removeKey(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Se lo storage non è accessibile non c'è nulla da rimuovere.
  }
}
