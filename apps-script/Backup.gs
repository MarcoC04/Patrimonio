/**
 * Backup settimanale del foglio Patrimonio.
 *
 * Va incollato come SECONDO file (+ > Script) nello stesso progetto Apps Script di Code.gs.
 *  1. Esegui una volta `setupWeeklyBackup` (ti verrà chiesta l'autorizzazione ad usare Drive).
 *  2. Facoltativo: esegui `backupNow` per provare subito.
 *
 * Ogni domenica alle 3 circa copia il foglio nella cartella Drive "Backup Patrimonio", tiene le
 * ultime BACKUP_KEEP copie (le più vecchie vanno nel cestino, non sono cancellate per sempre) e
 * scrive l'esito nella scheda `_backup_log`. L'app Patrimonio ignora questa scheda.
 * Aggiungere questo file NON richiede di ripubblicare la distribuzione dell'app web.
 */

var BACKUP_FOLDER_NAME = 'Backup Patrimonio';
var BACKUP_PREFIX = 'Patrimonio backup ';
var BACKUP_KEEP = 8;
var BACKUP_LOG_TAB = '_backup_log';
var BACKUP_LOG_HEADERS = ['started_at', 'file_id', 'status', 'error'];
var BACKUP_LOCK_WAIT_MS = 30000;

/** Crea il trigger settimanale (rimuove prima quelli vecchi, così non si duplica). */
function setupWeeklyBackup() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'backupNow') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('backupNow')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(3)
    .create();
}

/**
 * Dati i file nella cartella di backup, restituisce gli id da mandare nel cestino: solo le copie
 * con il nostro prefisso, tenendo le `keep` più recenti. Non tocca altri file nella cartella.
 */
function selectBackupsToDelete_(items, keep) {
  return items
    .filter(function (item) {
      return item.name.indexOf(BACKUP_PREFIX) === 0;
    })
    .sort(function (a, b) {
      return b.created - a.created;
    })
    .slice(keep)
    .map(function (item) {
      return item.id;
    });
}

function backupFolder_() {
  var existing = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  return existing.hasNext() ? existing.next() : DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

function pruneBackups_(folder) {
  var items = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    items.push({
      id: file.getId(),
      name: file.getName(),
      created: file.getDateCreated().getTime(),
    });
  }
  var toDelete = selectBackupsToDelete_(items, BACKUP_KEEP);
  toDelete.forEach(function (id) {
    DriveApp.getFileById(id).setTrashed(true);
  });
  return toDelete.length;
}

function logBackup_(startedAt, fileId, status, error) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(BACKUP_LOG_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(BACKUP_LOG_TAB);
    sheet.getRange(1, 1, 1, BACKUP_LOG_HEADERS.length).setNumberFormat('@');
    sheet.getRange(1, 1, 1, BACKUP_LOG_HEADERS.length).setValues([BACKUP_LOG_HEADERS]);
    sheet.setFrozenRows(1);
  }
  var row = sheet.getLastRow() + 1;
  var range = sheet.getRange(row, 1, 1, BACKUP_LOG_HEADERS.length);
  range.setNumberFormat('@'); // testo semplice: nessuna conversione né formula
  range.setValues([[startedAt, fileId, status, error]]);
}

/** Copia il foglio nella cartella di backup, elimina le copie in eccesso e scrive l'esito. */
function backupNow() {
  var startedAt = new Date().toISOString();
  var lock = LockService.getScriptLock();
  // Lo stesso lock dell'app web: non si copia il foglio mentre l'app sta scrivendo.
  if (!lock.tryLock(BACKUP_LOCK_WAIT_MS)) {
    logBackup_(startedAt, '', 'error', 'busy');
    return;
  }
  try {
    var spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    var folder = backupFolder_();
    var copy = DriveApp.getFileById(spreadsheetId).makeCopy(
      BACKUP_PREFIX + startedAt.replace(/[:.]/g, '-'),
      folder,
    );
    pruneBackups_(folder);
    logBackup_(startedAt, copy.getId(), 'ok', '');
  } catch (err) {
    // Il messaggio di Drive non contiene dati del foglio.
    logBackup_(startedAt, '', 'error', String(err && err.message ? err.message : err));
  } finally {
    lock.releaseLock();
  }
}
