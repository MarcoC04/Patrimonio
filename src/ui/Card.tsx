import { useId, type ReactNode } from 'react';

interface CardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/** Riquadro con titolo, usato per i widget della dashboard e per le sezioni. */
export function Card({ title, children, className = '' }: CardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}
    >
      <h2 id={headingId} className="mb-3 text-base font-semibold text-slate-800">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Messaggio per un riquadro senza dati. Testo, non solo colore. */
export function EmptyState({ message }: { message: string }) {
  return <p className="py-6 text-center text-sm text-slate-600">{message}</p>;
}
