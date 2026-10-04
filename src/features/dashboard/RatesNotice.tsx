import { userMessageOrNull } from './ratesMessage';
import type { RatesState } from './useLatestRates';
import { alertClass } from '../../ui/styles';
import { strings } from '../../ui/strings';

/** Avvisa quando i cambi sono in arrivo, non disponibili o mancano per qualche valuta. */
export function RatesNotice({ rates, missing }: { rates: RatesState; missing: readonly string[] }) {
  if (rates.status === 'loading') {
    return (
      <p role="status" className="mt-2 text-xs text-muted">
        {strings.dashboard.rates.loading}
      </p>
    );
  }
  const text = userMessageOrNull(rates, missing);
  if (!text) return null;
  return (
    <p role="alert" className={`${alertClass} mt-2`}>
      {text}
    </p>
  );
}
