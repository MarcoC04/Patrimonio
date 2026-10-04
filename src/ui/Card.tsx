import { useId, type ReactNode } from 'react';

interface CardProps {
  title: string;
  children: ReactNode;
  className?: string;
  /** Titolo centrato (riquadri dei grafici della dashboard); altrimenti a sinistra. */
  centered?: boolean;
}

/** Riquadro con titolo e bordo verde, usato per i widget della dashboard e per le sezioni. */
export function Card({ title, children, className = '', centered = false }: CardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-2xl border border-line bg-surface p-4 shadow-lg shadow-black/20 md:p-5 ${className}`}
    >
      <h2
        id={headingId}
        className={`mb-3 text-base font-semibold text-fg ${centered ? 'text-center' : ''}`}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Messaggio per un riquadro senza dati. Testo, non solo colore. */
export function EmptyState({ message }: { message: string }) {
  return <p className="py-6 text-center text-sm text-muted">{message}</p>;
}
