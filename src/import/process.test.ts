import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../domain/dedupe';
import { ImportFileError } from './errors';
import { processStatement } from './process';
import { buildXlsx } from './testing/xlsxBuilder';

const REVOLUT_HEADER =
  'Tipo,Prodotto,Data di inizio,Data di completamento,Descrizione,Importo,Costo,Valuta,State,Saldo';
const REVOLUT_ROW =
  'Pagamento con carta,Attuale,2026-08-29 21:28:10,2026-09-01 03:14:14,Negozio Uno,-9.31,0.00,EUR,COMPLETATO,622.10';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('processStatement', () => {
  it('legge un CSV e restituisce righe e impronta del file', async () => {
    const file = bytes(`${REVOLUT_HEADER}\n${REVOLUT_ROW}\n`);
    const result = await processStatement(file, 'revolut');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      date: '2026-09-01',
      amountMinor: -931,
      currency: 'EUR',
      balanceMinor: 62210, // colonna Saldo: 622,10 €
    });
    expect(result.fileHash).toBe(await sha256Hex(file));
  });

  it('lo stesso contenuto dà la stessa impronta, uno diverso no', async () => {
    const a = await processStatement(bytes(`${REVOLUT_HEADER}\n${REVOLUT_ROW}\n`), 'revolut');
    const b = await processStatement(bytes(`${REVOLUT_HEADER}\n${REVOLUT_ROW}\n`), 'revolut');
    const c = await processStatement(bytes(`${REVOLUT_HEADER}\n${REVOLUT_ROW}\n\n`), 'revolut');
    expect(a.fileHash).toBe(b.fileHash);
    expect(a.fileHash).not.toBe(c.fileHash);
  });

  it('legge anche un file in Windows-1252 (non UTF-8): "è" = byte 0xE8', async () => {
    const latin1 = Uint8Array.from(
      [...`${REVOLUT_HEADER}\n${REVOLUT_ROW.replace('Negozio Uno', 'Caffè Uno')}\n`].map((ch) =>
        ch.charCodeAt(0),
      ),
    );
    const result = await processStatement(latin1, 'revolut');
    expect(result.rows[0]?.description).toBe('Caffè Uno');
  });

  it('conserva i numeri di riga del file anche con righe vuote', async () => {
    const file = bytes(`${REVOLUT_HEADER}\n\n${REVOLUT_ROW}\n`);
    const result = await processStatement(file, 'revolut');
    expect(result.rows[0]?.line).toBe(3);
  });

  it('legge un Excel per il formato Fineco', async () => {
    const file = await buildXlsx([
      [
        'Data_Operazione',
        'Data_Valuta',
        'Entrate',
        'Uscite',
        'Descrizione',
        'Descrizione_Completa',
        'Stato',
      ],
      [
        '30/09/2026',
        '30/09/2026',
        '329,73',
        null,
        'Bonifico finto',
        'Bonifico finto da X',
        'Contabilizzato',
      ],
    ]);
    const result = await processStatement(file, 'fineco');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ date: '2026-09-30', amountMinor: 32973 });
  });

  it('file vuoto: messaggio chiaro', async () => {
    await expect(processStatement(new Uint8Array(), 'revolut')).rejects.toBeInstanceOf(
      ImportFileError,
    );
  });

  it('formato sbagliato per il file: errore che nomina il formato scelto', async () => {
    const file = bytes(`${REVOLUT_HEADER}\n${REVOLUT_ROW}\n`);
    await expect(processStatement(file, 'trade_republic')).rejects.toThrow(/Trade Republic/);
  });

  it('un file che non è un Excel scelto per Fineco dà un errore, non un crash', async () => {
    await expect(processStatement(bytes('non sono uno zip'), 'fineco')).rejects.toBeInstanceOf(
      ImportFileError,
    );
  });
});
