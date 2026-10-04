/** Tutte le stringhe della UI, in italiano, in un unico punto (pronte per eventuale i18n). */
export const strings = {
  appTitle: 'Patrimonio',
  phase0Subtitle: 'Prototipo di fattibilità (Fase 0)',

  nav: {
    label: 'Navigazione principale',
    dashboard: 'Dashboard',
    transactions: 'Movimenti',
    budgets: 'Budget',
    investments: 'Investimenti',
    settings: 'Impostazioni',
  },

  dashboard: {
    title: 'Dashboard',
    netWorth: {
      title: 'Patrimonio totale',
      empty: 'Aggiungi un conto per vedere il tuo patrimonio.',
    },
    categorySpend: {
      title: 'Spese del mese per categoria',
      empty: 'Nessun dato: non ci sono ancora spese in questo mese.',
    },
    liquidity: {
      title: 'Andamento della liquidità',
      empty: 'Nessun dato: servono almeno un conto e qualche movimento.',
    },
    budgets: {
      title: 'Budget',
      empty: 'Nessun budget impostato.',
    },
  },

  pages: {
    transactions: {
      title: 'Movimenti',
      empty: 'Nessun movimento. Qui vedrai spese ed entrate.',
    },
    budgets: {
      title: 'Budget',
      empty: 'Nessun budget impostato. Qui imposterai i limiti mensili per categoria.',
    },
    investments: {
      title: 'Investimenti',
      empty: 'Nessun investimento. Qui vedrai asset, rendimento e allocazione.',
    },
    settings: {
      title: 'Impostazioni',
      diagnostics: 'Diagnostica collegamento (Fase 0)',
    },
  },

  sections: {
    connection: 'Collegamento al foglio',
    sheet: 'Foglio di prova',
    log: 'Registro',
  },

  actions: {
    saveKey: 'Salva chiave',
    removeKey: 'Rimuovi chiave',
    testConnection: 'Prova il collegamento',
    initSheet: 'Prepara il foglio di prova',
    addRow: 'Aggiungi riga',
    readRows: 'Leggi righe',
  },

  labels: {
    key: 'Chiave segreta',
    keyPlaceholder: 'Incolla la chiave dello script',
    keySaved: 'Chiave salvata su questo dispositivo.',
    keyMissing: 'Nessuna chiave salvata.',
    rowText: 'Testo della riga',
    rowTextPlaceholder: 'Scrivi una nota di prova',
    noRows: 'Nessuna riga.',
    createdAt: 'Creata il',
  },

  log: {
    ready: 'Pronto.',
    keySaved: 'Chiave salvata.',
    keyRemoved: 'Chiave rimossa.',
    connectionOk: 'Collegamento riuscito.',
    sheetReady: (created: number) =>
      created > 0 ? 'Foglio di prova creato.' : 'Foglio di prova già pronto.',
    rowAdded: 'Riga aggiunta.',
    rowsRead: (count: number) => `Lette ${count} righe.`,
    backInForeground: (keyState: string) => `App tornata in primo piano. ${keyState}`,
  },

  errors: {
    missingScriptUrl: 'Indirizzo dello script mancante: imposta VITE_SCRIPT_URL in .env.local.',
    badScriptUrl:
      'L’indirizzo dello script non è valido: deve iniziare con https://script.google.com/macros/s/.',
    noKey: 'Inserisci prima la chiave segreta.',
    keyStorage: 'Impossibile salvare la chiave su questo dispositivo.',
    network:
      'Impossibile raggiungere lo script. Controlla la connessione, l’indirizzo e che l’accesso della distribuzione sia “Chiunque”.',
    unknown: 'Errore imprevisto.',
    badResponse:
      'Risposta non valida dallo script: controlla l’indirizzo e che l’accesso sia “Chiunque”.',
    script: {
      unauthorized: 'Chiave non valida.',
      not_configured: 'Lo script non ha una chiave: aggiungi la proprietà SECRET.',
      schema: 'La struttura del foglio non è quella attesa: non è stato scritto nulla.',
      missing_tab: 'Scheda non trovata: prepara prima il foglio di prova.',
      busy: 'Il foglio è occupato: riprova tra poco.',
      bad_request: 'Richiesta non valida.',
      use_post: 'Richiesta non valida.',
      server: 'Errore dello script: riprova.',
    },
    scriptOther: (code: string) => `Errore dello script (${code}).`,
    http: {
      429: 'Quota di Google superata: riprova tra poco.',
      server: 'Il servizio Google non risponde correttamente: riprova.',
      other: (status: number) => `Richiesta rifiutata (HTTP ${status}).`,
    },
  },
} as const;
