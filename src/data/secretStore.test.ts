import { describe, expect, it } from 'vitest';
import { loadKey, removeKey, saveKey } from './secretStore';

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

describe('secretStore', () => {
  it('salva, rilegge e rimuove la chiave', () => {
    const storage = memoryStorage();
    expect(loadKey(storage)).toBeNull();
    expect(saveKey('abc', storage)).toBe(true);
    expect(loadKey(storage)).toBe('abc');
    removeKey(storage);
    expect(loadKey(storage)).toBeNull();
  });

  it('con storage bloccato non lancia: nessuna chiave, salvataggio fallito', () => {
    expect(loadKey(blocked)).toBeNull();
    expect(saveKey('abc', blocked)).toBe(false);
    expect(() => removeKey(blocked)).not.toThrow();
  });
});
