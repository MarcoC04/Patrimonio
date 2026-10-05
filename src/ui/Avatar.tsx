interface AvatarProps {
  /** Testo da cui prendere l'iniziale. */
  label: string;
  /** Colore (esadecimale #rrggbb) dell'iniziale; lo sfondo è lo stesso colore, molto tenue. */
  color: string;
}

/** Cerchio con l'iniziale, per elenchi di movimenti e di asset. Decorativo: il testo è accanto. */
export function Avatar({ label, color }: AvatarProps) {
  const initial = (label.trim().charAt(0) || '?').toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold"
      style={{ color, backgroundColor: `${color}26` }}
    >
      {initial}
    </span>
  );
}
