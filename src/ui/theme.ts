/**
 * Palette dell'app (tema scuro). È l'unica fonte per i colori usati da JavaScript (i grafici
 * non possono leggere le classi di Tailwind). `index.css` ripete gli stessi valori nel blocco
 * @theme: un test verifica che coincidano e che il contrasto sia sufficiente.
 *
 * I colori vengono dal riferimento grafico scelto dal proprietario (navy con accento indaco).
 */
export const palette = {
  // Sfondo della pagina: sfumatura dall'alto verso il basso
  bgTop: '#101425',
  bgMid: '#0f1220',
  bgBottom: '#0b0e18',
  // Barra laterale
  sidebar: '#12151f',
  // Riquadri e controlli
  surface: '#161b27',
  surface2: '#1b2130',
  // Bordi: `line` (sottile) per riquadri e divisori, `lineSoft` ancora più tenue,
  // `control` (ben visibile) per campi, pulsanti e interruttori
  line: '#262d42',
  lineSoft: '#1f2536',
  control: '#6a75a3',
  // Testi
  fg: '#ebf3ff',
  muted: '#8f9ab4',
  // Azione principale
  accent: '#6b7cff',
  accentHover: '#8392ff',
  onAccent: '#0b1020',
  // Entrate / spese / avvisi, come testo
  income: '#44c68e',
  expense: '#f46f82',
  warn: '#fbbf24',
  info: '#22b8d1',
} as const;

/** Colori dei grafici (elementi grafici, non testo). */
export const chartColors = {
  income: '#44c68e',
  expense: '#f46f82',
  flow: '#6b7cff',
  accent: '#6b7cff',
  grid: '#262d42',
  axis: '#8f9ab4',
} as const;

/** Colori per le ciambelle (categorie): ben distinguibili tra loro sullo sfondo scuro. */
export const categoryColors = [
  '#6b7cff',
  '#a78cfb',
  '#f472b5',
  '#f0a35d',
  '#22b8d1',
  '#7e8aa4',
] as const;

/** Stile dei suggerimenti dei grafici (Recharts), coerente con i riquadri. */
export const tooltipStyle = {
  contentStyle: {
    backgroundColor: palette.surface2,
    border: `1px solid ${palette.control}`,
    borderRadius: 12,
    color: palette.fg,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
  },
  labelStyle: { color: palette.fg },
  itemStyle: { color: palette.fg },
} as const;
