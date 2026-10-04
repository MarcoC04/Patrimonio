import { strings } from '../../ui/strings';
import { AccountsCard } from '../accounts/AccountsCard';
import { CategoriesCard } from '../categories/CategoriesCard';
import { DataGate } from '../DataGate';
import { ConnectionCard } from './ConnectionCard';
import { ExportCard } from './ExportCard';
import { PinCard } from './PinCard';

export function SettingsPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{strings.pages.settings.title}</h1>
      <ConnectionCard />
      <DataGate title={strings.accounts.title}>
        {() => (
          <>
            <AccountsCard />
            <CategoriesCard />
          </>
        )}
      </DataGate>
      <PinCard />
      <ExportCard />
    </>
  );
}
