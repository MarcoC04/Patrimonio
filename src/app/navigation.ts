/** Sezioni dell'app, nell'ordine in cui compaiono nella navigazione. La prima è la schermata iniziale. */
export const NAV_ITEMS = [
  { path: '/', key: 'dashboard' },
  { path: '/movimenti', key: 'transactions' },
  { path: '/budget', key: 'budgets' },
  { path: '/investimenti', key: 'investments' },
  { path: '/impostazioni', key: 'settings' },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]['key'];
