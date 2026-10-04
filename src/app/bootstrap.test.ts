import { describe, expect, it } from 'vitest';
import { ScriptClient } from '../data/scriptClient';
import { ScriptRepository } from '../data/scriptRepository';
import { createScript, TEST_SECRET } from '../data/testing/fakeAppsScript';
import { DEFAULT_CATEGORIES } from '../domain/defaultCategories';
import { loadAll } from './bootstrap';

const URL = 'https://script.google.com/macros/s/TEST/exec';

function setup(fetchOverride?: typeof fetch) {
  const script = createScript();
  let requests = 0;
  const client = new ScriptClient({
    url: URL,
    getKey: () => TEST_SECRET,
    fetchFn:
      fetchOverride ??
      ((input, init) => {
        requests++;
        return script.fetchFn(input, init);
      }),
    sleep: async () => {},
  });
  return {
    script,
    client,
    repo: new ScriptRepository(client),
    requests: () => requests,
    resetRequests: () => {
      requests = 0;
    },
  };
}

describe('loadAll', () => {
  it('foglio nuovo: crea le schede, prepara le 16 categorie e ricorda di averlo fatto', async () => {
    const { client, repo } = setup();
    const data = await loadAll(client, repo);

    expect(data.categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(data.categories.map((c) => c.name)).toContain('Shopping');
    expect(data.categories.map((c) => c.name)).toContain('Rimborsi');
    expect(data.meta['defaults_seeded']).toBe('1');
    expect(data.accounts).toEqual([]);

    // Rilette dal foglio sono le stesse
    const again = await repo.load();
    expect(again.categories).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it('un secondo avvio non duplica le categorie', async () => {
    const { client, repo } = setup();
    await loadAll(client, repo);
    const second = await loadAll(client, new ScriptRepository(client));
    expect(second.categories).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it('se l’utente ha cancellato tutte le categorie, non tornano', async () => {
    const { client, repo } = setup();
    const first = await loadAll(client, repo);
    await repo.save({
      categories: {
        update: first.categories.map((c) => ({ ...c, deleted: true })),
      },
    });
    const second = await loadAll(client, new ScriptRepository(client));
    expect(second.categories).toEqual([]);
  });

  it('se esistono già categorie ma manca il segno, non ne aggiunge e lo imposta', async () => {
    const { client, repo } = setup();
    await repo.init();
    const empty = await repo.load();
    expect(empty.categories).toEqual([]);
    await repo.save({
      categories: {
        insert: [
          {
            id: 'mia',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            deleted: false,
            name: 'Mia categoria',
            parent_id: null,
            kind: 'expense',
            color: '',
            icon: '',
          },
        ],
      },
    });
    const data = await loadAll(client, new ScriptRepository(client));
    expect(data.categories.map((c) => c.name)).toEqual(['Mia categoria']);
    expect(data.meta['defaults_seeded']).toBe('1');
  });

  it('foglio nuovo: prepara anche le regole iniziali, una volta sola', async () => {
    const { client, repo } = setup();
    const first = await loadAll(client, repo);
    expect(first.categorizationRules.length).toBeGreaterThan(100);
    expect(first.meta['default_rules_seeded']).toBe('1');
    const second = await loadAll(client, new ScriptRepository(client));
    expect(second.categorizationRules).toHaveLength(first.categorizationRules.length);
  });

  it('chi aveva già le categorie (app vecchia) riceve le regole iniziali al primo avvio nuovo', async () => {
    const { client, repo } = setup();
    await repo.init();
    await repo.load();
    const stamp = '2026-01-01T00:00:00.000Z';
    await repo.save({
      categories: {
        insert: [
          {
            id: 'c1',
            created_at: stamp,
            updated_at: stamp,
            deleted: false,
            name: 'Alimentari',
            parent_id: null,
            kind: 'expense',
            color: '',
            icon: '',
          },
        ],
      },
      meta: { defaults_seeded: '1' }, // già avviata con la versione precedente
    });
    const data = await loadAll(client, new ScriptRepository(client));
    expect(data.categorizationRules.length).toBeGreaterThan(0);
    // Solo regole per la categoria che esiste (le altre sono saltate)
    expect(data.categorizationRules.every((r) => r.category_id === 'c1')).toBe(true);
  });

  it('un avvio costa poche richieste: ping + lettura (+ seme solo la prima volta)', async () => {
    const { client, repo, requests, resetRequests } = setup();
    await loadAll(client, repo); // primo avvio: crea schede e categorie
    resetRequests();
    await loadAll(client, new ScriptRepository(client));
    expect(requests()).toBe(2); // ping + una sola lettura di tutte le schede
  });

  it('script troppo vecchio: errore chiaro e nessuna lettura', async () => {
    let requests = 0;
    const oldScript: typeof fetch = async () => {
      requests++;
      return new Response(JSON.stringify({ ok: true, data: {} })); // ping senza versione
    };
    const { client, repo } = setup(oldScript);
    const error = await loadAll(client, repo).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'ScriptError', code: 'outdated' });
    const message = String((error as Error).message);
    expect(message).toContain('Code.gs');
    expect(message).toContain('versione 0'); // indica la versione trovata
    expect(message).toContain('VITE_SCRIPT_URL'); // e la causa più probabile: indirizzo non aggiornato
    expect(requests).toBe(1); // solo il ping
  });

  it('chiave sbagliata: l’errore dello script risale senza toccare il foglio', async () => {
    const script = createScript();
    const client = new ScriptClient({
      url: URL,
      getKey: () => 'chiave-sbagliata',
      fetchFn: script.fetchFn,
      sleep: async () => {},
    });
    await expect(loadAll(client, new ScriptRepository(client))).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(script.spreadsheet.sheets.size).toBe(0);
  });
});
