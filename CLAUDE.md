# CLAUDE.md — Regole del progetto

Questo file viene letto a ogni sessione. Contiene i vincoli che NON vanno violati.
Per le decisioni complete leggi `ARCHITECTURE.md` prima di iniziare qualsiasi compito.

## Progetto in breve

PWA personale per gestire spese e investimenti. Un solo utente. **Nessun server.**
Dati in un Google Sheet privato, letto/scritto dal browser tramite un Google Apps Script (app web legata al foglio) protetto da una chiave segreta. **Nessun login Google nell'app.**
Usata da PC Windows (browser) e iPhone (PWA da Safari). UI in **italiano**.

## Come lavorare

1. **Prima di scrivere codice**: per ogni compito non banale proponi un piano breve (file coinvolti, approccio, rischi) e attendi conferma.
2. **Passi piccoli**: un cambiamento coerente alla volta. Dopo ogni passo funzionante: typecheck, lint, test, poi suggerisci un commit con messaggio chiaro.
3. **Non dichiarare "fatto" senza averlo verificato**: esegui test e controlli e riporta l'esito reale. Se non puoi eseguire qualcosa, dillo.
4. **Non andare oltre la fase corrente** della roadmap senza approvazione esplicita.
5. **Nuove dipendenze**: chiedi prima. Preferisci poche dipendenze, mantenute, con versione bloccata.
6. Se una decisione di `ARCHITECTURE.md` va cambiata, segnalalo e aggiorna il file solo dopo l'ok.
7. In caso di dubbio su requisiti o formati, chiedi invece di inventare.

## Regole inderogabili

### Denaro, date, valute
- **Mai `float` per il denaro.** Importi in interi (centesimi) con campi `*_minor`. Usa un modulo dedicato (`money`) per somma, conversione e formattazione.
- Quantità e prezzi degli asset: stringhe decimali + libreria decimale (`decimal.js`/`big.js`).
- Date come stringhe ISO `YYYY-MM-DD`; timestamp ISO UTC.
- Ogni movimento: importo/valuta originali + snapshot in EUR al tasso della data (`fx_rate`, `amount_base_minor`).
- Giroconti (`transfer_group_id`) esclusi dai totali di spese/entrate.

### Dati e Google Sheets
- **Tutto l'accesso ai dati passa dall'interfaccia `Repository`.** La UI non chiama mai lo script o le API Google direttamente.
- Lettura con una richiesta `read` per più schede, scrittura con `append` raggruppati. Mai una richiesta per cella o per riga in loop.
- Apps Script ha quote e ~1-2 s di latenza per chiamata. Debounce delle scritture, **retry con backoff esponenziale su 429**.
- Righe identificate da `id` (UUIDv7), mai dal numero di riga. Cancellazione = `deleted=1`.
- Lo script scrive le celle come testo semplice (equivalente di `RAW`). Nessuna formula nelle schede dati.
- La chiave segreta viaggia nel corpo della richiesta, mai nell'URL, e il client la invia solo a `https://script.google.com/macros/s/`.
- Valida con Zod ogni dato letto dal foglio. Se la struttura non è valida: errore chiaro e **nessuna scrittura**.
- Le scritture multi-riga devono essere atomiche (un solo batch) o gestire il rollback/errore parziale in modo esplicito.

### Allegati e privacy
- **I file CSV/PDF caricati non vengono mai salvati**: non su Sheets, non su Drive, non in storage del browser. Si leggono in memoria, si estraggono i valori, si scartano.
- Il parsing avviene nel browser (Web Worker). Nessun upload verso servizi esterni.
- `import_batches` contiene solo metadati (nome file, hash, conteggi), mai contenuto.
- **Mai dati finanziari reali** nel repository, nei fixture, nei log, nei messaggi di errore o nei test. Usa fixture **sintetici** inventati.
- Aggiungi a `.gitignore` estensioni di estratti conto (`*.pdf`, `*.csv` fuori da `fixtures/synthetic/`), `.env*`, file di credenziali.

### Sicurezza
- Nessun OAuth e nessun login Google nell'app.
- **Eccezione documentata** (`ARCHITECTURE.md` §2, §8): la chiave dello script può stare in `localStorage`. Nessun'altra credenziale.
- Non usare `localStorage`/`sessionStorage` per dati finanziari. Ammesse solo preferenze UI non sensibili e la chiave di cui sopra.
- Content Security Policy rigida; nessuno script esterno; rete solo verso `script.google.com` e `script.googleusercontent.com`.
- Nessun segreto nel codice o nel repository. La chiave segreta non va mai in `.env*`, nel bundle o nei log; l'indirizzo dello script va in `VITE_SCRIPT_URL`.
- Nessuna analytics/telemetria di terze parti.
- Il PIN è un blocco dell'interfaccia: non descriverlo mai come cifratura o protezione dei dati sul Drive.

### Qualità
- TypeScript `strict`. Niente `any` senza commento che giustifichi.
- **Test obbligatori** (Vitest) per: modulo `money`, conversioni valuta, categorizzazione a regole, deduplicazione, parser di ogni banca (con fixture sintetici), **ROI e TWR con casi noti calcolati a mano**, validazione schema Sheets.
- Per i calcoli finanziari scrivi il test PRIMA o insieme al codice, con i valori attesi spiegati in un commento.
- I parser di banca implementano un'interfaccia comune e sono un file per formato.
- Gestione errori esplicita: nessun `catch` vuoto, messaggi utente chiari in italiano.

### UI
- **Mobile-first**: progetta prima per schermi piccoli (iPhone), poi desktop. Navigazione in basso su mobile, sidebar su desktop. Aree toccabili di almeno 44px.
- Tutte le stringhe della UI in un unico punto (pronte per eventuale i18n), in italiano.
- Formati: valuta e date secondo locale `it-IT`.
- Accessibilità di base: contrasto, etichette, focus visibile. Le barre di budget non devono affidarsi solo al colore (mostrare anche percentuale/testo).
- Tema: solo scuro. I colori si usano tramite i token di Tailwind (`bg-surface`, `text-fg`, `text-muted`, `border-line`, `text-accent`, `text-income`, `text-expense`…), non con colori fissi. Se si cambia la palette si aggiornano insieme `theme.ts` e `index.css`: un test controlla contrasto e coerenza.

## Struttura del repository (da rispettare)

```
/src
  /app            routing, shell, layout
  /features       accounts, categories, transactions, import, budgets,
                  recurring, investments, dashboard, settings
  /data           Repository (Sheets), schema Zod, migrazioni di schema
  /domain         money, fx, rules, dedupe, metrics (roi, twr), forecast
  /import         parser per banca (plugin) + worker
  /ui             componenti condivisi
/fixtures/synthetic   dati finti per i test
/apps-script          script di backup (da incollare nel Sheet)
/docs
ARCHITECTURE.md
CLAUDE.md
```

La logica di dominio (`/domain`) non dipende da React né da Google: funzioni pure, testabili.

## Comandi

(Da compilare quando il tooling è pronto in Fase 1)

- `npm run dev` — sviluppo locale
- `npm run build` — build di produzione
- `npm run typecheck` — controllo tipi
- `npm run lint` — lint
- `npm test` — test unitari

Su Windows: gli script npm devono funzionare senza bash. Non usare comandi solo-Unix negli script.

## Cosa NON fare

- Non introdurre un backend, un database o servizi di terzi oltre a Google Sheets e all'Apps Script legato al foglio. **Unica eccezione**: il servizio dei cambi Frankfurter, chiesto solo dallo script (azione `fx`), mai dal browser, e solo con data e codici di valuta: mai importi o altri dati (`ARCHITECTURE.md` §5).
- Non aggiungere cifratura lato client: è stata scartata per scelta del proprietario.
- Non salvare i file importati.
- Non usare float per denaro.
- Non scrivere dati reali in fixture o log.
- Non saltare i test sui calcoli finanziari.
- Non procedere alla fase successiva senza approvazione.

## Stato corrente

- **Fase attuale:** Fase 0 — prototipo di fattibilità (lettura/scrittura del Sheet tramite Apps Script su PC e iPhone). Il login Google è stato abbandonato per scelta del proprietario.
- Esito parziale della Fase 0 registrato in `ARCHITECTURE.md` §10: resta da confermare su iPhone la persistenza della chiave.
- Ordine deciso dal proprietario: prima l'app completa (Fasi 1-3: fondamenta, pianificazione, investimenti), poi l'import degli estratti conto (Fase 4), infine la grafica (Fase 5). Non anticipare import e design.
- Approvato in anticipo: la shell (nav bassa/sidebar) e la dashboard come schermata iniziale fanno parte della Fase 1, con stati vuoti e mai dati inventati.
- Design anticipato su richiesta del proprietario: **tema scuro unico** e dashboard nello stile di un riferimento (indicatori, selettore anno, ciambelle, barre). Colori solo da `src/ui/theme.ts` / `src/index.css` (mai colori fissi nelle classi). Ogni grafico ha un equivalente testuale.
