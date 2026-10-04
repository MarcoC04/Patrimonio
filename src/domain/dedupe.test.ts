import { describe, expect, it } from 'vitest';
import { dedupeHashes, normalizeDescription, sha256Hex } from './dedupe';

describe('normalizeDescription', () => {
  it.each([
    ['POS Negozio  Uno, ROMA!', 'pos negozio uno roma'],
    ['Caffè perché già', 'caffe perche gia'], // accenti tolti
    ['  A-B/C  ', 'a b c'],
    ['Ord: STRIPE Ben: X Dt-ord: 30/09/2026', 'ord stripe ben x dt ord 30 09 2026'],
    ['', ''],
    ['***', ''],
  ])('"%s" → "%s"', (input, expected) => {
    expect(normalizeDescription(input)).toBe(expected);
  });

  it('descrizioni scritte in modo diverso ma uguali nella sostanza coincidono', () => {
    expect(normalizeDescription('NEGOZIO UNO - Roma')).toBe(
      normalizeDescription('negozio uno roma'),
    );
  });
});

describe('sha256Hex', () => {
  it('vettori di prova noti: "" e "abc"', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('accetta anche byte (l’impronta di un file)', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('dedupeHashes', () => {
  const row = (over: Partial<Parameters<typeof dedupeHashes>[1][number]> = {}) => ({
    date: '2026-09-01',
    amountMinor: -931,
    description: 'Negozio Uno',
    externalId: null,
    ...over,
  });

  it('è stabile: stessi dati, stesso hash; esadecimale di 64 caratteri', async () => {
    const [a] = await dedupeHashes('acc', [row()]);
    const [b] = await dedupeHashes('acc', [row()]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cambia se cambia conto, data, importo o descrizione', async () => {
    const [base] = await dedupeHashes('acc', [row()]);
    expect((await dedupeHashes('altro', [row()]))[0]).not.toBe(base);
    expect((await dedupeHashes('acc', [row({ date: '2026-09-02' })]))[0]).not.toBe(base);
    expect((await dedupeHashes('acc', [row({ amountMinor: -932 })]))[0]).not.toBe(base);
    expect((await dedupeHashes('acc', [row({ description: 'Negozio Due' })]))[0]).not.toBe(base);
  });

  it('ignora maiuscole, accenti e punteggiatura nella descrizione', async () => {
    const [a] = await dedupeHashes('acc', [row({ description: 'Caffè  del Centro!' })]);
    const [b] = await dedupeHashes('acc', [row({ description: 'CAFFE del centro' })]);
    expect(a).toBe(b);
  });

  it('due righe identiche nello stesso giorno hanno hash diversi (due caffè allo stesso prezzo)', async () => {
    const [first, second, third] = await dedupeHashes('acc', [row(), row(), row()]);
    expect(new Set([first, second, third]).size).toBe(3);
  });

  it('reimportando lo stesso file si ottengono gli stessi hash, nello stesso ordine', async () => {
    const rows = [row(), row(), row({ description: 'Altro' })];
    expect(await dedupeHashes('acc', rows)).toEqual(await dedupeHashes('acc', rows));
  });

  it('con un identificativo della banca si usa quello, senza guardare il testo', async () => {
    const hashes = await dedupeHashes('acc', [
      row({ externalId: 'tx-1' }),
      row({ externalId: 'tx-1', description: 'Descrizione diversa', amountMinor: 5 }),
      row({ externalId: 'tx-2' }),
    ]);
    expect(hashes).toEqual(['ext:tx-1', 'ext:tx-1', 'ext:tx-2']);
  });

  it('mescolando righe con e senza identificativo, il conteggio delle identiche riguarda solo quelle senza', async () => {
    const [a, b, c] = await dedupeHashes('acc', [row(), row({ externalId: 'tx-1' }), row()]);
    expect(a).not.toBe(c); // prima e seconda riga identica senza id
    expect(b).toBe('ext:tx-1');
  });
});
