/** Tutte le stringhe della UI, in italiano, in un unico punto (pronte per eventuale i18n). */
export const strings = {
  appTitle: 'Patrimonio',

  nav: {
    label: 'Navigazione principale',
    dashboard: 'Dashboard',
    transactions: 'Movimenti',
    budgets: 'Budget',
    investments: 'Investimenti',
    settings: 'Impostazioni',
  },

  common: {
    save: 'Salva',
    saving: 'Salvataggio…',
    cancel: 'Annulla',
    edit: 'Modifica',
    delete: 'Elimina',
    archive: 'Archivia',
    restore: 'Ripristina',
    reload: 'Ricarica dati',
    retry: 'Riprova',
    loading: 'Caricamento dei dati…',
    goToSettings: 'Vai alle Impostazioni',
    noneOption: '— nessuna —',
  },

  dashboard: {
    title: 'Dashboard',
    netWorth: {
      title: 'Patrimonio totale',
      empty: 'Aggiungi un conto per vedere il tuo patrimonio.',
      liquidity: 'di cui liquidità',
      note: 'Somma dei saldi di tutti i conti. La liquidità esclude i conti broker.',
    },
    categorySpend: {
      title: 'Spese del mese per categoria',
      empty: 'Nessun dato: non ci sono ancora spese in questo mese.',
      previousMonth: 'Mese precedente',
      nextMonth: 'Mese successivo',
      total: 'Totale spese',
      others: 'Altre categorie',
      uncategorized: 'Da categorizzare',
      chartLabel: (month: string, total: string) => `Spese di ${month}: totale ${total}`,
    },
    liquidity: {
      title: 'Andamento della liquidità',
      empty: 'Nessun dato: servono almeno un conto e qualche movimento.',
      today: 'Oggi',
      showData: 'Mostra i dati',
      date: 'Data',
      balance: 'Saldo',
      chartLabel: (from: string, to: string) => `Liquidità da ${from} a ${to}`,
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
    },
  },

  connection: {
    title: 'Collegamento al foglio',
    keyLabel: 'Chiave segreta',
    keyPlaceholder: 'Incolla la chiave dello script',
    saveKey: 'Salva chiave',
    removeKey: 'Rimuovi chiave',
    keySaved: 'Chiave salvata su questo dispositivo.',
    keyMissing: 'Nessuna chiave salvata.',
    test: 'Prova il collegamento',
    testing: 'Prova in corso…',
    testOk: (version: number) => `Collegamento riuscito (versione dello script: ${version}).`,
  },

  accounts: {
    title: 'Conti',
    empty: 'Nessun conto. Aggiungine uno per iniziare.',
    add: 'Aggiungi conto',
    formAdd: 'Nuovo conto',
    formEdit: 'Modifica conto',
    name: 'Nome',
    institution: 'Banca o istituto',
    type: 'Tipo',
    openingBalance: 'Saldo iniziale (€)',
    openingBalanceHint: 'Esempio: 1.500,00. Puoi lasciarlo vuoto (0).',
    openingDate: 'Data del saldo iniziale',
    balance: 'Saldo',
    archivedTitle: 'Conti archiviati',
    types: {
      checking: 'Conto corrente',
      savings: 'Risparmio',
      cash: 'Contanti',
      brokerage: 'Broker',
    },
    cannotDelete: (count: number) =>
      `Il conto ha ${count} ${count === 1 ? 'movimento' : 'movimenti'}: non si può eliminare, ma puoi archiviarlo.`,
    confirmDelete: (name: string) => `Eliminare il conto “${name}”?`,
    issues: {
      name: 'Inserisci un nome.',
      name_taken: 'Esiste già un conto con questo nome.',
      opening_balance: 'Saldo iniziale non valido (esempio: 1.500,00).',
      opening_date: 'Data non valida.',
    },
  },

  categories: {
    title: 'Categorie',
    add: 'Aggiungi categoria',
    formAdd: 'Nuova categoria',
    formEdit: 'Modifica categoria',
    name: 'Nome',
    kind: 'Tipo',
    parent: 'Categoria madre',
    kinds: { expense: 'Spese', income: 'Entrate', transfer: 'Giroconti' },
    kindsSingular: { expense: 'Spesa', income: 'Entrata', transfer: 'Giroconto' },
    cannotDelete: (transactions: number, children: number) => {
      const reasons: string[] = [];
      if (transactions > 0) {
        reasons.push(`${transactions} ${transactions === 1 ? 'movimento' : 'movimenti'}`);
      }
      if (children > 0) {
        reasons.push(`${children} ${children === 1 ? 'sottocategoria' : 'sottocategorie'}`);
      }
      return `La categoria ha ${reasons.join(' e ')}: non si può eliminare. Riassegnali prima.`;
    },
    confirmDelete: (name: string) => `Eliminare la categoria “${name}”?`,
    issues: {
      name: 'Inserisci un nome.',
      name_taken: 'Esiste già una categoria con questo nome per questo tipo.',
      parent: 'La categoria madre non è valida (deve essere di primo livello e dello stesso tipo).',
    },
  },

  transactions: {
    title: 'Movimenti',
    add: 'Nuovo movimento',
    formAdd: 'Nuovo movimento',
    formEdit: 'Modifica movimento',
    kinds: { expense: 'Spesa', income: 'Entrata', transfer: 'Giroconto' },
    kind: 'Tipo di movimento',
    amount: 'Importo (€)',
    amountHint: 'Scrivilo senza segno, ad esempio 12,34.',
    date: 'Data',
    account: 'Conto',
    fromAccount: 'Dal conto',
    toAccount: 'Al conto',
    category: 'Categoria',
    toCategorize: 'Da categorizzare',
    description: 'Descrizione',
    notes: 'Note',
    noAccounts: 'Crea prima un conto in Impostazioni.',
    empty: 'Nessun movimento con questi filtri.',
    transferLabel: (from: string, to: string) => `Giroconto: ${from} → ${to}`,
    transferEditHint: 'I giroconti non si modificano: eliminalo e creane uno nuovo.',
    confirmDelete: (description: string) =>
      description ? `Eliminare il movimento “${description}”?` : 'Eliminare il movimento?',
    confirmDeleteTransfer: 'Eliminare il giroconto? Verranno eliminati entrambi i lati.',
    showMore: 'Mostra altri',
    filters: {
      title: 'Filtri',
      from: 'Dal',
      to: 'Al',
      categories: 'Categorie',
      allCategories: 'Tutte le categorie',
      selectedCategories: (count: number) =>
        count === 1 ? '1 categoria selezionata' : `${count} categorie selezionate`,
      uncategorized: 'Senza categoria',
      reset: 'Azzera filtri',
    },
    summary: {
      income: 'Entrate',
      expense: 'Spese',
      net: 'Saldo',
      note: 'I giroconti non sono conteggiati.',
    },
    issues: {
      amount: 'Importo non valido: scrivi un numero maggiore di zero (esempio: 12,34).',
      date: 'Data non valida.',
      account: 'Scegli un conto.',
      currency: 'Per ora sono supportati solo conti in euro.',
      before_opening: 'La data è precedente al saldo iniziale del conto.',
      category: 'La categoria non è adatta a questo tipo di movimento.',
      transfer: 'I giroconti non si possono modificare.',
      same_account: 'Scegli due conti diversi.',
    },
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
      outdated:
        'Lo script del foglio è una versione vecchia: incolla di nuovo Code.gs in Apps Script e pubblica una “Nuova versione” della distribuzione.',
      no_key: 'Inserisci prima la chiave segreta.',
      not_found: 'Elemento da modificare non trovato nel foglio: ricarica i dati.',
      duplicate_id: 'Elemento già presente nel foglio: ricarica i dati.',
    },
    data: {
      notLoaded: 'I dati non sono stati ancora letti e controllati: nessuna scrittura eseguita.',
      invalid: (count: number, table: string, row: number, columns: string) =>
        `I dati nel foglio non sono validi (${count} ${count === 1 ? 'riga' : 'righe'}). ` +
        `Primo problema: scheda "${table}", riga ${row}, colonna ${columns}. Nessuna scrittura eseguita.`,
      duplicateIds: (table: string) =>
        `Nella scheda "${table}" ci sono righe con lo stesso id: correggi il foglio a mano.`,
      unsupportedVersion: 'Il foglio usa una versione dello schema non supportata da questa app.',
      invalidWrite: (table: string, columns: string) =>
        `Dati da salvare non validi (scheda "${table}", colonna ${columns}): nulla è stato scritto.`,
    },
    scriptOther: (code: string) => `Errore dello script (${code}).`,
    http: {
      429: 'Quota di Google superata: riprova tra poco.',
      server: 'Il servizio Google non risponde correttamente: riprova.',
      other: (status: number) => `Richiesta rifiutata (HTTP ${status}).`,
    },
  },
} as const;
