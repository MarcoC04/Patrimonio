import type { Dataset } from '../../data/repository';
import { alertClass } from '../../ui/styles';
import { strings } from '../../ui/strings';

/** Avvisa quali asset posseduti non hanno nessun prezzo noto e quindi non entrano nel patrimonio. */
export function UnpricedNotice({
  ids,
  assets,
}: {
  ids: readonly string[];
  assets: Dataset['assets'];
}) {
  if (ids.length === 0) return null;
  const names = ids.map((id) => assets.find((a) => a.id === id)?.name ?? id).join(', ');
  return (
    <p role="alert" className={`${alertClass} mt-2`}>
      {strings.dashboard.unpriced(names)}
    </p>
  );
}
