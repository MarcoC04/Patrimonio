import { Card, EmptyState } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { strings } from '../ui/strings';

/** Sezione non ancora popolata: titolo e stato vuoto. Verrà sostituita dalle schermate vere. */
export function PlaceholderPage({ title, empty }: { title: string; empty: string }) {
  return (
    <>
      <PageHeader icon="budgets" title={title} subtitle={strings.subtitles.budgets} />
      <Card title={title}>
        <EmptyState message={empty} />
      </Card>
    </>
  );
}
