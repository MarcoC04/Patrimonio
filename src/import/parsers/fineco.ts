import { cell, findHeader, italianAmountToMinor, italianDate } from '../helpers';
import type { ImportedRow, ParseResult, StatementParser } from '../types';

/**
 * Fineco (Excel). Colonne: Data_Operazione, Data_Valuta, Entrate, Uscite, Descrizione,
 * Descrizione_Completa, Stato.
 *
 * - `Entrate` e `Uscite` sono due colonne: l'effetto sul conto è entrate − uscite. Le uscite
 *   si accettano sia scritte con il segno meno sia senza.
 * - Le date possono essere testo (30/09/2026) o date di Excel (numero seriale).
 * - Si importano le righe `Contabilizzato`; le altre sono escluse in anteprima.
 * - Come descrizione si usa quella completa (contiene il nome dell'esercente o del beneficiario).
 */
export const finecoParser: StatementParser = {
  id: 'fineco',
  label: 'Fineco',
  fileKind: 'xlsx',
  accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

  parse(table): ParseResult {
    // "data_opera*" accetta Data_Operazione (e varianti troncate)
    const header = findHeader(table, ['data_opera*', 'Entrate', 'Uscite', 'Descrizione'], 'Fineco');
    const rows: ImportedRow[] = [];
    const skipped: ParseResult['skipped'] = [];

    for (let r = header.headerRow + 1; r < table.length; r++) {
      const cells = table[r] ?? [];
      if (cells.every((c) => c.trim() === '')) continue;
      const line = r + 1;

      const inflowText = cell(cells, header, 'Entrate');
      const outflowText = cell(cells, header, 'Uscite');
      if (inflowText === '' && outflowText === '') {
        // Riga senza importi (titoli, totali, note): non è un movimento.
        continue;
      }

      const date = italianDate(cell(cells, header, 'data_opera'));
      if (!date) {
        skipped.push({ line, reason: 'bad_date' });
        continue;
      }

      const inflow = inflowText === '' ? 0 : italianAmountToMinor(inflowText);
      const outflow = outflowText === '' ? 0 : italianAmountToMinor(outflowText);
      if (inflow === null || outflow === null) {
        skipped.push({ line, reason: 'bad_amount' });
        continue;
      }
      const net = Math.abs(inflow) - Math.abs(outflow);

      const full = cell(cells, header, 'Descrizione_Completa');
      const short = cell(cells, header, 'Descrizione');
      const status = cell(cells, header, 'Stato').toLowerCase();

      const warnings: ImportedRow['warnings'] = [];
      // Senza la colonna Stato non si può dire nulla: si accetta la riga.
      if (status !== '' && !status.startsWith('contabil')) warnings.push('not_completed');
      if (net === 0) warnings.push('zero_amount');

      rows.push({
        line,
        date,
        amountMinor: net,
        currency: 'EUR',
        description: full || short,
        rawDescription: [short, full].filter((part) => part !== '').join(' – '),
        externalId: null,
        trade: null,
        balanceMinor: null,
        warnings,
      });
    }
    return { rows, skipped };
  },
};
