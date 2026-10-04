/** Valute selezionabili per i conti: quelle pubblicate dalla BCE (e quindi dal servizio cambi). */
export const CURRENCIES = [
  { code: 'EUR', name: 'Euro' },
  { code: 'USD', name: 'Dollaro USA' },
  { code: 'GBP', name: 'Sterlina britannica' },
  { code: 'CHF', name: 'Franco svizzero' },
  { code: 'JPY', name: 'Yen giapponese' },
  { code: 'CAD', name: 'Dollaro canadese' },
  { code: 'AUD', name: 'Dollaro australiano' },
  { code: 'NZD', name: 'Dollaro neozelandese' },
  { code: 'SEK', name: 'Corona svedese' },
  { code: 'NOK', name: 'Corona norvegese' },
  { code: 'DKK', name: 'Corona danese' },
  { code: 'PLN', name: 'Zloty polacco' },
  { code: 'CZK', name: 'Corona ceca' },
  { code: 'HUF', name: 'Fiorino ungherese' },
  { code: 'RON', name: 'Leu rumeno' },
  { code: 'CNY', name: 'Renminbi cinese' },
  { code: 'HKD', name: 'Dollaro di Hong Kong' },
  { code: 'SGD', name: 'Dollaro di Singapore' },
  { code: 'TRY', name: 'Lira turca' },
  { code: 'INR', name: 'Rupia indiana' },
  { code: 'BRL', name: 'Real brasiliano' },
  { code: 'MXN', name: 'Peso messicano' },
  { code: 'ZAR', name: 'Rand sudafricano' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return CURRENCIES.some((c) => c.code === code);
}
