import { KpiIcon, type KpiIconName } from '../../ui/icons';

type Tone = 'neutral' | 'income' | 'expense';

const toneClass: Record<Tone, string> = {
  neutral: 'text-fg',
  income: 'text-income',
  expense: 'text-expense',
};

interface KpiTileProps {
  icon: KpiIconName;
  label: string;
  value: string;
  tone?: Tone;
  /** Riga di dettaglio sotto il valore (es. la data di riferimento). */
  note?: string;
}

/** Indicatore con icona, etichetta e valore, come i quattro in cima alla dashboard. */
export function KpiTile({ icon, label, value, tone = 'neutral', note }: KpiTileProps) {
  return (
    <div className="card flex flex-col items-center gap-1 p-3 text-center md:p-4">
      <KpiIcon name={icon} />
      <p className="text-sm font-semibold text-fg">{label}</p>
      <p className={`text-lg font-bold md:text-xl ${toneClass[tone]}`}>{value}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
