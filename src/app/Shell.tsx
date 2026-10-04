import { NavLink, Outlet } from 'react-router';
import { NavIcon } from '../ui/icons';
import { strings } from '../ui/strings';
import { NAV_ITEMS } from './navigation';

/** Voce attiva: colore + peso del testo + indicatore, così non ci si affida al solo colore. */
const sidebarLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm ${
    isActive
      ? 'bg-surface-2 font-semibold text-accent underline decoration-2 underline-offset-4'
      : 'text-muted hover:bg-surface-2 hover:text-fg'
  }`;

const bottomLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-4 px-1 text-[11px] leading-tight ${
    isActive ? 'border-accent font-semibold text-accent' : 'border-transparent text-muted'
  }`;

export function Shell() {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface p-4 md:block">
        <p className="mb-6 px-3 text-lg font-bold text-accent">{strings.appTitle}</p>
        <nav aria-label={strings.nav.label} className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.path} to={item.path} end className={sidebarLink}>
              <NavIcon name={item.key} />
              {strings.nav[item.key]}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="mx-auto w-full max-w-6xl flex-1 p-4 pb-24 md:p-8 md:pb-8">
        <Outlet />
      </main>

      <nav
        aria-label={strings.nav.label}
        className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.path} to={item.path} end className={bottomLink}>
            <NavIcon name={item.key} />
            {strings.nav[item.key]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
