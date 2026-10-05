import { PageHeader } from '../../ui/PageHeader';
import { strings } from '../../ui/strings';
import { AccountsCard } from '../accounts/AccountsCard';
import { CategoriesCard } from '../categories/CategoriesCard';
import { DataGate } from '../DataGate';
import { AboutCard } from './AboutCard';
import { ConnectionCard } from './ConnectionCard';
import { ExportCard } from './ExportCard';
import { PinCard } from './PinCard';

export function SettingsPage() {
  return (
    <>
      <PageHeader
        icon="settings"
        title={strings.pages.settings.title}
        subtitle={strings.subtitles.settings}
      />
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
      <AboutCard />
    </>
  );
}
