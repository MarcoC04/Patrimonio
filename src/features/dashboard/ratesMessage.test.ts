import { describe, expect, it } from 'vitest';
import { userMessageOrNull } from './ratesMessage';

describe('userMessageOrNull', () => {
  it('nessun avviso se i cambi ci sono e non manca nulla', () => {
    expect(
      userMessageOrNull({ status: 'ready', rates: { USD: '1.1' }, message: null }, []),
    ).toBeNull();
  });

  it('con un errore mostra il messaggio dell’errore', () => {
    expect(
      userMessageOrNull({ status: 'error', rates: {}, message: 'Servizio non raggiungibile.' }, []),
    ).toBe('Servizio non raggiungibile.');
  });

  it('con valute senza cambio le elenca', () => {
    const text = userMessageOrNull({ status: 'ready', rates: {}, message: null }, ['JPY', 'USD']);
    expect(text).toContain('JPY, USD');
  });

  it('mentre i cambi sono in arrivo non segnala nulla (c’è già l’avviso di attesa)', () => {
    expect(userMessageOrNull({ status: 'loading', rates: {}, message: null }, ['USD'])).toBeNull();
  });
});
