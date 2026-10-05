import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../../dev/demoDataset';
import { resolvePeriod } from '../../domain/period';
import { buildOverview } from './overviewModel';

const NOW = new Date(2026, 9, 5); // 5 ottobre 2026
const TODAY = '2026-10-05';
const data = buildDemoDataset(NOW);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const model = (preset: Parameters<typeof resolvePeriod>[0]['preset'], accountIds: string[] = []) =>
  buildOverview({
    data,
    range: resolvePeriod({ preset, from: '', to: '' }, TODAY),
    accountIds,
    rates: {},
    today: TODAY,
  });

describe('buildOverview: i numeri devono tornare tra loro', () => {
  it('il patrimonio è la somma di conti e investimenti, ed è l’ultimo punto del grafico', () => {
    const m = model('1A');
    expect(m.wealth.totalMinor).toBe(m.wealth.accountsMinor + m.wealth.investmentsMinor);
    expect(m.series[m.series.length - 1]?.totalMinor).toBe(m.wealth.totalMinor);
    expect(m.series[m.series.length - 1]?.date).toBe(TODAY);
  });

  it('la torta somma i conti in positivo e gli investimenti; i saldi sommano ai conti', () => {
    const m = model('1A');
    // un conto in rosso non è un'attività: non compare nella torta ma pesa sul patrimonio netto
    const positive = sum(m.balances.map((b) => b.balanceMinor).filter((v) => v > 0));
    expect(sum(m.slices.map((s) => s.amountMinor))).toBe(positive + m.wealth.investmentsMinor);
    expect(sum(m.balances.map((b) => b.balanceMinor))).toBe(m.wealth.accountsMinor);
  });

  it('le spese per categoria sommano alle spese del periodo (con "altre categorie")', () => {
    const m = model('1A');
    expect(m.flow.expenseMinor).toBeGreaterThan(0);
    expect(sum(m.expenseRows.map((r) => r.amountMinor))).toBe(m.flow.expenseMinor);
    expect(sum(m.incomeRows.map((r) => r.amountMinor))).toBe(m.flow.incomeMinor);
  });

  it('i mesi del grafico sommano a entrate e spese del periodo', () => {
    const m = model('1A');
    expect(sum(m.months.map((x) => x.expenseMinor))).toBe(m.flow.expenseMinor);
    expect(sum(m.months.map((x) => x.incomeMinor))).toBe(m.flow.incomeMinor);
  });

  it('la variazione è il patrimonio finale meno quello del giorno prima dell’inizio', () => {
    const m = model('3M');
    const dayBefore = buildOverview({
      data,
      range: { from: null, to: '2026-07-05' }, // 06/07 è il primo giorno di 3M
      accountIds: [],
      rates: {},
      today: TODAY,
    });
    expect(m.start).toBe('2026-07-06');
    expect(m.wealthChange.deltaMinor).toBe(m.wealth.totalMinor - dayBefore.wealth.totalMinor);
  });

  it('un periodo più lungo cambia il punto di partenza ma non il patrimonio finale', () => {
    expect(model('1A').wealth.totalMinor).toBe(model('3M').wealth.totalMinor);
  });

  it('con un solo conto scelto si vedono solo i suoi dati', () => {
    const revolut = data.accounts.find((a) => a.name === 'Revolut');
    if (!revolut) throw new Error('conto demo mancante');
    const all = model('1A');
    const only = model('1A', [revolut.id]);
    expect(only.accounts).toHaveLength(1);
    expect(only.balances).toHaveLength(1);
    expect(only.flow.expenseMinor).toBeLessThan(all.flow.expenseMinor);
    expect(only.wealth.investmentsMinor).toBe(0); // gli ETF sono sul deposito Trade Republic
    expect(only.slices.every((s) => s.accountId === revolut.id)).toBe(true);
  });

  it('gli investimenti seguono il conto che li detiene', () => {
    const trade = data.accounts.find((a) => a.name.startsWith('Trade Republic'));
    if (!trade) throw new Error('conto demo mancante');
    const only = model('1A', [trade.id]);
    expect(only.wealth.investmentsMinor).toBeGreaterThan(0);
    expect(only.positions.length).toBeGreaterThan(0);
  });

  it('andamento recente: sempre tre intervalli (7 giorni, 30 giorni, 12 mesi)', () => {
    const m = model('1M');
    expect(m.recent.map((r) => r.key)).toEqual(['d7', 'd30', 'y1']);
    expect(m.recent[0]?.values.length).toBe(8); // un punto al giorno, estremi compresi
  });

  it('"Max" parte dal primo dato e non ha un periodo precedente', () => {
    const m = model('MAX');
    expect(m.previous).toBeNull();
    expect(m.previousFlow).toBeNull();
    expect(m.start <= '2026-02-10').toBe(true);
  });

  it('il periodo precedente esiste per i periodi con inizio', () => {
    const m = model('1M');
    expect(m.previous).not.toBeNull();
    expect(m.previousFlow).not.toBeNull();
  });
});
