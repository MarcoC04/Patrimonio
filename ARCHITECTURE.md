# ARCHITECTURE.md — App personale per la gestione del patrimonio

> Versione 1.0 — decisioni approvate dal proprietario.
> Questo file è la fonte di verità sulle scelte di progetto. Se una decisione cambia, aggiornare qui PRIMA di scrivere codice.

---

## 1. Obiettivo

Webapp personale (PWA) per gestire spese e investimenti, usabile da **PC Windows** (browser) e da **iPhone** (PWA aggiunta alla schermata Home, senza App Store). Un solo utente. Nessun server proprio.

## 2. Decisioni di fondo (approvate)

| Tema | Decisione |
|---|---|
| Archiviazione | **Un Google Sheet privato** nel Drive del proprietario, una scheda per tabella |
| Privacy | Accettato che Google possa leggere i dati. **Nessuna cifratura lato client** |
| Server | **Nessuno proprio.** PWA statica su hosting gratuito. Il browser parla con un **Google Apps Script** legato al Sheet (app web), che legge/scrive il foglio |
| Accesso ai dati | **Nessun login Google nell'app.** Ogni richiesta porta una **chiave segreta** verificata dallo script (decisione del proprietario, dopo la Fase 0 iniziale con OAuth) |
| Chiave segreta | Salvata sul dispositivo (`localStorage`) dopo il primo inserimento. **Eccezione documentata** alla regola "niente `localStorage` per token". Nessun dato finanziario in `localStorage` |
| Offline | Non richiesto: serve connessione per usare l'app |
| iOS | PWA installata da Safari ("Aggiungi a Home"). Niente app nativa |
| Allegati (PDF/CSV) | Letti **nel browser**, valori estratti, **file mai salvato** (né su Sheet né altrove) |
| Backup | Google Apps Script con trigger settimanale che copia il Sheet in una cartella Drive; più export manuale CSV/JSON |
| Lock | Schermata PIN con auto-lock: è un blocco **dell'interfaccia**, non protegge i dati sul Drive |

**Conseguenza da ricordare:** la sicurezza dei dati coincide con la sicurezza dell'account Google (passkey/2FA attiva, Sheet mai condiviso, nessun link pubblico).

## 3. Architettura

```
PC Windows (Chrome/Edge)  /  iPhone (PWA Safari)
  ┌────────────────────────────────────────────────────┐
  │ React UI  +  logica TypeScript                     │
  │  - calcoli (saldi, budget, ROI, TWR, forecast)     │
  │  - import CSV/PDF (Web Worker)                     │
  │  - categorizzazione a regole                       │
  │ Dati in memoria (array tipizzati)                  │
  └───────────────┬────────────────────────────────────┘
                  │ HTTPS POST (text/plain) + chiave segreta
                  ▼
        Apps Script "app web" legato al Sheet
        (esegue come il proprietario, verifica la chiave)
                  │
                  ▼
        Google Sheet privato (Drive del proprietario)
                  ▲
                  │ trigger settimanale
        Apps Script → copia in "Backup Patrimonio"
```

### Flusso dati

1. All'avvio: **una richiesta `read` allo script** legge tutte le schede.
2. I dati vengono validati (Zod) e tenuti in memoria. Query, filtri, grafici e metriche girano nel browser.
3. Le modifiche sono accumulate e inviate con **richieste `append` raggruppate** (più schede in una richiesta). Lo script **valida tutto prima di scrivere** e usa un lock: la scrittura multi-riga è atomica.
4. Ogni riga è identificata da `id` (non dal numero di riga). Cancellazione = `deleted=1` (soft delete).

### Quote e prestazioni (da rispettare)

- Apps Script ha quote giornaliere di esecuzioni e tempo, ampie per un uso personale. Ogni chiamata dura circa 1-2 secondi.
- Obbligatori: batching (una richiesta per più righe/schede), debounce delle scritture, retry con backoff esponenziale su HTTP 429.
- Lo script risponde sempre HTTP 200 con `{ok, data}` oppure `{ok:false, error: codice}`; gli errori contengono solo un codice, mai dati.

## 4. Stack

| Livello | Scelta |
|---|---|
| UI | React + Vite + TypeScript (strict) |
| Stile | Tailwind CSS + shadcn/ui; mobile-first (bottom nav su mobile, sidebar su desktop) |
| Tabelle / stato server | TanStack Table, TanStack Query |
| Grafici | Recharts |
| PWA | `vite-plugin-pwa` |
| Validazione | Zod |
| Decimali | `decimal.js` (quantità e prezzi asset), usato solo in `src/domain/decimal.ts`; il resto del codice maneggia stringhe decimali |
| Import | `papaparse` (CSV), `pdfjs-dist` (PDF), in un Web Worker |
| Accesso ai dati | Apps Script (app web, "esegui come me", accesso "chiunque") + chiave segreta. Nessun OAuth, nessun Google Identity Services |
| Hosting | Hosting statico gratuito con HTTPS (Cloudflare Pages o GitHub Pages) |
| Test | Vitest (unit), Playwright (E2E, dalla Fase 2) |
| Lint/format | ESLint + Prettier |

Nota: SQLite non è usato. Per il volume previsto (migliaia di righe) bastano array in memoria.

## 5. Convenzioni sul denaro, sulle date e sulle valute

- **Importi in interi (minor units)**: 12,34 € → `1234`. Mai `float` per denaro.
- Ogni movimento conserva importo + valuta originali e lo **snapshot in EUR** (`fx_rate`, `amount_base_minor`) calcolato al tasso della data. I report storici non cambiano retroattivamente.
- Il patrimonio **attuale** rivaluta gli asset in valuta estera al tasso più recente.
- Weekend/festivi: si usa l'ultimo tasso disponibile precedente la data.
- Quantità e prezzi degli asset: **stringhe decimali** (es. `"0.12345678"`), gestite con libreria decimale.
- Date: testo ISO `YYYY-MM-DD`. Timestamp: ISO 8601 UTC.
- Lo script scrive le celle **come testo semplice** (formato `@` impostato prima di `setValues`): equivale a `RAW`, evita conversioni automatiche di numeri/date e l'interpretazione di formule. Niente formule nelle schede dati.
- Valuta base: EUR. Cambi dal servizio Frankfurter (dati BCE), con cache nella scheda `fx_rates`.
  - **Il browser non contatta mai Frankfurter**: le richieste passano dall'azione `fx` dello script (versione 3), che usa `UrlFetchApp`. La CSP resta chiusa su `script.google.com`. Verso il servizio esterno vanno solo data e codici di valuta, **mai importi** né altri dati. Lo script richiede l'autorizzazione "connettersi a un servizio esterno" (la chiede Google al primo uso dopo l'aggiornamento).
  - Convenzione: il tasso è "1 EUR = tasso unità della valuta" (come la BCE). Conversione con interi grandi (`BigInt`), arrotondamento al centesimo con il mezzo verso l'esterno, simmetrico per i negativi. Quantità e importi non passano mai da float.
  - Cache per (data richiesta, valuta). Per weekend e festivi il servizio restituisce l'ultimo giorno precedente: la riga porta la data richiesta e, in `source`, la data effettiva (`frankfurter:2026-03-13`). Una data futura usa il tasso di oggi.
  - Ogni movimento salva `fx_rate` e `amount_base_minor` calcolati al tasso del giorno: i report storici non cambiano retroattivamente. Le modifiche che non cambiano conto né data tengono il tasso già salvato.
  - Il patrimonio e la liquidità attuali rivalutano i conti in valuta estera **all'ultimo tasso** (cache del giorno). Se un tasso manca, il conto è escluso dal totale e l'app lo segnala: non si inventano valori.
  - La valuta di un conto si sceglie alla creazione e non cambia. I giroconti sono possibili solo tra conti nella stessa valuta.
  - Senza connessione o con il servizio non raggiungibile non si possono registrare movimenti in valuta estera (errore chiaro); quelli in EUR non sono toccati.

## 6. Modello dati (una scheda = una tabella)

Colonne comuni a tutte le schede dati: `id` (UUIDv7), `created_at`, `updated_at`, `deleted` (0/1). Valgono anche per le schede con chiave logica (`fx_rates`, `price_history`, `portfolio_snapshots`): hanno comunque un `id` sintetico, e l'unicità di (data, valuta/asset) è garantita dal codice. `_meta` e `_backup_log` non hanno colonne comuni (`_meta` usa `key` come chiave).

**Chiave di riga e script:** la prima colonna di ogni scheda è la chiave univoca (`id`, oppure `key` in `_meta`). Lo script rifiuta inserimenti con chiave già presente (`duplicate_id`) e modifiche con chiave inesistente (`not_found`). L'azione `write` esegue inserimenti e modifiche in una sola richiesta **atomica**: valida tutto prima di scrivere, sotto lock; anche la lettura è sotto lock.

**Schede create per fase:** si definiscono nello schema solo le schede della fase in corso (Fase 1: `_meta`, `accounts`, `categories`, `transactions`, `fx_rates`); le altre si aggiungono quando servono. Aggiungere una scheda non richiede migrazione; cambiare le colonne di una scheda esistente sì (`schema_version` in `_meta`).
Prima riga = intestazioni. L'app crea il foglio, le schede e le intestazioni al primo avvio e valida la struttura a ogni lettura.

```
_meta                   key, value          (schema_version, base_currency, locale)
_backup_log             started_at, file_id, status, error      (scritta da Apps Script)

accounts
  name, institution, type [checking|savings|cash|brokerage], currency,
  opening_balance_minor, opening_date, is_archived

categories
  name, parent_id, kind [expense|income|transfer], color, icon

transactions
  account_id, date, description, raw_description (opzionale),
  amount_minor (con segno), currency, fx_rate, amount_base_minor,
  category_id (vuoto = da categorizzare), transfer_group_id,
  recurring_rule_id, import_batch_id, dedupe_hash, notes

import_batches          (solo metadati: MAI il contenuto del file)
  account_id, filename, file_hash, parser_id, status [committed|discarded],
  row_count, imported_at

categorization_rules
  priority, field [description|amount|account],
  match_type [contains|starts_with|equals|regex], pattern,
  category_id, account_id, amount_min_minor, amount_max_minor,
  source [manual|learned], hit_count, is_enabled

recurring_rules
  name, account_id, amount_minor, currency, category_id,
  frequency [weekly|monthly|yearly|custom], interval, day_of_month,
  start_date, end_date, is_active, last_materialized_date

budgets
  category_id, month (vuoto = valido sempre), limit_minor, currency,
  warn_threshold_pct (default 80)

goals
  name, target_minor, target_date, linked_account_id, notes

fx_rates                chiave (date, quote_currency)
  date, base_currency='EUR', quote_currency, rate, source, fetched_at

assets
  name, symbol, isin,
  asset_class [equity|bond|etf|crypto|commodity|real_estate|cash|other],
  currency, price_source [manual|api]

investment_transactions
  account_id, asset_id, type [buy|sell|dividend|interest|fee|deposit|withdrawal|split],
  date, quantity, unit_price, fees_minor, currency, fx_rate, amount_base_minor

price_history           chiave (asset_id, date)
  asset_id, date, price, currency, source

portfolio_snapshots     (cache ricalcolabile per TWR e grafico)
  date, account_id, market_value_base_minor, net_contributions_base_minor
```

### Relazioni e regole di integrità (garantite dal codice, non da Sheets)

- `transactions.account_id → accounts`, `transactions.category_id → categories`.
- `investment_transactions.account_id → accounts (type=brokerage)`, `asset_id → assets`.
- Non si elimina fisicamente una riga: `deleted=1`. Un elemento referenziato non può essere eliminato senza riassegnazione.
- **Giroconti**: i due lati condividono `transfer_group_id` e sono **esclusi** da totali di spese/entrate.
- **Deduplicazione**: `dedupe_hash` = hash di (account + data + importo + descrizione normalizzata). Più controllo su `import_batches.file_hash` per segnalare lo stesso estratto già importato.

## 7. Funzioni principali

### 7.1 Import estratti conto (nessun file salvato)

1. L'utente seleziona un CSV/PDF e il conto di destinazione.
2. Parsing nel Web Worker con **parser plugin per banca** (interfaccia comune; un file per formato: 2 banche + broker).
3. Normalizzazione → deduplicazione → applicazione delle regole di categorizzazione.
4. **Anteprima in tabella modificabile**: "Sto per importare X transazioni, confermi o vuoi modificarne qualcuna?" Evidenziati duplicati e righe non categorizzate. Le righe si possono modificare, escludere, ricategorizzare.
5. Conferma → scrittura batch su Sheets. Annulla → nulla viene salvato.
6. Il file originale viene scartato dalla memoria subito dopo l'estrazione. Si salva solo il record `import_batches` (nome, hash, conteggi).
7. Se il parsing fallisce o il formato è sconosciuto: errore chiaro, nessuna scrittura parziale.

#### Implementazione (decisioni del proprietario)

- **Formati**: Revolut (CSV), Fineco (Excel `.xlsx`), Trade Republic (CSV). PDF non previsto. Lettori CSV e XLSX interni (nessuna dipendenza): `src/import/csv.ts`, `zipRead.ts`, `xlsx.ts`. Un file per parser in `src/import/parsers/`, interfaccia comune `StatementParser`.
- **Flusso**: il pulsante "Importa estratto conto" (in Movimenti) chiede **prima il conto** e il formato (il formato scelto è ricordato per conto in `_meta`, chiave `import_format:<id conto>`, e resta modificabile), poi il file. Lettura nel Web Worker (`worker.ts`; senza worker, nel thread principale). Anteprima modificabile (includi, data, descrizione, importo con segno, categoria) → conferma → **un solo** `repo.save` atomico.
- **Solo conti in EUR** per ora (i tassi storici andrebbero chiesti riga per riga).
- **Righe da controllare**: non completate (in sospeso/annullate), valuta diversa dal conto, tipo non riconosciuto, acquisto/vendita poco chiari, importo zero. Sono **escluse di default** e segnalate; i duplicati sono segnalati ed esclusi.
- **Duplicati**: `dedupe_hash` = SHA-256 di conto + data + importo + descrizione normalizzata (senza accenti, minuscola, solo lettere/cifre) + numero d'ordine fra righe identiche dello stesso file (due caffè uguali nello stesso giorno restano due movimenti). Con un identificativo della banca (Trade Republic: `transaction_id`) l'hash è `ext:<id>`. In più, lo stesso file (SHA-256) già importato sul conto è segnalato. `import_batches` contiene solo nome file, impronta, formato e numero di righe.
- **Segno e importo netto**: Revolut netto = Importo − Costo, data = completamento; Fineco netto = Entrate − Uscite, descrizione = `Descrizione_Completa` se c'è; Trade Republic netto = `amount` + `fee` + `tax`.
- **Trade Republic, acquisti e vendite**: per ogni riga TRADING si trova o crea l'asset (per ISIN/simbolo, poi per nome; `FUND`/`ETF`→etf, `STOCK`→equity, `CRYPTO`→crypto, `BOND`→bond, altro→other), si registra l'operazione di investimento (nello stesso salvataggio) e sul conto si registra il lato "contanti" come giroconto a un solo lato (categoria Trasferimento, proprio `transfer_group_id`, escluso dai totali): il deposito si riduce, il valore compare negli Investimenti. Le righe si applicano in ordine di data; una vendita oltre le quote possedute blocca l'import (nulla viene salvato).
- **Saldo dagli estratti**: il saldo iniziale e la data di apertura di un conto sono facoltativi (vuoto = 0, oggi) e li ricava l'import (`src/domain/balance.ts`). Il saldo resta "saldo iniziale + movimenti", quindi si aggiorna da solo a ogni importazione. (1) **Retrodatazione**: righe precedenti all'apertura non vengono rifiutate; l'apertura passa alla prima riga e, se il saldo iniziale era già noto, si compensa delle righe aggiunte prima così il saldo attuale non cambia. (2) **Ancoraggio**: con il saldo a fine estratto (Revolut: colonna `Saldo` dell'ultima riga completata; Fineco e Trade Republic: lo scrive l'utente in anteprima, facoltativo) il saldo iniziale diventa `saldo dichiarato − somma dei movimenti fino a quel giorno`. L'anteprima mostra il saldo che risulterà e, se il saldo iniziale era già noto, la **differenza** rispetto ai movimenti già registrati (segnala un estratto o dei movimenti mancanti; confermando, il saldo si riallinea comunque all'estratto). In alternativa al saldo finale l'utente può scrivere il **saldo a inizio estratto** (prima del primo movimento): l'app parte da quello, somma i movimenti e mostra il risultato (caso Trade Republic, il cui CSV non riporta saldi); serve solo la prima volta, poi il saldo prosegue da solo. Si ricorda in `_meta` (`balance_anchored:<id conto>`) che il saldo iniziale è stato ricavato da un estratto.
- **Annulla importazione** (`src/import/undo.ts`): ogni import registra in `_meta` (`import_undo:<id lotto>`) lo stato precedente del conto (saldo iniziale, apertura, ancoraggio) e gli id delle operazioni e degli asset creati. Annullare elimina in modo logico i movimenti del lotto (`import_batch_id`), le sue operazioni e gli asset che non hanno altre operazioni, riporta il conto com'era, segna il lotto `discarded` (il file torna importabile) e libera i `dedupe_hash`. Il ripristino del saldo vale solo per l'**ultimo** import del conto (prima si annullano i più recenti). Per gli import fatti prima di questa funzione non c'è lo stato registrato: si tolgono i movimenti ma il conto non si tocca e il saldo va controllato. Non si annulla se delle vendite successive resterebbero senza le quote acquistate dall'import. Le regole imparate restano.
- **Regole**: vedi §7.2. Alla prima apertura si creano anche **regole iniziali** (esercenti e parole comuni, `source = default`, priorità da 1000: quelle dell'utente vincono sempre; `_meta default_rules_seeded`). Correggendo una categoria in anteprima si può ricordare la scelta (testo modificabile); le regole usate aumentano `hit_count`.
- **Assunzioni da verificare al primo import reale**: (1) in Trade Republic `amount` è lordo di commissioni e tasse; (2) valori di `category`/`type` di Trade Republic: da progetti pubblici che leggono lo stesso CSV (Wealthfolio importer di blastik, tr-portfolio-visualizer di Lory99) risultano `category` TRADING (BUY, SELL), CASH (CUSTOMER_INBOUND, CUSTOMER_INPAYMENT, CUSTOMER_OUTBOUND_REQUEST, CARD_TRANSACTION, CARD_TRANSACTION_INTERNATIONAL, CARD_ORDERING_FEE, BENEFITS_SAVEBACK, DIVIDEND, INTEREST_PAYMENT, MANUAL_CASH_TRANSFER, TRANSFER_INBOUND/OUTBOUND, TRANSFER_INSTANT_INBOUND/OUTBOUND, TRANSFER_DIRECT_DEBIT_INBOUND, STOCKPERK) e DELIVERY (FREE_RECEIPT, MIGRATION). L'elenco non è ufficiale né garantito completo: l'app tratta come giroconto i bonifici da/verso la banca (`CUSTOMER_*`, `TRANSFER_*`: non contano come entrate o spese), esclude come "solo informative" STOCKPERK e MIGRATION, e ciò che non riconosce resta "tipo non riconosciuto" ed escluso; (3) nell'intestazione Fineco `Data_Opera…` può essere troncata (si riconosce per prefisso).

### 7.2 Auto-categorizzazione

- Regole condizionali a priorità (contains/starts_with/equals/regex su descrizione, importo, conto).
- **Apprendimento**: quando l'utente cambia categoria in anteprima o in elenco, l'app propone di creare una regola (`source=learned`) con pattern suggerito dalla descrizione. L'utente conferma o modifica.
- Prima regola che corrisponde (per priorità) vince; `hit_count` aggiornato.

### 7.3 Ricorrenze e liquidità futura

- Le occorrenze future sono **proiettate a runtime** per il forecast, non scritte.
- Alla data di scadenza diventano `transactions` reali (con conferma o generazione automatica all'apertura, da decidere in Fase 3).

### 7.4 Budget e obiettivi

- Limite mensile per categoria. Barra: verde sotto la soglia, **rossa** da `warn_threshold_pct` (default 80%) in su, con indicatore di sforamento oltre il 100%.

### 7.5 Filtri

- Filtro globale o per vista: range di date + selezione singola/multipla di categorie. Stato condiviso tra le viste.

### 7.6 Investimenti e metriche

- **Patrimonio** = saldi conti (opening + Σ transazioni) + Σ (quantità × ultimo prezzo × fx). Il contante sui conti brokerage è contato una sola volta.
- **ROI** = (valore attuale + proventi incassati − contributi netti) / contributi netti.
- **TWR**: prodotto concatenato dei rendimenti dei sotto-periodi delimitati dai flussi esterni (depositi/prelievi): `R_i = V_fine_i / (V_inizio_i + CF_inizio_i) − 1`, `TWR = Π(1 + R_i) − 1`. La convenzione sui flussi va fissata nei test con casi noti calcolati a mano.
- **Asset allocation**: grafico a torta per `asset_class` (inclusa liquidità), in EUR.
- Prezzi: inserimento manuale sempre disponibile come fallback; aggiornamento da fonte gratuita opzionale.

### 7.7 Esportazione

- Export dell'intero dataset in CSV (uno per tabella, zip) o JSON, in un click.

### 7.8 Dashboard (definizioni)

Struttura (ispirata a un riferimento scelto dal proprietario): in alto quattro indicatori e il **selettore dell'anno**; poi due grafici larghi; poi tre riquadri. Tutto si riferisce all'**anno scelto** (predefinito: quello in corso; gli anni offerti sono quelli con movimenti o conti aperti).

- **Patrimonio netto** = saldi di tutti i conti **+ valore degli investimenti**, in EUR, **alla fine dell'anno scelto** (oggi per l'anno in corso). Saldo di un conto = saldo iniziale + movimenti fino a quel giorno; prima della data del saldo iniziale un conto vale 0. I giroconti tra conti non lo cambiano. I conti e gli asset in valuta estera usano l'ultimo tasso disponibile; senza tasso sono esclusi e segnalati. Non esistono passività: i conti con saldo negativo riducono il patrimonio.
- **Entrate / Spese / Risparmio** dell'anno: da `amount_base_minor` (EUR), **giroconti esclusi**; risparmio = entrate − spese (può essere negativo).
- **Patrimonio netto per mese** (grafico ad area): saldo a fine mese dei mesi dell'anno, mai oltre oggi.
- **Entrate, spese e flusso di cassa per mese**: barre per entrate e spese, linea per entrate − spese; solo i mesi già iniziati.
- **Conti e investimenti** (torta): un pezzo per ogni tipo di conto con saldo positivo (conto corrente, conto deposito, contanti, liquidità del conto di investimento) più **"Investimenti"** (valore degli asset, §7.9), in EUR alla fine dell'anno scelto, con sotto il totale dei conti e degli investimenti e le percentuali. Un conto in rosso non è un'attività e non compare. (Al posto delle passività del riferimento: il proprietario non ha mutui né carte di credito.)
- **Entrate per categoria** (ciambella) e **Spese per categoria** (barre): sottocategorie sommate nella madre, senza categoria = "Da categorizzare", primi 5/6 elementi + "Altre categorie".
- **Accessibilità**: ogni grafico ha un'etichetta testuale; le ciambelle hanno l'elenco con importo e percentuale; i grafici nel tempo hanno la tabella dei dati ("Mostra i dati"). Non ci si affida al solo colore.
- **Tema scuro unico** (nessuna alternativa chiara): palette in `src/ui/theme.ts` e `src/index.css`, con un test che ne verifica contrasto (≥ 4,5:1 per i testi, ≥ 3:1 per bordi e grafici) e coerenza tra i due file.

### 7.9 Investimenti (implementazione)

Gestione manuale degli asset posseduti, con acquisti, vendite e prezzi inseriti a mano (nessuna fonte di prezzi online per ora: `price_source = manual`).

- **Schede**: `assets`, `investment_transactions` (acquisto/vendita; gli altri tipi dello schema — dividendi, commissioni, split… — restano riservati), `price_history`. Quantità e prezzi sono **stringhe decimali esatte** (mai float); le commissioni sono denaro e si salvano come intero in `fees_minor` (centesimi della valuta dell'asset), non come decimale.
- **Quantità** a una data = Σ acquisti − Σ vendite fino a quella data. In nessun momento si può vendere più di quanto si possiede; non si può eliminare un'operazione se la quantità scenderebbe sotto zero in qualche momento (nello stesso giorno gli acquisti contano prima delle vendite).
- **Prezzo** a una data = l'ultimo prezzo noto fino a quel giorno, tra i prezzi inseriti e i prezzi delle operazioni; a parità di data prevale il prezzo inserito a mano. Senza alcun prezzo noto l'asset è **escluso dal patrimonio e segnalato** (non si inventa un valore). Un secondo prezzo nello stesso giorno sostituisce il primo.
- **Valore** = quantità × prezzo, arrotondato al centesimo nella valuta dell'asset e poi convertito in EUR (ultimo tasso disponibile; senza tasso, escluso e segnalato).
- **Operazioni**: `amount_base_minor` (sempre positivo) = acquisto: quantità × prezzo + commissioni; vendita: quantità × prezzo − commissioni, convertiti in EUR al **cambio del giorno** (salvato in `fx_rate`, come per i movimenti).
- **Rendimento semplice** (ARCHITECTURE §7.6): ROI = (valore attuale + incassi dalle vendite − totale pagato) / totale pagato, tutto in EUR. Il TWR resta della Fase 3 completa.
- **Liquidità**: gli acquisti e le vendite inseriti a mano **non muovono il saldo dei conti** automaticamente (quelli importati da Trade Republic sì, vedi §7.1). La liquidità del conto di investimento si tiene aggiornata a parte (saldo del conto). `account_id` delle operazioni è facoltativo e indica solo dove è detenuto l'asset.
- **Asset in valuta estera**: l'acquisto richiede il cambio del giorno (dal servizio dei cambi, §5).
- **Nuovo asset**: un solo modulo che crea asset, acquisto iniziale (quantità, prezzo pagato, data, commissioni) e, se indicato, il prezzo attuale, **in un'unica scrittura atomica**.
- **Aggiornamento di un foglio esistente**: le tre schede nuove si creano da sole all'avvio, senza toccare i dati già presenti (nessuna migrazione: sono schede nuove).

## 8. Sicurezza

- Nessun login Google nell'app. L'accesso è protetto da una **chiave segreta** (lunga, casuale, 32+ caratteri) conservata nelle Proprietà script (`SECRET`), mai nel codice.
- Chi ha l'indirizzo dello script **e** la chiave legge e scrive tutto: la chiave è l'unica protezione. Va trattata come una password; se trapela, si cambia la proprietà `SECRET`.
- La chiave viaggia nel **corpo** della richiesta, mai nell'URL. Il client la invia solo verso `https://script.google.com/macros/s/`.
- La chiave è salvata sul dispositivo (`localStorage`): eccezione consapevole. Su iOS i dati del sito di una PWA installata non vengono ripuliti per inattività come nelle schede di Safari: da verificare nel test su iPhone.
- Content Security Policy rigida (applicata alla build): nessuno script esterno; richieste di rete solo verso `script.google.com` e `script.googleusercontent.com`.
- Dipendenze minime e versioni bloccate.
- Nessun dato finanziario nei log, nelle analytics, nei messaggi di errore, nei fixture del repository.
- PIN: hash salvato localmente solo per il blocco UI (4-8 cifre, PBKDF2-SHA256 con sale casuale, 100.000 iterazioni; mai il PIN in chiaro); auto-lock per inattività (predefinito 5 minuti, scelta 1-30) e al ritorno da un lungo background; al blocco i dati in memoria vengono scartati (l'app e i dati non sono montati: dopo lo sblocco si rileggono dal foglio). L'app si apre sempre bloccata se il PIN è attivo.
  - Dopo 5 tentativi sbagliati scatta un'attesa (30 s, poi 2 min dall'8°, 5 min dal 10°). Il contatore è in memoria: ricaricando la pagina riparte. Con 4-8 cifre un PIN è comunque forzabile da chi legge il localStorage: **è un blocco dell'interfaccia, non una protezione dei dati**.
  - PIN dimenticato: la schermata di blocco offre "PIN dimenticato", che rimuove da quel dispositivo il PIN **e la chiave dello script** (serve reinserire la chiave, che solo il proprietario ha). I dati nel foglio non vengono toccati.
- L'indirizzo dello script in variabile d'ambiente (`VITE_SCRIPT_URL`); la chiave segreta **mai** in repository, in `.env*` o nel bundle: si inserisce nell'app. Nessun segreto nel repository.

## 9. Backup

- **Apps Script** legato al Sheet, trigger settimanale: copia il file nella cartella Drive `Backup Patrimonio`, mantiene le ultime N copie (default 8), scrive l'esito in `_backup_log`.
- Google Drive per desktop (Windows) sincronizza la cartella sul PC → l'utente la copia su NAS/disco esterno.
- Lo script di backup è `apps-script/Backup.gs`: va incollato a mano come secondo file nello stesso progetto Apps Script del foglio (aggiungerlo non richiede di ripubblicare l'app web). Si esegue una volta `setupWeeklyBackup` (autorizzazione a Drive), che crea il trigger della domenica; `backupNow` fa una copia subito. Prende lo stesso lock dell'app web per non copiare mentre si scrive. Le copie in eccesso vanno nel cestino (non sono cancellate per sempre) e si toccano solo i file con prefisso `Patrimonio backup `.
- Export manuale CSV/JSON dall'app.
- Cronologia versioni nativa di Google Sheets come ulteriore rete di sicurezza.

## 10. Roadmap

### Fase 0 — Prototipo di fattibilità (go/no-go)

Obiettivo: verificare che la PWA legga e scriva il Sheet tramite lo script Apps Script, su PC e su iPhone.

> Cambio di rotta (approvato dal proprietario): la Fase 0 era partita con login Google (OAuth, GIS, `drive.file`). Il proprietario non vuole alcun login Google nell'app, quindi si usa l'alternativa (a) di §12: Apps Script come porta d'ingresso. Il codice OAuth è stato rimosso.

- App minima: schermata diagnostica con chiave segreta, "prova collegamento", creazione della scheda di prova, lettura e scrittura di una riga.
- Test su **Windows (Chrome/Edge, localhost)** e **iPhone (PWA installata da Safari)**.
- Verifiche: la PWA su iPhone raggiunge lo script (CORS, redirect su `script.googleusercontent.com`); la chiave salvata sopravvive a chiusura, riapertura dopo ore e ritorno dal background; scrittura atomica e rifiuto con struttura rotta.
- Lo script va distribuito come app web con "Esegui come: me" e "Chi ha accesso: chiunque"; la prima autorizzazione è dello script, non dell'app.
- **Esito (parziale, riportato dal proprietario):** la chiave viene accettata, lo script crea il foglio e la scheda di prova, la lettura funziona. **Ancora da confermare su iPhone:** persistenza della chiave dopo ore/chiusura dell'app e ritorno dal background. Non blocca la Fase 1; se il controllo fallisse si rivede la scelta (b) di §2.

### Fase 1 — Fondamenta e CRUD

- Repository, tooling, CI minima, PWA
- Layer dati: creazione automatica di Sheet/schede/intestazioni, richieste `read`/`append` raggruppate verso lo script, validazione Zod, retry su 429, interfaccia `Repository` astratta
- Schermata di blocco con PIN, auto-lock
- Conti, categorie, CRUD spese/entrate, filtri avanzati (date + multi-categoria)
- **Shell responsive mobile-first e dashboard come schermata iniziale** (anticipate dalla Fase 3 su richiesta del proprietario): navigazione in basso su mobile e sidebar su desktop; sezioni Dashboard, Movimenti, Budget, Investimenti, Impostazioni. La dashboard mostra fin dal primo giorno patrimonio totale, spese del mese per categoria, andamento della liquidità e budget. Dove non ci sono ancora dati: stati vuoti ("Nessun dato"), **mai dati inventati**. Gli strumenti di diagnostica della Fase 0 vanno in Impostazioni.
- Apps Script di backup settimanale + export manuale CSV/JSON
- Servizio cambi (Frankfurter) con cache

> **Ordine delle fasi (deciso dal proprietario):** prima l'app completa nei requisiti funzionali e non funzionali (Fasi 1-3), poi l'import degli estratti conto (Fase 4) e infine la grafica (Fase 5). Fino ad allora l'aspetto resta quello essenziale attuale: nessun lavoro di design visuale.

### Fase 2 — Pianificazione e budget

- Ricorrenze e proiezione liquidità
- Budget e obiettivi, con barre che mostrano anche percentuale/testo
- Dashboard con dati veri e funzionali (confronto mensile, proiezione liquidità, budget), filtri globali condivisi tra le viste. Le shell e i widget base arrivano già in Fase 1.

### Fase 3 — Investimenti

- **Anticipato su richiesta del proprietario (§7.9):** asset, acquisti e vendite, prezzi manuali, valore e rendimento semplice, patrimonio totale con gli investimenti, torta conti/investimenti, multi-valuta.
- Resta: TWR, dividendi e interessi, commissioni come operazioni a sé, split, aggiornamento prezzi da fonte gratuita, asset allocation per classe, snapshot del portafoglio nel tempo.
- Test dei calcoli con casi noti calcolati a mano

### Fase 4 — Import estratti conto e regole

- Framework a parser plugin; un parser per ogni banca/broker (CSV/PDF), nel Web Worker. Il file non viene mai salvato.
- Spesa/entrata dal segno dell'importo, importo, data e descrizione estratti automaticamente
- Flusso anteprima modificabile → conferma; deduplicazione; rilevamento giroconti
- Motore di categorizzazione a regole + apprendimento

### Fase 5 — Grafica e rifinitura

- **Anticipato su richiesta del proprietario** (prima di import e fasi 2-3): tema scuro e dashboard nello stile del riferimento fornito, applicati a tutte le schede (§7.8). Resta qui la rifinitura (animazioni, dettagli, controlli su dispositivi reali).
- Revisione sicurezza, performance su mobile, accessibilità, documentazione

## 11. Setup ambiente (Windows)

- Node.js (versione LTS), Git for Windows, VS Code, estensione **Claude Code** (publisher Anthropic).
- Account Google e un Google Sheet. **Nessun progetto Google Cloud né OAuth**: serve solo il progetto Apps Script legato al foglio (Estensioni > Apps Script). Su Windows, in PowerShell, usare `npm.cmd` se l'execution policy blocca `npm.ps1`.
- Script npm cross-platform (niente comandi solo-bash).

## 12. Rischi e alternative

| Rischio | Mitigazione |
|---|---|
| Accesso senza login: chi ha URL dello script + chiave legge e scrive tutto | Chiave lunga e casuale nelle Proprietà script, mai nel codice né nell'URL; la si cambia se trapela; l'URL non va condiviso. Il PIN dell'interfaccia non protegge i dati |
| Chiave salvata sul dispositivo (`localStorage`) | Eccezione consapevole. Su iOS i dati di una PWA installata non vengono ripuliti per inattività come in Safari: da verificare in Fase 0 |
| Quote e latenza di Apps Script | Batching, debounce, backoff su 429; ~1-2 s a chiamata, accettabile per un solo utente |
| Quote API | Batching, debounce, backoff su 429 |
| Foglio modificato a mano e struttura rotta | Validazione in lettura, messaggi chiari, nessuna scrittura se lo schema non è valido |
| Compromissione account Google | Passkey/2FA, Sheet non condiviso |
| Errori nei calcoli finanziari | Test con casi noti (TWR, ROI, conversioni), fixture sintetici |
| Dati reali nel repository | Fixture solo sintetici; `.gitignore` per file di estratti conto |

## 13. Decisioni aperte

- ~~Persistenza del token~~ → **deciso**: nessun token; chiave dello script salvata sul dispositivo (§2, §8). Da riverificare dopo il test su iPhone.
- Stati vuoti vs. dati di esempio nella dashboard → **deciso** (default): stati vuoti. Modificabile su richiesta.
- Generazione automatica vs. conferma manuale delle ricorrenze scadute → Fase 3.
- Fonte opzionale per i prezzi di mercato → Fase 4.
- Hosting statico definitivo (Cloudflare Pages vs. GitHub Pages) → Fase 1.
