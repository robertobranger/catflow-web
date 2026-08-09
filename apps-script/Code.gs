/**
 * CatFlow — Google Apps Script backend.
 *
 * Setup:
 *  1. Open your Google Sheet -> Extensions -> Apps Script, paste this file.
 *  2. Project Settings -> Script Properties -> add property:
 *       TOKEN = <a long random secret, same one you enter in the app>
 *  3. Deploy -> New deployment -> Web app:
 *       Execute as: Me
 *       Who has access: Anyone
 *  4. Copy the web app URL (ends in /exec) into the app's setup screen.
 *
 * Sheet layout expected:
 *  - Tab "Transactions" with header row:
 *      Date | ID | Concept | Counterparty | Domain | Origin account |
 *      Destination account | Amount | Notes | Date created
 *  - Tab "Config": Accounts in A2:A, Domains in B2:B (A1/B1 are headers).
 */

var TRANSACTIONS_SHEET = 'Transactions';
var CONFIG_SHEET = 'Config';

var COL = {
  DATE: 0,
  ID: 1,
  CONCEPT: 2,
  COUNTERPARTY: 3,
  DOMAIN: 4,
  ORIGIN: 5,
  DESTINATION: 6,
  AMOUNT: 7,
  NOTES: 8,
  CREATED: 9,
};

function doPost(e) {
  var out;
  try {
    var body = JSON.parse(e.postData.contents);
    requireToken_(body.token);

    switch (body.action) {
      case 'add':
        out = addTransaction_(body.tx);
        break;
      case 'meta':
        out = getMeta_();
        break;
      default:
        throw new Error('Unknown action: ' + body.action);
    }
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function requireToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!expected) throw new Error('TOKEN script property is not set');
  if (token !== expected) throw new Error('Invalid token');
}

function addTransaction_(tx) {
  if (!tx || !tx.id) throw new Error('Missing transaction or id');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet_(TRANSACTIONS_SHEET);

    // Idempotency: skip if this UUID is already present (offline retries).
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var ids = sheet.getRange(2, COL.ID + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (ids[i][0] === tx.id) return { duplicate: true };
      }
    }

    var row = [];
    row[COL.DATE] = tx.date || '';
    row[COL.ID] = tx.id;
    row[COL.CONCEPT] = tx.concept || '';
    row[COL.COUNTERPARTY] = tx.counterparty || '';
    row[COL.DOMAIN] = tx.domain || '';
    row[COL.ORIGIN] = tx.origin || '';
    row[COL.DESTINATION] = tx.destination || '';
    row[COL.AMOUNT] = tx.amount === '' || tx.amount == null ? '' : Number(tx.amount);
    row[COL.NOTES] = tx.notes || '';
    row[COL.CREATED] = tx.dateCreated || new Date().toISOString();

    sheet.appendRow(row);
    return { duplicate: false };
  } finally {
    lock.releaseLock();
  }
}

function getMeta_() {
  var config = getSheet_(CONFIG_SHEET);
  var accounts = columnValues_(config, 1);
  var domains = columnValues_(config, 2);

  var txSheet = getSheet_(TRANSACTIONS_SHEET);
  var concepts = [];
  var counterparties = [];
  var lastRow = txSheet.getLastRow();
  if (lastRow > 1) {
    var data = txSheet
      .getRange(2, 1, lastRow - 1, COL.CREATED + 1)
      .getValues();
    concepts = uniqueNonEmpty_(data.map(function (r) { return r[COL.CONCEPT]; }));
    counterparties = uniqueNonEmpty_(data.map(function (r) { return r[COL.COUNTERPARTY]; }));
  }

  return {
    accounts: accounts,
    domains: domains,
    concepts: concepts,
    counterparties: counterparties,
  };
}

function getSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function columnValues_(sheet, col) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return uniqueNonEmpty_(
    sheet
      .getRange(2, col, lastRow - 1, 1)
      .getValues()
      .map(function (r) { return r[0]; })
  );
}

function uniqueNonEmpty_(values) {
  var seen = {};
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var v = String(values[i]).trim();
    if (v && !seen[v]) {
      seen[v] = true;
      out.push(v);
    }
  }
  return out;
}
