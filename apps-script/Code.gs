/**
 * Porta d'ingresso del foglio per l'app Patrimonio.
 *
 * Va incollato in Estensioni > Apps Script del Google Sheet e pubblicato come
 * app web: "Esegui come: me", "Chi ha accesso: chiunque".
 * La chiave segreta NON sta nel codice: va in Impostazioni progetto >
 * Proprietà script, nome SECRET.
 *
 * Protocollo: POST con corpo JSON (Content-Type text/plain, per evitare il preflight CORS).
 *   { key, action: 'ping' }
 *   { key, action: 'init',   tabs: { nomeScheda: [intestazioni...] } }
 *   { key, action: 'read',   tabs: [nomeScheda...] }
 *   { key, action: 'append', appends: [{ tab, headers, rows: [[celle...]...] }] }
 * Risposta (sempre HTTP 200): { ok: true, data } oppure { ok: false, error: codice }.
 * Gli errori contengono solo un codice, mai dati del foglio.
 */

var SECRET_PROPERTY = 'SECRET';
var LOCK_WAIT_MS = 10000;

function doPost(e) {
  var response;
  try {
    var request = JSON.parse(e.postData.contents);
    response = handle_(request);
  } catch (err) {
    response = { ok: false, error: err && err.code ? err.code : 'server' };
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: false, error: 'use_post' }),
  ).setMimeType(ContentService.MimeType.JSON);
}

function fail_(code) {
  var error = new Error(code);
  error.code = code;
  throw error;
}

function handle_(request) {
  var secret = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);
  if (!secret) fail_('not_configured');
  if (typeof request.key !== 'string' || request.key !== secret) fail_('unauthorized');

  switch (request.action) {
    case 'ping':
      return { ok: true, data: {} };
    case 'read':
      return { ok: true, data: read_(request.tabs) };
    case 'init':
      return {
        ok: true,
        data: withLock_(function () {
          return init_(request.tabs);
        }),
      };
    case 'append':
      return {
        ok: true,
        data: withLock_(function () {
          return append_(request.appends);
        }),
      };
    default:
      fail_('bad_request');
  }
}

function withLock_(work) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) fail_('busy');
  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}

function isHeaders_(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(function (h) {
    return typeof h === 'string' && h !== '';
  });
}

function sameHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) return false;
  var actual = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length))
    .getDisplayValues()[0];
  if (actual.length < headers.length) return false;
  for (var i = 0; i < actual.length; i++) {
    var expected = i < headers.length ? headers[i] : '';
    if (actual[i] !== expected) return false;
  }
  return true;
}

/** Tutte le celle come testo semplice: i valori restano stringhe (equivale a RAW, niente formule né date). */
function asText_(range) {
  range.setNumberFormat('@');
}

function init_(tabs) {
  if (!tabs || typeof tabs !== 'object') fail_('bad_request');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = Object.keys(tabs);
  names.forEach(function (name) {
    if (!isHeaders_(tabs[name])) fail_('bad_request');
  });

  // Prima si controlla tutto, poi si crea: nessuna modifica se una scheda esistente è diversa.
  names.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet && !sameHeaders_(sheet, tabs[name])) fail_('schema');
  });

  var created = [];
  names.forEach(function (name) {
    if (ss.getSheetByName(name)) return;
    var headers = tabs[name];
    var sheet = ss.insertSheet(name);
    asText_(sheet.getRange(1, 1, sheet.getMaxRows(), headers.length));
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    created.push(name);
  });
  return { created: created };
}

function read_(tabs) {
  if (!Array.isArray(tabs)) fail_('bad_request');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {};
  tabs.forEach(function (name) {
    var sheet = typeof name === 'string' ? ss.getSheetByName(name) : null;
    if (!sheet) fail_('missing_tab');
    result[name] = sheet.getLastRow() === 0 ? [] : sheet.getDataRange().getDisplayValues();
  });
  return result;
}

function append_(appends) {
  if (!Array.isArray(appends) || appends.length === 0) fail_('bad_request');
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Validazione completa prima di scrivere qualsiasi cosa.
  var plans = appends.map(function (item) {
    if (
      !item ||
      typeof item.tab !== 'string' ||
      !isHeaders_(item.headers) ||
      !Array.isArray(item.rows)
    ) {
      fail_('bad_request');
    }
    var sheet = ss.getSheetByName(item.tab);
    if (!sheet) fail_('missing_tab');
    if (!sameHeaders_(sheet, item.headers)) fail_('schema');
    item.rows.forEach(function (row) {
      if (!Array.isArray(row) || row.length !== item.headers.length) fail_('bad_request');
      row.forEach(function (cell) {
        if (typeof cell !== 'string') fail_('bad_request');
      });
    });
    return { sheet: sheet, columns: item.headers.length, rows: item.rows };
  });

  var counts = [];
  plans.forEach(function (plan) {
    if (plan.rows.length === 0) {
      counts.push(0);
      return;
    }
    var sheet = plan.sheet;
    var firstRow = sheet.getLastRow() + 1;
    var needed = firstRow + plan.rows.length - 1;
    if (needed > sheet.getMaxRows())
      sheet.insertRowsAfter(sheet.getMaxRows(), needed - sheet.getMaxRows());
    var range = sheet.getRange(firstRow, 1, plan.rows.length, plan.columns);
    asText_(range);
    range.setValues(plan.rows);
    counts.push(plan.rows.length);
  });
  SpreadsheetApp.flush();
  return { appended: counts };
}
