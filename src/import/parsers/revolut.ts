import { cell, findHeader, isoDatePrefix, technicalAmountToMinor } from '../helpers';
import type { ImportedRow, ParseResult, StatementParser } from '../types';

/**
 * Revolut (CSV). Colonne: Tipo, Prodotto, Data di inizio, Data di completamento, Descrizione,
 * Importo, Costo, Valuta, State, Saldo.
 *
 * - L'effetto sul conto è `Importo − Costo` (il costo è una commissione positiva).
 * - La data è quella di completamento (se manca, quella di inizio).
 * - Si importano le righe `COMPLETATO`; le altre (in sospeso, annullate…) sono escluse in anteprima.
 */
export const revolutParser: StatementParser = {
  id: 'revolut',
  label: 'Revolut',
  fileKind: 'csv',
  accept: '.csv,text/csv',

  parse(table): ParseResult {
    const header = findHeader(
      table,
      ['Data di inizio', 'Descrizione', 'Importo', 'Valuta', 'State'],
      'Revolut',
    );
    const rows: ImportedRow[] = [];
    const skipped: ParseResult['skipped'] = [];

    for (let r = header.headerRow + 1; r < table.length; r++) {
      const cells = table[r] ?? [];
      if (cells.every((c) => c.trim() === '')) continue;
      const line = r + 1;

      const date =
        isoDatePrefix(cell(cells, header, 'Data di completamento')) ??
        isoDatePrefix(cell(cells, header, 'Data di inizio'));
      if (!date) {
        skipped.push({ line, reason: 'bad_date' });
        continue;
      }

      const amount = technicalAmountToMinor(cell(cells, header, 'Importo'));
      const feeText = cell(cells, header, 'Costo');
      const fee = feeText === '' ? 0 : technicalAmountToMinor(feeText);
      if (amount === null || fee === null) {
        skipped.push({ line, reason: 'bad_amount' });
        continue;
      }
      const net = amount - fee;

      const state = cell(cells, header, 'State').toUpperCase();
      const description = cell(cells, header, 'Descrizione') || cell(cells, header, 'Tipo');
      const type = cell(cells, header, 'Tipo');

      const warnings: ImportedRow['warnings'] = [];
      if (state !== 'COMPLETATO' && state !== 'COMPLETED') warnings.push('not_completed');
      if (net === 0) warnings.push('zero_amount');

      rows.push({
        line,
        date,
        amountMinor: net,
        currency: cell(cells, header, 'Valuta').toUpperCase(),
        description,
        rawDescription: [type, description].filter((part) => part !== '').join(' – '),
        externalId: null,
        trade: null,
        balanceMinor: technicalAmountToMinor(cell(cells, header, 'Saldo')),
        sortKey:
          cell(cells, header, 'Data di completamento') || cell(cells, header, 'Data di inizio'),
        warnings,
      });
    }
    return { rows, skipped };
  },
};
