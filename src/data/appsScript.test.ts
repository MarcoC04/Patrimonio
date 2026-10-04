import { beforeEach, describe, expect, it } from 'vitest';
import { createScript } from './testing/fakeAppsScript';

/** Garanzie di apps-script/Code.gs, provate eseguendo lo script reale su un finto foglio. */

const HEADERS = ['id', 'nome', 'importo'];
const tabs = (extra: Record<string, string[]> = {}) => ({ conti: HEADERS, ...extra });

describe('Code.gs: accesso', () => {
  it('rifiuta una chiave sbagliata senza toccare il foglio', () => {
    const { call, spreadsheet } = createScript();
    expect(call({ action: 'init', tabs: tabs() }, 'sbagliata')).toEqual({
      ok: false,
      error: 'unauthorized',
    });
    expect(spreadsheet.sheets.size).toBe(0);
  });

  it('senza SECRET configurato rifiuta tutto', () => {
    const { call } = createScript({ secret: null });
    expect(call({ action: 'ping' })).toEqual({ ok: false, error: 'not_configured' });
  });

  it('ping con la chiave giusta funziona; azione sconosciuta è bad_request', () => {
    const { call } = createScript();
    expect(call({ action: 'ping' }).ok).toBe(true);
    expect(call({ action: 'cancella-tutto' })).toEqual({ ok: false, error: 'bad_request' });
  });

  it('con il foglio occupato risponde busy', () => {
    const { call } = createScript({ lockAvailable: false });
    expect(call({ action: 'read', tabs: ['x'] })).toEqual({ ok: false, error: 'busy' });
  });
});

describe('Code.gs: init e read', () => {
  it('crea la scheda con intestazioni e formato testo; è idempotente', () => {
    const { call, spreadsheet } = createScript();
    expect(call({ action: 'init', tabs: tabs() })).toEqual({
      ok: true,
      data: { created: ['conti'] },
    });
    const sheet = spreadsheet.getSheetByName('conti');
    expect(sheet?.getRange(1, 1, 1, 3).getDisplayValues()).toEqual([HEADERS]);
    expect(sheet?.frozenRows).toBe(1);
    expect(sheet?.textFormatApplied).toContain('@');

    expect(call({ action: 'init', tabs: tabs() })).toEqual({ ok: true, data: { created: [] } });
  });

  it('non modifica nulla se una scheda esistente ha intestazioni diverse', () => {
    const { call, spreadsheet } = createScript();
    call({ action: 'init', tabs: tabs() });
    const result = call({
      action: 'init',
      tabs: { conti: ['id', 'altro', 'importo'], nuova: ['id'] },
    });
    expect(result).toEqual({ ok: false, error: 'schema' });
    expect(spreadsheet.getSheetByName('nuova')).toBeNull(); // nemmeno la scheda nuova
  });

  it('read restituisce intestazioni e righe come stringhe', () => {
    const { call } = createScript();
    call({ action: 'init', tabs: tabs() });
    call({
      action: 'append',
      appends: [{ tab: 'conti', headers: HEADERS, rows: [['a', 'Uno', '100']] }],
    });
    expect(call({ action: 'read', tabs: ['conti'] })).toEqual({
      ok: true,
      data: { conti: [HEADERS, ['a', 'Uno', '100']] },
    });
  });

  it('read di una scheda inesistente è missing_tab', () => {
    const { call } = createScript();
    expect(call({ action: 'read', tabs: ['non-esiste'] })).toEqual({
      ok: false,
      error: 'missing_tab',
    });
  });
});

describe('Code.gs: append', () => {
  let script: ReturnType<typeof createScript>;
  beforeEach(() => {
    script = createScript();
    script.call({ action: 'init', tabs: tabs({ altri: ['id', 'x'] }) });
  });

  it('aggiunge righe in coda, tenendo i valori come testo (niente formule né numeri)', () => {
    const reply = script.call({
      action: 'append',
      appends: [
        {
          tab: 'conti',
          headers: HEADERS,
          rows: [
            ['a', '=1+1', '0012'],
            ['b', '2026-01-02', '-5'],
          ],
        },
      ],
    });
    // un conteggio per ogni elemento della richiesta: nessuna modifica richiesta → lista vuota
    expect(reply).toEqual({ ok: true, data: { appended: [2], updated: [] } });
    const read = script.call({ action: 'read', tabs: ['conti'] });
    expect(read.data).toEqual({
      conti: [HEADERS, ['a', '=1+1', '0012'], ['b', '2026-01-02', '-5']],
    });
  });

  it('rifiuta una chiave già presente e non scrive nulla, nemmeno nelle altre schede', () => {
    script.call({
      action: 'append',
      appends: [{ tab: 'conti', headers: HEADERS, rows: [['a', 'x', '1']] }],
    });
    const reply = script.call({
      action: 'append',
      appends: [
        { tab: 'altri', headers: ['id', 'x'], rows: [['n1', 'ok']] },
        { tab: 'conti', headers: HEADERS, rows: [['a', 'doppione', '2']] },
      ],
    });
    expect(reply).toEqual({ ok: false, error: 'duplicate_id' });
    expect(script.call({ action: 'read', tabs: ['altri'] }).data).toEqual({ altri: [['id', 'x']] });
  });

  it('rifiuta chiavi duplicate nella stessa richiesta', () => {
    const reply = script.call({
      action: 'append',
      appends: [
        {
          tab: 'conti',
          headers: HEADERS,
          rows: [
            ['z', 'a', '1'],
            ['z', 'b', '2'],
          ],
        },
      ],
    });
    expect(reply).toEqual({ ok: false, error: 'duplicate_id' });
  });

  it('rifiuta intestazioni diverse da quelle del foglio (struttura rotta)', () => {
    const reply = script.call({
      action: 'append',
      appends: [{ tab: 'conti', headers: ['id', 'nome', 'sbagliato'], rows: [['a', 'x', '1']] }],
    });
    expect(reply).toEqual({ ok: false, error: 'schema' });
  });

  it.each([
    ['numero di celle sbagliato', [['a', 'x']]],
    ['cella non testuale', [['a', 'x', 5]]],
    ['chiave vuota', [['', 'x', '1']]],
  ])('rifiuta righe non valide: %s', (_label, rows) => {
    const reply = script.call({
      action: 'append',
      appends: [{ tab: 'conti', headers: HEADERS, rows }],
    });
    expect(reply).toEqual({ ok: false, error: 'bad_request' });
  });

  it('una richiesta vuota è bad_request', () => {
    expect(script.call({ action: 'append', appends: [] })).toEqual({
      ok: false,
      error: 'bad_request',
    });
  });

  it('estende la griglia quando le righe non ci stanno', () => {
    const sheet = script.spreadsheet.getSheetByName('conti');
    if (!sheet) throw new Error('scheda mancante');
    sheet.maxRows = 3; // intestazione + 2 righe libere
    const rows = [
      ['a', 'x', '1'],
      ['b', 'x', '2'],
      ['c', 'x', '3'],
      ['d', 'x', '4'],
    ];
    expect(
      script.call({ action: 'append', appends: [{ tab: 'conti', headers: HEADERS, rows }] }).ok,
    ).toBe(true);
    expect(sheet.getLastRow()).toBe(5);
  });
});

describe('Code.gs: write (modifica per id)', () => {
  let script: ReturnType<typeof createScript>;
  const seed = [
    ['a', 'Uno', '100'],
    ['b', 'Due', '200'],
    ['c', 'Tre', '300'],
  ];
  beforeEach(() => {
    script = createScript();
    script.call({ action: 'init', tabs: tabs() });
    script.call({ action: 'append', appends: [{ tab: 'conti', headers: HEADERS, rows: seed }] });
  });
  const read = () =>
    (script.call({ action: 'read', tabs: ['conti'] }).data as { conti: string[][] }).conti;

  it('sostituisce solo la riga con quell’id, anche se non è l’ultima', () => {
    const reply = script.call({
      action: 'write',
      updates: [{ tab: 'conti', headers: HEADERS, rows: [['b', 'Due modificato', '999']] }],
    });
    expect(reply).toEqual({ ok: true, data: { appended: [], updated: [1] } });
    expect(read()).toEqual([HEADERS, seed[0], ['b', 'Due modificato', '999'], seed[2]]);
  });

  it('inserimenti e modifiche nella stessa richiesta', () => {
    const reply = script.call({
      action: 'write',
      appends: [{ tab: 'conti', headers: HEADERS, rows: [['d', 'Quattro', '400']] }],
      updates: [{ tab: 'conti', headers: HEADERS, rows: [['a', 'Uno bis', '101']] }],
    });
    expect(reply).toEqual({ ok: true, data: { appended: [1], updated: [1] } });
    expect(read()).toEqual([
      HEADERS,
      ['a', 'Uno bis', '101'],
      seed[1],
      seed[2],
      ['d', 'Quattro', '400'],
    ]);
  });

  it('se una modifica ha un id inesistente, non cambia nulla (nemmeno le altre righe)', () => {
    const before = read();
    const reply = script.call({
      action: 'write',
      appends: [{ tab: 'conti', headers: HEADERS, rows: [['d', 'Nuova', '1']] }],
      updates: [
        {
          tab: 'conti',
          headers: HEADERS,
          rows: [
            ['a', 'cambiata', '1'],
            ['zzz', 'fantasma', '2'],
          ],
        },
      ],
    });
    expect(reply).toEqual({ ok: false, error: 'not_found' });
    expect(read()).toEqual(before);
  });

  it('rifiuta di modificare due volte la stessa riga nella stessa richiesta', () => {
    const reply = script.call({
      action: 'write',
      updates: [
        {
          tab: 'conti',
          headers: HEADERS,
          rows: [
            ['a', 'x', '1'],
            ['a', 'y', '2'],
          ],
        },
      ],
    });
    expect(reply).toEqual({ ok: false, error: 'bad_request' });
  });

  it('cancellazione logica: l’app riscrive la riga con deleted=1, che resta nel foglio', () => {
    const { call } = script;
    call({ action: 'init', tabs: { voci: ['id', 'deleted'] } });
    call({
      action: 'append',
      appends: [{ tab: 'voci', headers: ['id', 'deleted'], rows: [['v1', '0']] }],
    });
    call({
      action: 'write',
      updates: [{ tab: 'voci', headers: ['id', 'deleted'], rows: [['v1', '1']] }],
    });
    expect(call({ action: 'read', tabs: ['voci'] }).data).toEqual({
      voci: [
        ['id', 'deleted'],
        ['v1', '1'],
      ],
    });
  });

  it('write senza nulla da fare è bad_request', () => {
    expect(script.call({ action: 'write', appends: [], updates: [] })).toEqual({
      ok: false,
      error: 'bad_request',
    });
  });

  it('una richiesta rifiutata non esegue scritture sul foglio', () => {
    const sheet = script.spreadsheet.getSheetByName('conti');
    const writesBefore = sheet?.writes ?? 0;
    script.call({
      action: 'write',
      updates: [{ tab: 'conti', headers: HEADERS, rows: [['assente', 'x', '1']] }],
    });
    expect(sheet?.writes).toBe(writesBefore);
  });
});
