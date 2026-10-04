import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}

/** Etichetta + controllo (+ suggerimento): ogni campo ha sempre un'etichetta visibile. */
export function Field({ label, htmlFor, hint, children }: FieldProps) {
  return (
    <div className="mb-3">
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
