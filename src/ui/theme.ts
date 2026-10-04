/**
 * Palette dell'app (tema scuro). È l'unica fonte per i colori usati da JavaScript (i grafici
 * non possono leggere le classi di Tailwind). `index.css` ripete gli stessi valori nel blocco
 * @theme: un test verifica che coincidano e che il contrasto sia sufficiente.
 */
export const palette = {
  // Sfondo della pagina: sfumatura dall'alto verso il basso
  bgTop: '#0b2f35',
  bgMid: '#052026',
  bgBottom: '#031418',
  // Riquadri e controlli
  surface: '#0a2429',
  surface2: '#0f353a',
  // Bordi: `line` per riquadri e campi, `lineSoft` per i divisori
  line: '#2fa57a',
  lineSoft: '#1b5150',
  // Testi
  fg: '#e8f6f2',
  muted: '#9bbab5',
  // Azione principale
  accent: '#2bd985',
  accentHover: '#52e8a0',
  onAccent: '#03241a',
  // Entrate / spese / avvisi, come testo
  income: '#4ade80',
  expense: '#ff8aa0',
  warn: '#fbbf24',
  info: '#38bdf8',
} as const;

/** Colori dei grafici (elementi grafici, non testo). */
export const chartColors = {
  income: '#2bd985',
  expense: '#ff4d79',
  flow: '#38bdf8',
  grid: '#1b5150',
  axis: '#9bbab5',
} as const;

/** Colori per le ciambelle (categorie): ben distinguibili tra loro sullo sfondo scuro. */
export const categoryColors = [
  '#2bd985',
  '#38bdf8',
  '#fbbf24',
  '#c084fc',
  '#ff4d79',
  '#94a3b8',
] as const;

/** Stile dei suggerimenti dei grafici (Recharts), coerente con i riquadri. */
export const tooltipStyle = {
  contentStyle: {
    backgroundColor: palette.surface2,
    border: `1px solid ${palette.line}`,
    borderRadius: 8,
    color: palette.fg,
  },
  labelStyle: { color: palette.fg },
  itemStyle: { color: palette.fg },
} as const;
