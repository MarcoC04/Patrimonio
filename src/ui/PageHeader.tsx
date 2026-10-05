import type { ReactNode } from 'react';
import type { NavKey } from '../app/navigation';
import { todayLongIt } from '../domain/dates';
import { NavIcon } from './icons';

interface PageHeaderProps {
  /** Icona della sezione (la stessa della navigazione). */
  icon: NavKey;
  title: string;
  subtitle?: string;
  /** Elemento a destra (di solito la data); se manca si mostra la data di oggi. */
  right?: ReactNode;
}

/** Intestazione di pagina: icona in un riquadro, titolo, sottotitolo e la data di oggi a destra. */
export function PageHeader({ icon, title, subtitle, right }: PageHeaderProps) {
  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-accent">
          <NavIcon name={icon} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {right ?? (
        <p className="hidden rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted md:block">
          {todayLongIt()}
        </p>
      )}
    </header>
  );
}
