import { Link, NavLink, Outlet } from 'react-router';
import { NavIcon } from '../ui/icons';
import { strings } from '../ui/strings';
import { NAV_ITEMS } from './navigation';
import { buildId } from './updates';

/**
 * Voce attiva: sfondo tenue + peso del testo + barra a sinistra, così non ci si affida al solo
 * colore. NavLink imposta anche aria-current="page".
 */
const sidebarLink = ({ isActive }: { isActive: boolean }) =>
  `relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
    isActive
      ? 'bg-accent/15 font-semibold text-fg before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-accent'
      : 'text-muted hover:bg-surface-2 hover:text-fg'
  }`;

const bottomLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight ${
    isActive ? 'font-semibold text-fg' : 'text-muted'
  }`;

/** Marchio dell'app: quadrato sfumato con l'iniziale. Decorativo (il nome è scritto accanto). */
function Logo() {
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-info text-lg font-bold text-on-accent"
    >
      {strings.appTitle.charAt(0)}
    </span>
  );
}

export function Shell() {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-sidebar p-4 md:flex">
        <div className="mb-6 flex items-center gap-3 px-1">
          <Logo />
          <p className="text-lg font-bold">{strings.appTitle}</p>
        </div>

        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted">
          {strings.nav.sections}
        </p>
        <nav aria-label={strings.nav.label} className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.path} to={item.path} end className={sidebarLink}>
              <NavIcon name={item.key} />
              {strings.nav[item.key]}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <Link
            to="/movimenti"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent no-underline shadow-lg shadow-accent/20 transition-colors hover:bg-accent-hover"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              +
            </span>
            {strings.nav.newMovement}
          </Link>
          <p className="px-1 text-xs text-muted">{strings.about.version(buildId())}</p>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-24 md:p-8 md:pb-8">
        <Outlet />
      </main>

      <nav
        aria-label={strings.nav.label}
        className="fixed inset-x-0 bottom-0 grid grid-cols-5 rounded-t-2xl border-t border-line bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.path} to={item.path} end className={bottomLink}>
            {({ isActive }) => (
              <>
                <span
                  className={`grid h-8 w-12 place-items-center rounded-full transition-colors ${
                    isActive ? 'bg-accent/20 text-accent' : ''
                  }`}
                >
                  <NavIcon name={item.key} />
                </span>
                {strings.nav[item.key]}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
