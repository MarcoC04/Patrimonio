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
| Decimali | `decimal.js` o `big.js` (quantità e prezzi asset) |
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
- Valuta base: EUR. Cambi da API Frankfurter (dati BCE), con cache nella scheda `fx_rates` e fallback sull'ultimo tasso noto se offline.

## 6. Modello dati (una scheda = una tabella)

Colonne comuni a tutte le schede dati: `id` (UUIDv7), `created_at`, `updated_at`, `deleted` (0/1).
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
  date, quantity, unit_price, fees, currency, fx_rate, amount_base_minor

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

## 8. Sicurezza

- Nessun login Google nell'app. L'accesso è protetto da una **chiave segreta** (lunga, casuale, 32+ caratteri) conservata nelle Proprietà script (`SECRET`), mai nel codice.
- Chi ha l'indirizzo dello script **e** la chiave legge e scrive tutto: la chiave è l'unica protezione. Va trattata come una password; se trapela, si cambia la proprietà `SECRET`.
- La chiave viaggia nel **corpo** della richiesta, mai nell'URL. Il client la invia solo verso `https://script.google.com/macros/s/`.
- La chiave è salvata sul dispositivo (`localStorage`): eccezione consapevole. Su iOS i dati del sito di una PWA installata non vengono ripuliti per inattività come nelle schede di Safari: da verificare nel test su iPhone.
- Content Security Policy rigida (applicata alla build): nessuno script esterno; richieste di rete solo verso `script.google.com` e `script.googleusercontent.com`.
- Dipendenze minime e versioni bloccate.
- Nessun dato finanziario nei log, nelle analytics, nei messaggi di errore, nei fixture del repository.
- PIN: hash salvato localmente solo per il blocco UI; auto-lock per inattività; al blocco i dati in memoria vengono scartati.
- L'indirizzo dello script in variabile d'ambiente (`VITE_SCRIPT_URL`); la chiave segreta **mai** in repository, in `.env*` o nel bundle: si inserisce nell'app. Nessun segreto nel repository.

## 9. Backup

- **Apps Script** legato al Sheet, trigger settimanale: copia il file nella cartella Drive `Backup Patrimonio`, mantiene le ultime N copie (default 8), scrive l'esito in `_backup_log`.
- Google Drive per desktop (Windows) sincronizza la cartella sul PC → l'utente la copia su NAS/disco esterno.
- Lo script di backup si aggiunge allo stesso progetto Apps Script del foglio, a cura dell'utente (incollato a mano). Verrà fornito in Fase 1.
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
- **Esito:** documentare in questo file. Se fallisce, valutare le alternative PRIMA di proseguire.

### Fase 1 — Fondamenta e CRUD

- Repository, tooling, CI minima, PWA
- Layer dati: creazione automatica di Sheet/schede/intestazioni, richieste `read`/`append` raggruppate verso lo script, validazione Zod, retry su 429, interfaccia `Repository` astratta
- Login Google, schermata di blocco con PIN, auto-lock
- Conti, categorie, CRUD spese/entrate, filtri avanzati (date + multi-categoria)
- **Shell responsive mobile-first e dashboard come schermata iniziale** (anticipate dalla Fase 3 su richiesta del proprietario): navigazione in basso su mobile e sidebar su desktop; sezioni Dashboard, Movimenti, Budget, Investimenti, Impostazioni. La dashboard mostra fin dal primo giorno patrimonio totale, spese del mese per categoria, andamento della liquidità e budget. Dove non ci sono ancora dati: stati vuoti ("Nessun dato"), **mai dati inventati**. Gli strumenti di diagnostica della Fase 0 vanno in Impostazioni.
- Apps Script di backup settimanale + export manuale CSV/JSON
- Servizio cambi (Frankfurter) con cache

### Fase 2 — Import e regole

- Framework a parser plugin; parser per 2 banche (CSV/PDF) e broker
- Flusso anteprima → conferma; deduplicazione; rilevamento giroconti
- Motore di categorizzazione + apprendimento

### Fase 3 — Pianificazione e dashboard

- Ricorrenze e proiezione liquidità
- Budget e obiettivi con barre
- Completamento della dashboard (confronto mensile, proiezione liquidità, budget con barre), filtri globali. La shell e i widget base arrivano già in Fase 1.

### Fase 4 — Investimenti e rifinitura

- CRUD asset e operazioni, storico prezzi, multi-valuta
- ROI, TWR, asset allocation, patrimonio totale nel tempo
- Test dei calcoli con casi noti, revisione sicurezza, performance su mobile, documentazione

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
