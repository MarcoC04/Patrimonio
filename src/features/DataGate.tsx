import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useData } from '../app/DataProvider';
import type { Dataset } from '../data/repository';
import { Card } from '../ui/Card';
import { secondaryButtonClass, alertClass, buttonClass } from '../ui/styles';
import { strings } from '../ui/strings';

/**
 * Mostra il contenuto solo a dati pronti; altrimenti caricamento, errore chiaro o invito
 * ad andare in Impostazioni (manca l'indirizzo dello script o la chiave).
 */
export function DataGate({
  title,
  children,
}: {
  title: string;
  children: (data: Dataset) => ReactNode;
}) {
  const { state, reload } = useData();

  if (state.status === 'ready') return <>{children(state.data)}</>;

  return (
    <Card title={title}>
      {state.status === 'loading' && (
        <p role="status" className="py-4 text-sm text-slate-700">
          {strings.common.loading}
        </p>
      )}
      {state.status === 'setup' && (
        <div className="space-y-3">
          <p role="alert" className={alertClass}>
            {state.message}
          </p>
          <Link to="/impostazioni" className={`${buttonClass} no-underline`}>
            {strings.common.goToSettings}
          </Link>
        </div>
      )}
      {state.status === 'error' && (
        <div className="space-y-3">
          <p role="alert" className={alertClass}>
            {state.message}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={() => void reload()}>
              {strings.common.retry}
            </button>
            <Link to="/impostazioni" className={`${secondaryButtonClass} no-underline`}>
              {strings.common.goToSettings}
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}
