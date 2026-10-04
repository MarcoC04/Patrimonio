import { describe, expect, it } from 'vitest';
import { parseCsv } from '../csv';
import { ImportFormatError } from '../helpers';
import { buildXlsx } from '../testing/xlsxBuilder';
import { readXlsx } from '../xlsx';
import { finecoParser } from './fineco';
import { getParser, isParserId, PARSERS } from './index';
import { revolutParser } from './revolut';
import { tradeRepublicParser } from './tradeRepublic';

// Tutti i file di questo test sono SINTETICI: nomi, importi e identificativi sono inventati.
const lines = (...rows: string[]) => parseCsv(rows.join('\n'));

describe('Revolut', () => {
  const header =
    'Tipo,Prodotto,Data di inizio,Data di completamento,Descrizione,Importo,Costo,Valuta,State,Saldo';
  const table = lines(
    header,
    'Pagamento con carta,Attuale,2026-08-29 21:28:10,2026-09-01 03:14:14,Negozio Uno,-9.31,0.00,EUR,COMPLETATO,622.10',
    'Trasferimento,Attuale,2026-09-02 10:00:00,2026-09-02 10:00:05,Da Mario Rossi,150.00,0.00,EUR,COMPLETATO,772.10',
    'Pagamento con carta,Attuale,2026-09-03 12:00:00,,Negozio Due,-20.00,0.00,EUR,IN SOSPESO,',
    'Pagamento con carta,Attuale,2026-09-04 12:00:00,2026-09-05 12:00:00,Negozio Tre,-5.00,0.25,EUR,COMPLETATO,766.85',
    'Pagamento con carta,Attuale,2026-09-05 12:00:00,2026-09-06 12:00:00,Shop USD,-10.00,0.00,USD,COMPLETATO,',
  );

  it('legge data di completamento, importo con segno e valuta', () => {
    const { rows, skipped } = revolutParser.parse(table);
    expect(skipped).toEqual([]);
    expect(rows[0]).toMatchObject({
      line: 2,
      date: '2026-09-01', // data di completamento, non di inizio
      amountMinor: -931,
      currency: 'EUR',
      description: 'Negozio Uno',
      warnings: [],
    });
    expect(rows[1]).toMatchObject({ date: '2026-09-02', amountMinor: 15000 });
  });

  it('il costo si sottrae: −5,00 con 0,25 di costo = −5,25 € (come dice il saldo: 772,10 − 5,25 = 766,85)', () => {
    const { rows } = revolutParser.parse(table);
    expect(rows[3]?.amountMinor).toBe(-525);
  });

  it('le righe non completate sono segnalate; senza data di completamento vale quella di inizio', () => {
    const { rows } = revolutParser.parse(table);
    expect(rows[2]).toMatchObject({ date: '2026-09-03', warnings: ['not_completed'] });
  });

  it('riporta la valuta di ogni riga (il controllo con il conto è dell’importazione)', () => {
    const { rows } = revolutParser.parse(table);
    expect(rows[4]).toMatchObject({ currency: 'USD', amountMinor: -1000 });
  });

  it('le righe vuote si ignorano; data o importo non validi sono scartati con il numero di riga', () => {
    // Con le righe vuote conservate, "riga 3" è davvero la terza riga del file.
    const bad = parseCsv(
      [
        header,
        '',
        'Pagamento,Attuale,non-una-data,,X,-1.00,0.00,EUR,COMPLETATO,',
        'Pagamento,Attuale,2026-09-01 10:00:00,2026-09-01 10:00:00,Y,abc,0.00,EUR,COMPLETATO,',
        'Pagamento,Attuale,2026-09-01 10:00:00,2026-09-01 10:00:00,Z,-2.00,0.00,EUR,COMPLETATO,',
      ].join('\n'),
      undefined,
      true,
    );
    const { rows, skipped } = revolutParser.parse(bad);
    expect(rows.map((r) => r.description)).toEqual(['Z']);
    expect(skipped).toEqual([
      { line: 3, reason: 'bad_date' }, // la riga 2 del file è vuota
      { line: 4, reason: 'bad_amount' },
    ]);
  });

  it('un importo nullo è segnalato', () => {
    const zero = lines(
      header,
      'Altro,Attuale,2026-09-01 10:00:00,2026-09-01 10:00:00,Z,0.00,0.00,EUR,COMPLETATO,',
    );
    expect(revolutParser.parse(zero).rows[0]?.warnings).toEqual(['zero_amount']);
  });

  it('con colonne mancanti dice quali, senza mostrare dati', () => {
    const wrong = lines('Data,Cifra', '2026-01-01,5');
    const error = (() => {
      try {
        revolutParser.parse(wrong);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ImportFormatError);
    const message = (error as Error).message;
    expect(message).toContain('Importo');
    expect(message).toContain('Revolut');
    expect(message).not.toContain('2026-01-01');
  });

  it('accetta il BOM iniziale e righe di titolo prima dell’intestazione', () => {
    const bom = String.fromCharCode(0xfeff);
    const withBom = parseCsv(
      `${bom}Estratto,,\n${header}\nPagamento,Attuale,2026-09-01 10:00:00,2026-09-01 10:00:00,X,-1.00,0.00,EUR,COMPLETATO,`,
    );
    expect(revolutParser.parse(withBom).rows).toHaveLength(1);
  });
});

describe('Fineco', () => {
  const header = [
    'Data_Operazione',
    'Data_Valuta',
    'Entrate',
    'Uscite',
    'Descrizione',
    'Descrizione_Completa',
    'Stato',
  ];
  const data = [
    // entrata con data come testo
    [
      '30/09/2026',
      '30/09/2026',
      329.73,
      null,
      'Bonifico SEPA Estero',
      'Ord: ESEMPIO SRL Ben: TITOLARE Info-Cli: FATTURA 1',
      'Contabilizzato',
    ],
    // data come numero seriale di Excel (46295 = 30/09/2026), uscita con il segno meno
    [46295, 46295, null, -25.5, 'Pagamento POS', 'POS Negozio Uno Roma', 'Contabilizzato'],
    // uscita scritta senza segno
    ['29/09/2026', '29/09/2026', null, 10, 'Pagamento POS', 'POS Negozio Due', 'Contabilizzato'],
    // non ancora contabilizzata
    ['28/09/2026', '28/09/2026', null, 7.2, 'Pagamento POS', 'POS Negozio Tre', 'Prenotato'],
    // riga senza importi (totale in fondo): ignorata
    ['Totale', null, null, null, null, null, null],
    // data non valida con un importo
    ['boh', null, 5, null, 'X', 'Y', 'Contabilizzato'],
  ];

  const parseXlsx = async (rows: (string | number | null)[][]) =>
    finecoParser.parse(await readXlsx(await buildXlsx(rows)));

  it('legge il file Excel vero e proprio: entrate − uscite, date di testo e seriali', async () => {
    const { rows, skipped } = await parseXlsx([header, ...data]);
    expect(rows.map((r) => [r.date, r.amountMinor])).toEqual([
      ['2026-09-30', 32973], // 329,73 in entrata
      ['2026-09-30', -2550], // serial 46295, uscita −25,5
      ['2026-09-29', -1000], // uscita scritta senza segno
      ['2026-09-28', -720],
    ]);
    expect(skipped).toEqual([{ line: 7, reason: 'bad_date' }]);
  });

  it('come descrizione usa quella completa; la breve resta nel testo originale', async () => {
    const { rows } = await parseXlsx([header, ...data]);
    expect(rows[0]).toMatchObject({
      description: 'Ord: ESEMPIO SRL Ben: TITOLARE Info-Cli: FATTURA 1',
      rawDescription: 'Bonifico SEPA Estero – Ord: ESEMPIO SRL Ben: TITOLARE Info-Cli: FATTURA 1',
      currency: 'EUR',
    });
  });

  it('solo "Contabilizzato" è definitivo: le altre righe sono segnalate', async () => {
    const { rows } = await parseXlsx([header, ...data]);
    expect(rows[0]?.warnings).toEqual([]);
    expect(rows[3]?.warnings).toEqual(['not_completed']);
  });

  it('trova l’intestazione anche dopo righe di presentazione e accetta "Data_Opera" troncato', async () => {
    const rows = [
      ['Conto di prova', null, null, null, null, null, null],
      ['Periodo 01/09/2026 - 30/09/2026', null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      [
        'Data_Opera',
        'Data_Valuta',
        'Entrate',
        'Uscite',
        'Descrizione',
        'Descrizione_Completa',
        'Stato',
      ],
      ['30/09/2026', '30/09/2026', 5, null, 'Bonifico', 'Bonifico di prova', 'Contabilizzato'],
    ];
    const result = await parseXlsx(rows);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ date: '2026-09-30', amountMinor: 500, line: 5 });
  });

  it('senza la colonna Stato accetta le righe; senza descrizione completa usa quella breve', async () => {
    const result = await parseXlsx([
      ['Data_Operazione', 'Entrate', 'Uscite', 'Descrizione'],
      ['30/09/2026', 5, null, 'Stipendio di prova'],
    ]);
    expect(result.rows[0]).toMatchObject({ description: 'Stipendio di prova', warnings: [] });
  });

  it('con importi in formato italiano di testo ("1.234,56")', async () => {
    const result = await parseXlsx([
      ['Data_Operazione', 'Entrate', 'Uscite', 'Descrizione'],
      ['30/09/2026', '1.234,56', null, 'Stipendio'],
    ]);
    expect(result.rows[0]?.amountMinor).toBe(123456);
  });

  it('un file con altre colonne dà un errore che elenca quelle mancanti', async () => {
    await expect(
      parseXlsx([
        ['Data', 'Importo'],
        ['01/01/2026', 5],
      ]),
    ).rejects.toBeInstanceOf(ImportFormatError);
  });
});

describe('Trade Republic', () => {
  const header =
    'datetime,"date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"';
  // Costruisce una riga: i campi non indicati restano vuoti.
  const row = (fields: Record<string, string>) => {
    const columns = parseCsv(header)[0] ?? [];
    return columns
      .map((name) => `"${(name === 'datetime' ? fields['datetime'] : fields[name]) ?? ''}"`)
      .join(',');
  };
  const table = lines(
    header,
    row({
      datetime: '2026-09-01T05:52:31.037677Z',
      date: '2026-09-01',
      account_type: 'DEFAULT',
      category: 'CASH',
      type: 'INTEREST_PAYMENT',
      amount: '28.550000',
      tax: '-7.42',
      currency: 'EUR',
      description: 'Interessi di prova',
      transaction_id: 'tx-int-1',
    }),
    row({
      date: '2026-09-01',
      category: 'CASH',
      type: 'CUSTOMER_INPAYMENT',
      amount: '500.00',
      currency: 'EUR',
      description: 'Bonifico in entrata',
      counterparty_name: 'Mario Rossi',
      transaction_id: 'tx-dep-1',
    }),
    row({
      date: '2026-09-02',
      category: 'TRADING',
      type: 'BUY',
      asset_class: 'FUND',
      name: 'ETF Esempio Mondo',
      symbol: 'IE0000000001',
      shares: '1.234567',
      price: '81.0000',
      amount: '-100.000000',
      fee: '-1.00',
      currency: 'EUR',
      description: 'Piano di accumulo',
      transaction_id: 'tx-buy-1',
    }),
    row({
      date: '2026-09-03',
      category: 'TRADING',
      type: 'SELL',
      asset_class: 'FUND',
      name: 'ETF Esempio Mondo',
      symbol: 'IE0000000001',
      shares: '-0.5',
      price: '82.00',
      amount: '41.00',
      fee: '-1.00',
      currency: 'EUR',
      transaction_id: 'tx-sell-1',
    }),
    row({
      date: '2026-09-04',
      category: 'CORPORATE_ACTION',
      type: 'SPLIT',
      name: 'ETF Esempio Mondo',
      shares: '2',
      price: '40',
      amount: '0',
      currency: 'EUR',
      transaction_id: 'tx-act-1',
    }),
    row({
      date: '2026-09-05',
      category: 'TRADING',
      type: 'BUY',
      name: 'ETF Esempio Mondo',
      symbol: 'IE0000000001',
      shares: '1',
      price: '80',
      amount: '80.00',
      currency: 'EUR',
      transaction_id: 'tx-odd-1',
    }),
    row({
      date: '2026-09-06',
      category: 'CASH',
      type: 'CARD_TRANSACTION',
      amount: '-12.30',
      currency: 'EUR',
      description: 'Caffè di prova',
      transaction_id: 'tx-card-1',
    }),
  );

  it('interessi: effetto netto = importo + tasse = 28,55 − 7,42 = 21,13 €', () => {
    const { rows } = tradeRepublicParser.parse(table);
    expect(rows[0]).toMatchObject({
      date: '2026-09-01',
      amountMinor: 2113,
      currency: 'EUR',
      externalId: 'tx-int-1',
      trade: null,
      warnings: [],
    });
  });

  it('bonifico in entrata: usa il nome della controparte come descrizione', () => {
    const { rows } = tradeRepublicParser.parse(table);
    expect(rows[1]).toMatchObject({
      amountMinor: 50000,
      description: 'Mario Rossi',
      externalId: 'tx-dep-1',
    });
  });

  it('acquisto ETF: quote e prezzo esatti, commissioni a parte, denaro uscito 101,00 € (100 + 1)', () => {
    const { rows } = tradeRepublicParser.parse(table);
    expect(rows[2]).toMatchObject({
      amountMinor: -10100,
      description: 'Acquisto ETF Esempio Mondo',
      externalId: 'tx-buy-1',
      warnings: [],
      trade: {
        type: 'buy',
        name: 'ETF Esempio Mondo',
        symbol: 'IE0000000001',
        assetClass: 'FUND',
        quantity: '1.234567',
        unitPrice: '81',
        feeMinor: 100,
      },
    });
  });

  it('vendita: le quote negative diventano quantità positiva; incassato 41,00 − 1,00 = 40,00 €', () => {
    const { rows } = tradeRepublicParser.parse(table);
    expect(rows[3]).toMatchObject({
      amountMinor: 4000,
      trade: { type: 'sell', quantity: '0.5', unitPrice: '82', feeMinor: 100 },
      warnings: [],
    });
  });

  it('un tipo che dice BUY con denaro in entrata ha un verso poco chiaro: escluso in anteprima', () => {
    const { rows } = tradeRepublicParser.parse(table);
    expect(rows[5]?.warnings).toContain('unclear_direction');
  });

  it('categorie che non sono CASH né TRADING (operazioni societarie) sono segnalate', () => {
    const { rows } = tradeRepublicParser.parse(table);
    expect(rows[4]?.warnings).toContain('unknown_type');
    expect(rows[4]?.trade).toBeNull();
  });

  it('pagamento con carta: movimento di liquidità negativo', () => {
    const { rows } = tradeRepublicParser.parse(table);
    expect(rows[6]).toMatchObject({
      amountMinor: -1230,
      description: 'Caffè di prova',
      trade: null,
    });
  });

  it('una riga di trading senza quote e prezzo non è un acquisto: segnalata', () => {
    const odd = lines(
      header,
      row({ date: '2026-09-02', category: 'TRADING', type: 'BUY', amount: '-5', currency: 'EUR' }),
    );
    expect(tradeRepublicParser.parse(odd).rows[0]?.warnings).toContain('unknown_type');
  });

  it('importi o date non validi sono scartati con il numero di riga', () => {
    const bad = lines(
      header,
      row({ date: 'ieri', category: 'CASH', type: 'X', amount: '1', currency: 'EUR' }),
      row({ date: '2026-09-02', category: 'CASH', type: 'X', amount: 'abc', currency: 'EUR' }),
    );
    expect(tradeRepublicParser.parse(bad).skipped).toEqual([
      { line: 2, reason: 'bad_date' },
      { line: 3, reason: 'bad_amount' },
    ]);
  });

  it('senza le colonne di Trade Republic dà un errore chiaro', () => {
    expect(() => tradeRepublicParser.parse(lines('Data,Importo', '2026-01-01,5'))).toThrow(
      ImportFormatError,
    );
  });
});

describe('elenco dei formati', () => {
  it('ogni formato ha un id univoco, un tipo di file e un nome', () => {
    expect(new Set(PARSERS.map((p) => p.id)).size).toBe(PARSERS.length);
    expect(PARSERS.map((p) => [p.id, p.fileKind])).toEqual([
      ['revolut', 'csv'],
      ['fineco', 'xlsx'],
      ['trade_republic', 'csv'],
    ]);
    for (const parser of PARSERS) expect(parser.label).not.toBe('');
  });

  it('si trovano per id', () => {
    expect(getParser('fineco')?.label).toBe('Fineco');
    expect(getParser('boh')).toBeUndefined();
    expect(isParserId('revolut')).toBe(true);
    expect(isParserId('boh')).toBe(false);
  });
});
