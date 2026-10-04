import { isPositiveDecimal, toPlainDecimal } from '../../domain/decimal';
import { cell, findHeader, isoDatePrefix, technicalAmountToMinor } from '../helpers';
import type { ImportedRow, ImportedTrade, ParseResult, StatementParser } from '../types';

/**
 * Trade Republic (CSV). Colonne: datetime, date, account_type, category, type, asset_class, name,
 * symbol, shares, price, amount, fee, tax, currency, original_amount, original_currency, fx_rate,
 * description, transaction_id, counterparty_name, counterparty_iban, payment_reference, mcc_code.
 *
 * - Effetto netto sul conto = `amount + fee + tax` (commissioni e tasse sono scritte con il segno).
 *   Esempio: interessi lordi 28,55 con 7,42 di tasse → 21,13 accreditati.
 * - Righe `TRADING` con quote e prezzo: acquisti e vendite di titoli (ETF, azioni…). Il verso si
 *   ricava dal tipo (BUY/SELL) e dal segno dell'importo; se discordano la riga è esclusa in anteprima.
 * - Le altre righe di liquidità (interessi, bonifici, carta) sono movimenti del conto.
 * - `transaction_id` serve a non importare mai due volte lo stesso movimento.
 * - Categorie diverse da CASH e TRADING (es. operazioni societarie) sono escluse in anteprima.
 */

function parseTrade(
  cells: readonly string[],
  header: ReturnType<typeof findHeader>,
  type: string,
  amount: number,
  fee: number,
): { trade: ImportedTrade | null; unclear: boolean } {
  const quantityPlain = toPlainDecimal(cell(cells, header, 'shares').replace(/^-/, ''));
  const pricePlain = toPlainDecimal(cell(cells, header, 'price').replace(/^-/, ''));
  if (
    !quantityPlain ||
    !pricePlain ||
    !isPositiveDecimal(quantityPlain) ||
    !isPositiveDecimal(pricePlain)
  ) {
    return { trade: null, unclear: false };
  }

  // Verso: prima dal tipo, poi dal segno dell'importo (negativo = denaro che esce = acquisto).
  const byType = type.includes('SELL') ? 'sell' : type.includes('BUY') ? 'buy' : null;
  const byAmount = amount < 0 ? 'buy' : amount > 0 ? 'sell' : null;
  const direction = byType ?? byAmount;
  const unclear =
    direction === null || (byType !== null && byAmount !== null && byType !== byAmount);

  return {
    unclear,
    trade: {
      type: direction ?? 'buy',
      name: cell(cells, header, 'name'),
      symbol: cell(cells, header, 'symbol'),
      assetClass: cell(cells, header, 'asset_class'),
      quantity: quantityPlain,
      unitPrice: pricePlain,
      feeMinor: Math.abs(fee),
    },
  };
}

export const tradeRepublicParser: StatementParser = {
  id: 'trade_republic',
  label: 'Trade Republic',
  fileKind: 'csv',
  accept: '.csv,text/csv',

  parse(table): ParseResult {
    const header = findHeader(
      table,
      ['date', 'category', 'type', 'amount', 'currency'],
      'Trade Republic',
    );
    const rows: ImportedRow[] = [];
    const skipped: ParseResult['skipped'] = [];

    for (let r = header.headerRow + 1; r < table.length; r++) {
      const cells = table[r] ?? [];
      if (cells.every((c) => c.trim() === '')) continue;
      const line = r + 1;

      const date =
        isoDatePrefix(cell(cells, header, 'date')) ??
        isoDatePrefix(cell(cells, header, 'datetime'));
      if (!date) {
        skipped.push({ line, reason: 'bad_date' });
        continue;
      }

      const amountText = cell(cells, header, 'amount');
      const feeText = cell(cells, header, 'fee');
      const taxText = cell(cells, header, 'tax');
      const amount = amountText === '' ? 0 : technicalAmountToMinor(amountText);
      const fee = feeText === '' ? 0 : technicalAmountToMinor(feeText);
      const tax = taxText === '' ? 0 : technicalAmountToMinor(taxText);
      if (amount === null || fee === null || tax === null) {
        skipped.push({ line, reason: 'bad_amount' });
        continue;
      }
      const net = amount + fee + tax;

      const category = cell(cells, header, 'category').toUpperCase();
      const type = cell(cells, header, 'type').toUpperCase();
      const warnings: ImportedRow['warnings'] = [];

      const parsedTrade =
        category === 'TRADING' ? parseTrade(cells, header, type, amount, fee) : null;
      const trade = parsedTrade?.trade ?? null;
      if (parsedTrade?.unclear) warnings.push('unclear_direction');
      if (category !== 'CASH' && category !== 'TRADING') warnings.push('unknown_type');
      // Una riga di trading senza quote e prezzo non è né un movimento di liquidità né un acquisto
      if (category === 'TRADING' && !trade) warnings.push('unknown_type');
      if (net === 0) warnings.push('zero_amount');

      const descriptionText = cell(cells, header, 'description');
      const name = cell(cells, header, 'name');
      const counterparty = cell(cells, header, 'counterparty_name');
      const description = trade
        ? `${trade.type === 'buy' ? 'Acquisto' : 'Vendita'} ${name || trade.symbol}`
        : counterparty || descriptionText || type;

      rows.push({
        line,
        date,
        amountMinor: net,
        currency: cell(cells, header, 'currency').toUpperCase(),
        description,
        rawDescription: [
          type,
          name,
          counterparty,
          descriptionText,
          cell(cells, header, 'payment_reference'),
        ]
          .filter((part) => part !== '')
          .join(' – '),
        externalId: cell(cells, header, 'transaction_id') || null,
        trade,
        warnings,
      });
    }
    return { rows, skipped };
  },
};
