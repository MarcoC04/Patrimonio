/** Classi Tailwind condivise. Aree toccabili di almeno 44px (min-h-11), focus visibile da index.css. */

export const buttonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45';

export const secondaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium text-fg hover:bg-line-soft disabled:cursor-not-allowed disabled:opacity-45';

export const dangerButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-expense bg-surface-2 px-4 text-sm font-medium text-expense hover:bg-line-soft disabled:cursor-not-allowed disabled:opacity-45';

export const inputClass =
  'min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface-2 px-3 text-base text-fg placeholder:text-muted';

export const alertClass =
  'rounded-xl border-2 border-expense bg-surface-2 p-3 text-sm font-semibold text-expense';
