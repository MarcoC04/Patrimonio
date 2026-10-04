import { HashRouter, Route, Routes } from 'react-router';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { PlaceholderPage } from '../features/PlaceholderPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import { strings } from '../ui/strings';
import { DataProvider } from './DataProvider';
import { LockProvider } from './LockProvider';
import { LockGate } from './PinScreen';
import { Shell } from './Shell';

/**
 * HashRouter: funziona su hosting statico (GitHub Pages) senza regole di riscrittura.
 * LockGate sta fuori da DataProvider: quando l'app si blocca, i dati in memoria vengono scartati.
 */
export function App() {
  const { budgets, investments } = strings.pages;
  return (
    <LockProvider>
      <LockGate>
        <DataProvider>
          <HashRouter>
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<DashboardPage />} />
                <Route path="movimenti" element={<TransactionsPage />} />
                <Route
                  path="budget"
                  element={<PlaceholderPage title={budgets.title} empty={budgets.empty} />}
                />
                <Route
                  path="investimenti"
                  element={<PlaceholderPage title={investments.title} empty={investments.empty} />}
                />
                <Route path="impostazioni" element={<SettingsPage />} />
              </Route>
            </Routes>
          </HashRouter>
        </DataProvider>
      </LockGate>
    </LockProvider>
  );
}
