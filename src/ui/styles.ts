/** Classi Tailwind condivise. Aree toccabili di almeno 44px (min-h-11), focus visibile da index.css. */

export const buttonClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent shadow-lg shadow-accent/20 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45';

export const secondaryButtonClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-control bg-surface-2 px-4 text-sm font-medium text-fg transition-colors hover:bg-line disabled:cursor-not-allowed disabled:opacity-45';

export const dangerButtonClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-expense bg-surface-2 px-4 text-sm font-medium text-expense transition-colors hover:bg-line disabled:cursor-not-allowed disabled:opacity-45';

export const inputClass =
  'min-h-11 w-full min-w-0 rounded-xl border border-control bg-surface-2 px-3 text-base text-fg placeholder:text-muted';

export const alertClass =
  'rounded-xl border-2 border-expense bg-surface-2 p-3 text-sm font-semibold text-expense';

/** Pulsante a scelta (periodo, tipo…): selezionato = riempito; non solo il colore cambia, anche il peso. */
export const segmentClass = (active: boolean) =>
  `inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-sm transition-colors ${
    active
      ? 'bg-accent font-semibold text-on-accent'
      : 'font-medium text-muted hover:bg-line hover:text-fg'
  }`;

/** Etichetta tonda (chip) per filtri e legende. */
export const chipClass =
  'inline-flex min-h-8 items-center gap-2 rounded-full border border-line bg-surface-2 px-3 text-xs font-medium text-fg';
