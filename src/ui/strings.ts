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
    subtitle: 'La tua situazione finanziaria',
    year: {
      groupLabel: 'Anno',
      current: 'anno in corso',
    },
    kpi: {
      netWorth: 'Patrimonio netto',
      income: 'Entrate',
      expenses: 'Spese',
      savings: 'Risparmio',
      netWorthNote: (when: string) => `al ${when}`,
      noData: '—',
    },
    rates: {
      loading: 'Calcolo dei cambi in corso…',
      missing: (currencies: string) =>
        `Cambio non disponibile per: ${currencies}. Il totale non comprende questi conti.`,
    },
    netWorthChart: {
      title: 'Patrimonio netto per mese',
      empty: 'Nessun dato: aggiungi un conto per vedere l’andamento del patrimonio.',
      chartLabel: (year: number) => `Patrimonio netto mese per mese nel ${year}`,
      balance: 'Patrimonio',
    },
    flowChart: {
      title: 'Entrate, spese e flusso di cassa per mese',
      empty: 'Nessun dato: non ci sono movimenti in questo anno.',
      chartLabel: (year: number) => `Entrate, spese e flusso di cassa mese per mese nel ${year}`,
      income: 'Entrate',
      expense: 'Spese',
      flow: 'Flusso di cassa',
    },
    assets: {
      title: 'Conti e investimenti',
      empty: 'Nessun dato: nessun conto con un saldo positivo e nessun investimento.',
      total: 'Totale',
      chartLabel: (total: string) => `Divisione tra conti e investimenti: totale ${total}`,
      accounts: 'Conti',
      investments: 'Investimenti',
      kinds: {
        checking: 'Conti correnti',
        savings: 'Conto deposito',
        cash: 'Contanti',
        brokerage: 'Liquidità del conto di investimento',
        investments: 'Investimenti (asset)',
      },
    },
    unpriced: (names: string) =>
      `Nessun prezzo noto per: ${names}. Non sono compresi nel patrimonio: aggiorna il prezzo in Investimenti.`,
    incomeByCategory: {
      title: 'Entrate per categoria',
      empty: 'Nessun dato: non ci sono entrate in questo anno.',
      chartLabel: (year: number, total: string) =>
        `Entrate del ${year} per categoria: totale ${total}`,
    },
    expensesByCategory: {
      title: 'Spese per categoria',
      empty: 'Nessun dato: non ci sono spese in questo anno.',
      chartLabel: (year: number, total: string) =>
        `Spese del ${year} per categoria: totale ${total}`,
    },
    categories: {
      total: 'Totale',
      others: 'Altre categorie',
      uncategorized: 'Da categorizzare',
    },
    table: {
      showData: 'Mostra i dati',
      month: 'Mese',
      netWorth: 'Patrimonio',
      income: 'Entrate',
      expense: 'Spese',
      flow: 'Flusso',
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

  about: {
    title: 'Versione e aggiornamenti',
    version: (id: string) => `Versione dell’app in uso: ${id}`,
    check: 'Cerca aggiornamenti',
    checking: 'Controllo in corso…',
    checked: 'Controllo eseguito: se c’è una versione nuova l’app si ricarica da sola.',
  },

  pin: {
    title: 'Blocco con PIN',
    notice:
      'Il PIN blocca solo l’interfaccia di questa app su questo dispositivo: non cifra né protegge i dati nel foglio Google.',
    enabled: 'Il PIN è attivo.',
    disabled: 'Il PIN non è attivo.',
    newPin: 'Nuovo PIN (4-8 cifre)',
    confirmPin: 'Ripeti il PIN',
    currentPin: 'PIN attuale',
    enable: 'Attiva il PIN',
    change: 'Cambia PIN',
    remove: 'Rimuovi il PIN',
    lockNow: 'Blocca ora',
    autolock: 'Blocco automatico dopo',
    minutes: (count: number) => (count === 1 ? '1 minuto' : `${count} minuti`),
    saved: 'PIN salvato.',
    removed: 'PIN rimosso.',
    issues: {
      format: 'Il PIN deve avere da 4 a 8 cifre.',
      mismatch: 'I due PIN non coincidono.',
      wrongCurrent: 'PIN attuale errato.',
      storage: 'Impossibile salvare il PIN su questo dispositivo.',
    },
    screen: {
      title: 'App bloccata',
      label: 'PIN',
      unlock: 'Sblocca',
      wrong: 'PIN errato.',
      wait: (seconds: number) => `Troppi tentativi. Riprova tra ${seconds} secondi.`,
      forgot: 'PIN dimenticato',
      forgotWarning:
        'Verranno rimossi da questo dispositivo il PIN e la chiave salvata: dovrai reinserire la chiave. I dati nel foglio non vengono toccati.',
      forgotConfirm: 'Rimuovere il PIN e la chiave da questo dispositivo?',
    },
  },

  investments: {
    title: 'Investimenti',
    empty:
      'Nessun investimento. Aggiungi un asset che possiedi: quantità, prezzo pagato e prezzo attuale.',
    addAsset: 'Aggiungi asset',
    summary: {
      value: 'Valore attuale',
      invested: 'Totale investito',
      gain: 'Guadagno / perdita',
      roi: 'Rendimento',
      note: 'Valori in euro. Il rendimento è (valore attuale + incassi dalle vendite − totale pagato) / totale pagato.',
    },
    classes: {
      equity: 'Azioni',
      bond: 'Obbligazioni',
      etf: 'ETF',
      crypto: 'Criptovalute',
      commodity: 'Materie prime',
      real_estate: 'Immobili',
      cash: 'Liquidità',
      other: 'Altro',
    },
    holdingForm: {
      title: 'Nuovo asset',
      name: 'Nome',
      namePlaceholder: 'Es. ETF azionario mondo',
      symbol: 'Simbolo (facoltativo)',
      isin: 'ISIN (facoltativo)',
      assetClass: 'Tipo',
      currency: 'Valuta',
      quantity: 'Quantità posseduta',
      quantityHint: 'Per i decimali usa la virgola, ad esempio 0,125.',
      purchasePrice: 'Prezzo pagato per unità',
      purchaseDate: 'Data dell’acquisto',
      fees: 'Commissioni pagate (facoltative)',
      account: 'Conto di investimento (facoltativo)',
      noAccount: '— nessuno —',
      currentPrice: 'Prezzo attuale per unità (facoltativo)',
      currentPriceHint: 'Se lo lasci vuoto, si usa il prezzo pagato.',
      fxHint:
        'Asset in valuta estera: si usa il cambio del giorno dell’acquisto, salvato insieme all’operazione.',
    },
    tradeForm: {
      buyTitle: (name: string) => `Acquisto: ${name}`,
      sellTitle: (name: string) => `Vendita: ${name}`,
      quantity: 'Quantità',
      unitPrice: 'Prezzo per unità',
      date: 'Data',
      fees: 'Commissioni (facoltative)',
      account: 'Conto di investimento (facoltativo)',
      noAccount: '— nessuno —',
    },
    priceForm: {
      title: (name: string) => `Aggiorna il prezzo: ${name}`,
      price: 'Prezzo per unità',
      date: 'Data del prezzo',
    },
    position: {
      quantity: 'Quantità',
      price: 'Prezzo',
      value: 'Valore',
      paid: 'Pagato',
      gain: 'Guadagno',
      priceDate: (date: string) => `al ${date}`,
      noPrice: 'Nessun prezzo noto: aggiornalo per includerlo nel patrimonio.',
      noRate: 'Cambio non disponibile: la posizione non è compresa nei totali.',
    },
    actions: {
      buy: 'Acquisto',
      sell: 'Vendita',
      updatePrice: 'Aggiorna prezzo',
      deleteAsset: 'Elimina asset',
    },
    operations: {
      title: 'Operazioni',
      buy: 'Acquisto',
      sell: 'Vendita',
      row: (type: string, quantity: string, price: string) => `${type} di ${quantity} a ${price}`,
      confirmDelete: 'Eliminare questa operazione?',
      cannotDelete:
        'Non si può eliminare: la quantità scenderebbe sotto zero in qualche momento. Elimina prima le vendite successive.',
      confirmDeleteAsset: (name: string) => `Eliminare l’asset “${name}”?`,
      cannotDeleteAsset: 'L’asset ha delle operazioni: eliminale prima.',
    },
    issues: {
      name: 'Inserisci un nome.',
      name_taken: 'Esiste già un asset con questo nome.',
      currency: 'Scegli una valuta tra quelle disponibili.',
      isin: 'L’ISIN non è valido (12 caratteri, ad esempio IE00B4L5Y983).',
      asset_class: 'Scegli il tipo di asset.',
      asset: 'Scegli un asset.',
      type: 'Scegli acquisto o vendita.',
      date: 'Data non valida.',
      quantity:
        'Quantità non valida: scrivi un numero maggiore di zero. Per i decimali usa la virgola (0,125).',
      unit_price:
        'Prezzo non valido: scrivi un numero maggiore di zero (per i decimali usa la virgola).',
      fees: 'Commissioni non valide (esempio: 1,50).',
      fx_rate: 'Tasso di cambio non disponibile: riprova tra poco.',
      account: 'Il conto scelto non esiste.',
      insufficient: 'Non puoi vendere più di quanto possiedi.',
      price:
        'Prezzo non valido: scrivi un numero maggiore di zero (per i decimali usa la virgola).',
      current_price:
        'Prezzo attuale non valido: scrivi un numero maggiore di zero oppure lascialo vuoto.',
    },
  },

  exportData: {
    title: 'Esporta i dati',
    description:
      'Scarica una copia completa dei tuoi dati (anche le righe eliminate) sul dispositivo. Il file non passa da nessun server.',
    json: 'Esporta JSON',
    csv: 'Esporta CSV (zip)',
    exporting: 'Esportazione in corso…',
    done: (filename: string) => `Esportato: ${filename}`,
    iosHint: 'Su iPhone il file si apre in anteprima: usa Condividi, poi “Salva su File”.',
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
    currency: 'Valuta',
    currencyLocked: 'La valuta non si cambia dopo la creazione del conto.',
    openingBalance: 'Saldo iniziale',
    openingBalanceHint: 'Esempio: 1.500,00. Puoi lasciarlo vuoto (0).',
    openingDate: 'Data del saldo iniziale',
    balance: 'Saldo',
    archivedTitle: 'Conti archiviati',
    types: {
      checking: 'Conto corrente',
      savings: 'Conto deposito',
      cash: 'Contanti',
      brokerage: 'Conto di investimento',
    },
    cannotDelete: (count: number) =>
      `Il conto ha ${count} ${count === 1 ? 'movimento' : 'movimenti'}: non si può eliminare, ma puoi archiviarlo.`,
    confirmDelete: (name: string) => `Eliminare il conto “${name}”?`,
    issues: {
      name: 'Inserisci un nome.',
      name_taken: 'Esiste già un conto con questo nome.',
      currency: 'Scegli una valuta tra quelle disponibili.',
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
    amount: 'Importo',
    amountHint: 'Scrivilo senza segno, ad esempio 12,34.',
    fxHint:
      'Conto in valuta estera: si usa il cambio del giorno del movimento, salvato insieme ad esso.',
    inEuro: (amount: string) => `≈ ${amount}`,
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
      currency: 'La valuta di questo conto non è supportata.',
      currency_mismatch: 'Il giroconto è possibile solo tra conti nella stessa valuta.',
      fx_rate: 'Tasso di cambio non disponibile: riprova tra poco.',
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
      no_key: 'Inserisci prima la chiave segreta.',
      fx_unavailable:
        'Servizio dei cambi non raggiungibile. Riprova tra poco, oppure usa un conto in euro.',
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
    import: {
      notXlsx: 'Il file non è un Excel (.xlsx) valido.',
      noSheet: 'Nel file Excel non c’è nessun foglio da leggere.',
      tooBig: 'Il file è troppo grande per essere letto.',
      unsupportedCompression: 'Il file Excel usa una compressione non supportata.',
      noDecompression:
        'Questo browser non può aprire i file Excel: aggiorna il sistema (iOS 16.4 o successivo) oppure usa un file CSV.',
      notText: 'Il file non è un testo CSV leggibile.',
      empty: 'Il file è vuoto: nessuna riga da importare.',
      missingColumns: (columns: string, format: string) =>
        `Nel file mancano le colonne: ${columns}. Hai scelto il formato giusto (${format}) per questo conto?`,
      noRows: 'Nel file non ci sono righe di movimenti da importare.',
    },
    scriptOther: (code: string) => `Errore dello script (${code}).`,
    fxOutdated:
      'Per usare conti in valuta estera serve la versione 3 dello script: incolla l’ultimo Code.gs, autorizza l’accesso a servizi esterni e modifica la distribuzione con “Nuova versione”.',
    scriptOutdated: (found: number, required: number) =>
      `Lo script del foglio risponde con la versione ${found}, ma ne serve almeno la ${required}. ` +
      'Controlla che l’indirizzo dello script (VITE_SCRIPT_URL, anche nella variabile di GitHub) sia quello della distribuzione aggiornata. ' +
      'In Apps Script incolla l’ultimo Code.gs e, in Distribuisci > Gestisci distribuzioni, modifica la distribuzione esistente scegliendo “Nuova versione”: ' +
      'se ne crei una nuova l’indirizzo cambia.',
    http: {
      429: 'Quota di Google superata: riprova tra poco.',
      server: 'Il servizio Google non risponde correttamente: riprova.',
      other: (status: number) => `Richiesta rifiutata (HTTP ${status}).`,
    },
  },
} as const;
