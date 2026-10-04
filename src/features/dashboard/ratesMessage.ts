import { strings } from '../../ui/strings';
import type { RatesState } from './useLatestRates';

/** Il testo dell'avviso sui cambi, o null se va tutto bene (o se i cambi sono ancora in arrivo). */
export function userMessageOrNull(rates: RatesState, missing: readonly string[]): string | null {
  if (rates.status === 'error') return rates.message;
  if (rates.status === 'ready' && missing.length > 0) {
    return strings.dashboard.rates.missing(missing.join(', '));
  }
  return null;
}
