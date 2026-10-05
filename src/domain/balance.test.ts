import { describe, expect, it } from 'vitest';
import {
  computeBalanceUpdate,
  openingForCurrentBalance,
  statementEndBalance,
  type BalanceInput,
} from './balance';

const base = (over: Partial<BalanceInput> = {}): BalanceInput => ({
  account: { opening_balance_minor: 0, opening_date: '2026-10-04' },
  existing: [],
  added: [],
  declaredMinor: null,
  anchorDate: null,
  alreadyAnchored: false,
  ...over,
});

describe('retrodatazione', () => {
  it('conto appena creato (0, oggi): le righe precedenti spostano solo la data di apertura', () => {
    // Movimenti: +100,00 il 01/09 e −30,00 il 05/09. Saldo iniziale ancora ignoto: resta 0,
    // quindi il saldo diventa 70,00 (somma dei movimenti), senza compensazioni inventate.
    const result = computeBalanceUpdate(
      base({
        added: [
          { date: '2026-09-01', amountMinor: 10000 },
          { date: '2026-09-05', amountMinor: -3000 },
        ],
      }),
    );
    expect(result).toMatchObject({
      openingDate: '2026-09-01',
      openingBalanceMinor: 0,
      changed: true,
      backdated: true,
      anchored: false,
    });
  });

  it('saldo iniziale già noto: si compensa, così il saldo attuale non cambia', () => {
    // Apertura il 01/09 con 500,00. Importo un estratto di agosto: +200,00 (10/08), −50,00 (20/08).
    // Il saldo attuale resta 500,00 + movimenti successivi; nuovo iniziale (al 10/08):
    // 500,00 − (200,00 − 50,00) = 350,00. Saldo a fine agosto: 350 + 150 = 500 ✓
    const result = computeBalanceUpdate(
      base({
        account: { opening_balance_minor: 50000, opening_date: '2026-09-01' },
        added: [
          { date: '2026-08-10', amountMinor: 20000 },
          { date: '2026-08-20', amountMinor: -5000 },
        ],
      }),
    );
    expect(result.openingDate).toBe('2026-08-10');
    expect(result.openingBalanceMinor).toBe(35000);
    expect(result.backdated).toBe(true);
  });

  it('righe tutte successive all’apertura: niente da cambiare', () => {
    const result = computeBalanceUpdate(
      base({
        account: { opening_balance_minor: 0, opening_date: '2026-01-01' },
        added: [{ date: '2026-09-01', amountMinor: 100 }],
      }),
    );
    expect(result).toMatchObject({ changed: false, backdated: false, anchored: false });
  });

  it('date non valide non fanno spostare l’apertura', () => {
    const result = computeBalanceUpdate(base({ added: [{ date: 'boh', amountMinor: 1 }] }));
    expect(result.openingDate).toBe('2026-10-04');
  });
});

describe('ancoraggio al saldo dell’estratto', () => {
  it('ricava il saldo iniziale: dichiarato − somma dei movimenti', () => {
    // Estratto di settembre: +1.000,00 (01/09), −9,31 (02/09), −9,31 (03/09); saldo finale 981,38.
    // Somma movimenti = 981,38 → saldo iniziale = 981,38 − 981,38 = 0 (conto aperto a settembre).
    const result = computeBalanceUpdate(
      base({
        added: [
          { date: '2026-09-01', amountMinor: 100000 },
          { date: '2026-09-02', amountMinor: -931 },
          { date: '2026-09-03', amountMinor: -931 },
        ],
        declaredMinor: 98138,
        anchorDate: '2026-09-03',
      }),
    );
    expect(result.openingBalanceMinor).toBe(0);
    expect(result.anchored).toBe(true);
    expect(result.expectedMinor).toBe(98138); // 0 iniziale + movimenti
    expect(result.differenceMinor).toBe(0);
    expect(result.differenceMeaningful).toBe(false); // saldo iniziale prima ignoto: nessun confronto utile
  });

  it('saldo iniziale non nullo: 622,10 dichiarato con movimenti −9,31 −9,31 → iniziale 640,72', () => {
    // 622,10 = iniziale − 9,31 − 9,31  ⇒  iniziale = 622,10 + 18,62 = 640,72
    const result = computeBalanceUpdate(
      base({
        added: [
          { date: '2026-09-01', amountMinor: -931 },
          { date: '2026-09-02', amountMinor: -931 },
        ],
        declaredMinor: 62210,
        anchorDate: '2026-09-02',
      }),
    );
    expect(result.openingBalanceMinor).toBe(64072);
  });

  it('secondo estratto coerente: la differenza è 0 e il saldo torna', () => {
    // Primo estratto già ancorato: iniziale 640,72 al 01/09, movimenti −9,31 −9,31 → 622,10.
    // Secondo estratto: +50,00 (10/09) e −10,00 (12/09); saldo dichiarato 662,10 = 622,10 + 40,00.
    const result = computeBalanceUpdate(
      base({
        account: { opening_balance_minor: 64072, opening_date: '2026-09-01' },
        existing: [
          { date: '2026-09-01', amountMinor: -931 },
          { date: '2026-09-02', amountMinor: -931 },
        ],
        added: [
          { date: '2026-09-10', amountMinor: 5000 },
          { date: '2026-09-12', amountMinor: -1000 },
        ],
        declaredMinor: 66210,
        anchorDate: '2026-09-12',
        alreadyAnchored: true,
      }),
    );
    expect(result.expectedMinor).toBe(66210);
    expect(result.differenceMinor).toBe(0);
    expect(result.differenceMeaningful).toBe(true);
    expect(result.changed).toBe(false);
  });

  it('estratto saltato: la differenza lo segnala (e il saldo si riallinea comunque)', () => {
    // Come sopra ma il saldo dichiarato è 600,00 invece di 662,10: mancano 62,10 di movimenti.
    const result = computeBalanceUpdate(
      base({
        account: { opening_balance_minor: 64072, opening_date: '2026-09-01' },
        existing: [
          { date: '2026-09-01', amountMinor: -931 },
          { date: '2026-09-02', amountMinor: -931 },
        ],
        added: [{ date: '2026-09-10', amountMinor: 4000 }],
        declaredMinor: 60000,
        anchorDate: '2026-09-10',
        alreadyAnchored: true,
      }),
    );
    // Atteso: 640,72 − 9,31 − 9,31 + 40,00 = 662,10
    expect(result.expectedMinor).toBe(66210);
    expect(result.differenceMinor).toBe(60000 - 66210);
    expect(result.differenceMeaningful).toBe(true);
    // Dopo il riallineamento il saldo al 10/09 è quello dell'estratto: 600,00
    expect(result.openingBalanceMinor + (-931 - 931 + 4000)).toBe(60000);
  });

  it('i movimenti dopo il giorno di ancoraggio non entrano nel calcolo del saldo iniziale', () => {
    // Saldo a fine 02/09 = 100,00; un movimento successivo (+5,00 il 09/09) non conta.
    const result = computeBalanceUpdate(
      base({
        existing: [{ date: '2026-09-09', amountMinor: 500 }],
        added: [{ date: '2026-09-02', amountMinor: 1000 }],
        declaredMinor: 10000,
        anchorDate: '2026-09-02',
      }),
    );
    expect(result.openingBalanceMinor).toBe(9000); // 100,00 − 10,00
  });

  it('retrodata e ancora insieme', () => {
    const result = computeBalanceUpdate(
      base({
        added: [{ date: '2026-08-31', amountMinor: 2500 }],
        declaredMinor: 12500,
        anchorDate: '2026-08-31',
      }),
    );
    expect(result).toMatchObject({
      openingDate: '2026-08-31',
      openingBalanceMinor: 10000,
      anchored: true,
      backdated: true,
    });
  });

  it('senza saldo dichiarato non ancora: il saldo iniziale non si tocca', () => {
    const result = computeBalanceUpdate(
      base({
        account: { opening_balance_minor: 1234, opening_date: '2026-01-01' },
        added: [{ date: '2026-09-01', amountMinor: 100 }],
        declaredMinor: 5000,
        anchorDate: null,
      }),
    );
    expect(result).toMatchObject({ openingBalanceMinor: 1234, anchored: false, changed: false });
  });
});

describe('saldo a inizio estratto', () => {
  it('conto nuovo: il saldo iniziale scritto diventa quello del conto, poi si sommano i movimenti', () => {
    // Iniziale 1.000,00; movimenti +21,13 −101,00 +41,00 = −38,87 → finale 961,13
    const result = computeBalanceUpdate(
      base({
        added: [
          { date: '2026-09-01', amountMinor: 2113 },
          { date: '2026-09-02', amountMinor: -10100 },
          { date: '2026-09-03', amountMinor: 4100 },
        ],
        initialMinor: 100000,
      }),
    );
    expect(result.openingBalanceMinor).toBe(100000);
    expect(result.openingDate).toBe('2026-09-01'); // retrodatata alla prima riga
    expect(result.anchored).toBe(true);
    expect(result.differenceMeaningful).toBe(false);
    expect(result.openingBalanceMinor + 2113 - 10100 + 4100).toBe(96113);
  });

  it('conto già noto: conta solo ciò che precede la prima riga e segnala se non torna', () => {
    // Iniziale noto 640,72 al 01/09, movimenti −9,31 (01/09) e −9,31 (02/09) → 622,10.
    // Nuovo estratto dal 10/09, iniziale dichiarato 622,10: coerente (differenza 0).
    const known = {
      account: { opening_balance_minor: 64072, opening_date: '2026-09-01' },
      existing: [
        { date: '2026-09-01', amountMinor: -931 },
        { date: '2026-09-02', amountMinor: -931 },
      ],
      added: [{ date: '2026-09-10', amountMinor: 5000 }],
      alreadyAnchored: true,
    };
    const ok = computeBalanceUpdate(base({ ...known, initialMinor: 62210 }));
    expect(ok.expectedMinor).toBe(62210);
    expect(ok.differenceMinor).toBe(0);
    expect(ok.changed).toBe(false);

    // Se l'utente scrive 600,00 mancano 22,10 di movimenti: segnalato, e si riallinea.
    const off = computeBalanceUpdate(base({ ...known, initialMinor: 60000 }));
    expect(off.differenceMinor).toBe(-2210);
    expect(off.differenceMeaningful).toBe(true);
    expect(off.openingBalanceMinor + (-931 - 931)).toBe(60000);
  });

  it('il saldo a fine estratto, se c’è, ha la precedenza', () => {
    const result = computeBalanceUpdate(
      base({
        added: [{ date: '2026-09-01', amountMinor: 1000 }],
        declaredMinor: 5000,
        anchorDate: '2026-09-01',
        initialMinor: 99999,
      }),
    );
    expect(result.openingBalanceMinor).toBe(4000);
  });
});

describe('statementEndBalance', () => {
  it('prende il saldo dell’ultima riga completata; a pari data, l’ultima del file', () => {
    expect(
      statementEndBalance([
        { date: '2026-09-01', balanceMinor: 100, completed: true },
        { date: '2026-09-03', balanceMinor: 300, completed: true },
        { date: '2026-09-03', balanceMinor: 250, completed: true },
        { date: '2026-09-05', balanceMinor: 999, completed: false }, // in sospeso: non conta
      ]),
    ).toEqual({ balanceMinor: 250, date: '2026-09-03' });
  });

  it('ignora le righe senza saldo; null se nessuna lo ha', () => {
    expect(
      statementEndBalance([
        { date: '2026-09-01', balanceMinor: null, completed: true },
        { date: '2026-09-02', balanceMinor: 50, completed: true },
        { date: '2026-09-03', balanceMinor: null, completed: true },
      ]),
    ).toEqual({ balanceMinor: 50, date: '2026-09-02' });
    expect(
      statementEndBalance([{ date: '2026-09-01', balanceMinor: null, completed: true }]),
    ).toBeNull();
    expect(statementEndBalance([])).toBeNull();
  });

  it('funziona anche con righe in ordine inverso (più recente per prima)', () => {
    expect(
      statementEndBalance([
        { date: '2026-09-03', balanceMinor: 300, completed: true },
        { date: '2026-09-01', balanceMinor: 100, completed: true },
      ]),
    ).toEqual({ balanceMinor: 300, date: '2026-09-03' });
  });
});

describe('ordine delle righe dello stesso giorno', () => {
  it('con l’orario completo vince il completamento più tardi, non l’ultima riga del file', () => {
    expect(
      statementEndBalance([
        { date: '2026-09-30', balanceMinor: 9000, completed: true, sortKey: '2026-09-30 14:00:00' },
        {
          date: '2026-09-30',
          balanceMinor: 10000,
          completed: true,
          sortKey: '2026-09-30 13:00:00',
        },
      ]),
    ).toEqual({ balanceMinor: 9000, date: '2026-09-30' });
  });

  it('a pari orario vince l’ultima riga del file', () => {
    expect(
      statementEndBalance([
        { date: '2026-09-30', balanceMinor: 100, completed: true, sortKey: '2026-09-30 03:17:04' },
        { date: '2026-09-30', balanceMinor: 90, completed: true, sortKey: '2026-09-30 03:17:04' },
      ]),
    ).toEqual({ balanceMinor: 90, date: '2026-09-30' });
  });
});

describe('saldo a inizio estratto con righe già importate', () => {
  it('usa il primo giorno dell’estratto, non la prima riga nuova', () => {
    // Estratto dal 01/09; esistono già i movimenti del 01/09 (+100,00) e 02/09 (−30,00).
    // Nuova riga solo il 05/09 (+10,00). Iniziale dichiarato 1.000,00 € al 01/09:
    // saldo iniziale = 1.000,00 − 0 (nulla prima del 01/09) = 1.000,00; dopo tutto 1.080,00 €.
    const result = computeBalanceUpdate(
      base({
        existing: [
          { date: '2026-09-01', amountMinor: 10000 },
          { date: '2026-09-02', amountMinor: -3000 },
        ],
        added: [{ date: '2026-09-05', amountMinor: 1000 }],
        initialMinor: 100000,
        statementStart: '2026-09-01',
      }),
    );
    expect(result.openingBalanceMinor).toBe(100000);
    expect(result.openingBalanceMinor + 10000 - 3000 + 1000).toBe(108000);
  });

  it('senza righe nuove si può riallineare lo stesso', () => {
    const result = computeBalanceUpdate(
      base({
        existing: [{ date: '2026-09-01', amountMinor: -931 }],
        added: [],
        initialMinor: 50000,
        statementStart: '2026-09-01',
      }),
    );
    expect(result.anchored).toBe(true);
    expect(result.openingBalanceMinor).toBe(50000);
    expect(result.changed).toBe(true);
  });
});

describe('openingForCurrentBalance', () => {
  it('saldo reale meno la somma dei movimenti', () => {
    // movimenti +100,00 −30,00 −9,31 = +60,69; reale 250,00 → iniziale 189,31
    expect(
      openingForCurrentBalance(
        [{ amountMinor: 10000 }, { amountMinor: -3000 }, { amountMinor: -931 }],
        25000,
      ),
    ).toBe(18931);
  });

  it('senza movimenti il saldo iniziale è il saldo reale', () => {
    expect(openingForCurrentBalance([], 12345)).toBe(12345);
  });
});
