import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../app/DataProvider';
import type { Dataset } from '../../data/repository';
import type { RateMap } from '../../domain/dashboard';
import { BASE_CURRENCY } from '../../domain/money';
import { userMessage } from '../../ui/errors';

/** Ultimi tassi di cambio per le valute dei conti (servono a rivalutare i saldi in EUR). */
export interface RatesState {
  status: 'loading' | 'ready' | 'error';
  rates: RateMap;
  message: string | null;
}

export function useLatestRates(accounts: Dataset['accounts']): RatesState {
  const { latestRates } = useData();
  const currencies = useMemo(
    () => [...new Set(accounts.map((a) => a.currency))].filter((c) => c !== BASE_CURRENCY).sort(),
    [accounts],
  );
  const [state, setState] = useState<RatesState>({
    status: currencies.length === 0 ? 'ready' : 'loading',
    rates: {},
    message: null,
  });

  useEffect(() => {
    if (currencies.length === 0) {
      setState({ status: 'ready', rates: {}, message: null });
      return;
    }
    let cancelled = false;
    setState((previous) => ({ ...previous, status: 'loading' }));
    latestRates(currencies).then(
      (rates) => {
        if (!cancelled) setState({ status: 'ready', rates, message: null });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', rates: {}, message: userMessage(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [currencies, latestRates]);

  return state;
}
