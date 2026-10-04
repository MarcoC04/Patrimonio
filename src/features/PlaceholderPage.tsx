import { Card, EmptyState } from '../ui/Card';

/** Sezione non ancora popolata: titolo e stato vuoto. Verrà sostituita dalle schermate vere. */
export function PlaceholderPage({ title, empty }: { title: string; empty: string }) {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <Card title={title}>
        <EmptyState message={empty} />
      </Card>
    </>
  );
}
