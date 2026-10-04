import { describe, expect, it } from 'vitest';
import {
  AUTOLOCK_OPTIONS,
  clearPinRecord,
  createPinRecord,
  DEFAULT_AUTOLOCK_MINUTES,
  loadAutolockMinutes,
  loadPinRecord,
  lockoutSeconds,
  pbkdf2Sha256,
  PIN_PATTERN,
  savePinRecord,
  saveAutolockMinutes,
  shouldLock,
  verifyPin,
} from './pin';

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const enc = (text: string) => new TextEncoder().encode(text);

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

const blocked: Storage = {
  length: 0,
  clear() {
    throw new Error('bloccato');
  },
  getItem() {
    throw new Error('bloccato');
  },
  key() {
    throw new Error('bloccato');
  },
  removeItem() {
    throw new Error('bloccato');
  },
  setItem() {
    throw new Error('bloccato');
  },
};

describe('pbkdf2Sha256', () => {
  it('vettore di prova pubblico (RFC 7914 §11): password "passwd", sale "salt", 1 iterazione', () => {
    // Valore atteso del vettore PBKDF2-HMAC-SHA256 con c=1, dkLen=64 di RFC 7914 inizia con:
    // 55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc...
    // Qui si usano i primi 32 byte, che è la lunghezza che deriviamo.
    return pbkdf2Sha256('passwd', enc('salt'), 1).then((bits) => {
      expect(hex(bits)).toBe('55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc');
    });
  });

  it('è deterministico: stessi dati, stesso risultato; sale diverso, risultato diverso', async () => {
    const a = await pbkdf2Sha256('1234', enc('sale-a'), 10);
    const b = await pbkdf2Sha256('1234', enc('sale-a'), 10);
    const c = await pbkdf2Sha256('1234', enc('sale-b'), 10);
    expect(hex(a)).toBe(hex(b));
    expect(hex(a)).not.toBe(hex(c));
  });
});

describe('createPinRecord e verifyPin', () => {
  it('accetta il PIN giusto e rifiuta uno sbagliato', async () => {
    const record = await createPinRecord('4821', 10);
    expect(await verifyPin('4821', record)).toBe(true);
    expect(await verifyPin('4822', record)).toBe(false);
    expect(await verifyPin('', record)).toBe(false);
  });

  it('non conserva il PIN in chiaro, e ogni record ha un sale diverso', async () => {
    const a = await createPinRecord('4821', 10);
    const b = await createPinRecord('4821', 10);
    expect(JSON.stringify(a)).not.toContain('4821');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash); // stesso PIN, sale diverso → hash diverso
  });
});

describe('storage del record', () => {
  it('salva, rilegge e rimuove', async () => {
    const storage = memoryStorage();
    expect(loadPinRecord(storage)).toBeNull();
    const record = await createPinRecord('4821', 10);
    expect(savePinRecord(record, storage)).toBe(true);
    expect(loadPinRecord(storage)).toEqual(record);
    clearPinRecord(storage);
    expect(loadPinRecord(storage)).toBeNull();
  });

  it('un valore corrotto o di forma sbagliata equivale a nessun PIN', () => {
    for (const raw of [
      'non-json',
      '{}',
      '{"salt":1,"hash":"x","iterations":5}',
      '{"salt":"a","hash":"b","iterations":0}',
      'null',
    ]) {
      const storage = memoryStorage();
      storage.setItem('patrimonio.pin', raw);
      expect(loadPinRecord(storage)).toBeNull();
    }
  });

  it('con storage bloccato non lancia', async () => {
    expect(loadPinRecord(blocked)).toBeNull();
    expect(savePinRecord(await createPinRecord('4821', 10), blocked)).toBe(false);
    expect(() => clearPinRecord(blocked)).not.toThrow();
  });
});

describe('PIN_PATTERN', () => {
  it.each([
    ['1234', true],
    ['12345678', true],
    ['123', false], // troppo corto
    ['123456789', false], // troppo lungo
    ['12a4', false],
    ['', false],
    [' 1234', false],
    ['12 34', false],
  ])('"%s" → %s', (pin, ok) => {
    expect(PIN_PATTERN.test(pin)).toBe(ok);
  });
});

describe('blocco automatico', () => {
  it('scatta esattamente allo scadere: 5 minuti = 300.000 ms', () => {
    const t0 = 1_000_000;
    expect(shouldLock(t0, t0 + 299_999, 5)).toBe(false);
    expect(shouldLock(t0, t0 + 300_000, 5)).toBe(true);
    expect(shouldLock(t0, t0 + 3_600_000, 5)).toBe(true);
    expect(shouldLock(t0, t0, 1)).toBe(false);
  });

  it('il tempo di inattività si salva e rilegge; valori fuori elenco tornano al predefinito', () => {
    const storage = memoryStorage();
    expect(loadAutolockMinutes(storage)).toBe(DEFAULT_AUTOLOCK_MINUTES);
    saveAutolockMinutes(10, storage);
    expect(loadAutolockMinutes(storage)).toBe(10);
    storage.setItem('patrimonio.autolock_minutes', '7'); // non è tra le opzioni
    expect(loadAutolockMinutes(storage)).toBe(DEFAULT_AUTOLOCK_MINUTES);
    storage.setItem('patrimonio.autolock_minutes', 'abc');
    expect(loadAutolockMinutes(storage)).toBe(DEFAULT_AUTOLOCK_MINUTES);
    expect(loadAutolockMinutes(blocked)).toBe(DEFAULT_AUTOLOCK_MINUTES);
    expect(() => saveAutolockMinutes(5, blocked)).not.toThrow();
  });

  it('il valore predefinito è tra le opzioni', () => {
    expect((AUTOLOCK_OPTIONS as readonly number[]).includes(DEFAULT_AUTOLOCK_MINUTES)).toBe(true);
  });
});

describe('lockoutSeconds', () => {
  it.each([
    [0, 0],
    [4, 0],
    [5, 30],
    [7, 30],
    [8, 120],
    [9, 120],
    [10, 300],
    [50, 300],
  ])('%i tentativi sbagliati → %i s di attesa', (attempts, seconds) => {
    expect(lockoutSeconds(attempts)).toBe(seconds);
  });
});
