import { Card } from '../../ui/Card';
import { strings } from '../../ui/strings';
import { DiagnosticsPanel } from './DiagnosticsPanel';

export function SettingsPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{strings.pages.settings.title}</h1>
      <Card title={strings.pages.settings.diagnostics}>
        <DiagnosticsPanel />
      </Card>
    </>
  );
}
