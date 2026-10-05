import { useId, type ReactNode } from 'react';

interface CardProps {
  title: string;
  children: ReactNode;
  className?: string;
  /** Titolo centrato (riquadri dei grafici della dashboard); altrimenti a sinistra. */
  centered?: boolean;
  /** Riga sotto il titolo, più piccola e in grigio. */
  description?: string;
  /** Elemento a destra del titolo (pulsanti del periodo, avvisi…). */
  action?: ReactNode;
}

/** Riquadro con titolo, usato per i widget della dashboard e per le sezioni. */
export function Card({
  title,
  children,
  className = '',
  centered = false,
  description,
  action,
}: CardProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`card p-4 md:p-5 ${className}`}>
      <header
        className={`mb-3 flex flex-wrap items-start gap-x-3 gap-y-2 ${
          centered ? 'justify-center text-center' : 'justify-between'
        }`}
      >
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold text-fg">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Messaggio per un riquadro senza dati. Testo, non solo colore. */
export function EmptyState({ message }: { message: string }) {
  return <p className="py-6 text-center text-sm text-muted">{message}</p>;
}
