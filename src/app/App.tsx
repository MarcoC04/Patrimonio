import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import { PlaceholderPage } from '../features/PlaceholderPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import { strings } from '../ui/strings';
import { DataProvider } from './DataProvider';
import { LockProvider } from './LockProvider';
import { LockGate } from './PinScreen';
import { Shell } from './Shell';

// Le pagine con i grafici (Recharts, la parte più pesante) si scaricano a parte: l'app parte
// subito e i dati iniziano a caricarsi mentre il resto arriva.
const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const InvestmentsPage = lazy(() =>
  import('../features/investments/InvestmentsPage').then((m) => ({ default: m.InvestmentsPage })),
);

/**
 * HashRouter: funziona su hosting statico (GitHub Pages) senza regole di riscrittura.
 * LockGate sta fuori da DataProvider: quando l'app si blocca, i dati in memoria vengono scartati.
 */
export function App() {
  const { budgets } = strings.pages;
  return (
    <LockProvider>
      <LockGate>
        <DataProvider>
          <HashRouter>
            <Suspense fallback={<p className="p-4 text-muted">{strings.common.loading}</p>}>
              <Routes>
                <Route element={<Shell />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="movimenti" element={<TransactionsPage />} />
                  <Route
                    path="budget"
                    element={<PlaceholderPage title={budgets.title} empty={budgets.empty} />}
                  />
                  <Route path="investimenti" element={<InvestmentsPage />} />
                  <Route path="impostazioni" element={<SettingsPage />} />
                </Route>
              </Routes>
            </Suspense>
          </HashRouter>
        </DataProvider>
      </LockGate>
    </LockProvider>
  );
}
