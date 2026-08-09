/**
 * CatFlow — Google Apps Script backend.
 *
 * Setup:
 *  1. Open your Google Sheet -> Extensions -> Apps Script, paste this file.
 *     Also enable Project Settings -> "Show appsscript.json manifest file"
 *     and paste apps-script/appsscript.json over it (it restricts the OAuth
 *     scopes to the bound sheet + only files this script creates).
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
 *      Destination account | Amount | Notes | Date created | Receipt URL
 *  - Tab "Config": Accounts in A2:A, Domains in B2:B (A1/B1 are headers).
 *
 * Receipt photos:
 *  - "Receipt URL" is column K. Uploaded photos are stored in a Drive folder
 *    named 'CatFlow Receipts' (created automatically; its id is cached in the
 *    RECEIPT_FOLDER_ID script property). With the drive.file scope the script
 *    can only access files/folders it created — move the folder anywhere in
 *    your Drive (e.g. next to the sheet); the cached id keeps working.
 *  - IMPORTANT: the Drive upload adds a new OAuth scope. After pasting this
 *    version you must re-authorize the script and create a NEW deployment
 *    version (Deploy -> Manage deployments -> Edit -> New version) or the
 *    first upload will fail.
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
  RECEIPT: 10,
};

/**
 * Run this ONCE from the Apps Script editor (Run > authorize) after pasting
 * new code that needs extra permissions (e.g. Drive for receipt photos).
 * Deployed web apps do NOT re-prompt for new scopes on their own; running a
 * function in the editor forces the OAuth consent dialog.
 */
function authorize() {
  getReceiptFolder_(); // touches Drive, triggering the permission prompt
  SpreadsheetApp.getActiveSpreadsheet().getName(); // touches Sheets
  Logger.log('Authorized. Receipt folder ready.');
}

/** Health check: open the /exec URL in a browser to verify the deployment. */
function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, service: 'catflow', hint: 'POST JSON to use the API' })
  ).setMimeType(ContentService.MimeType.JSON);
}

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
    // This must stay BEFORE the Drive upload so retries never create
    // duplicate receipt files.
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var ids = sheet.getRange(2, COL.ID + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (ids[i][0] === tx.id) return { duplicate: true };
      }
    }

    var receiptUrl = '';
    if (tx.photo && tx.photo.data) {
      receiptUrl = saveReceipt_(tx);
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
    row[COL.RECEIPT] = receiptUrl;

    sheet.appendRow(row);
    return { duplicate: false };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Upload the transaction's receipt photo ({ data: base64, mimeType }) to the
 * 'CatFlow Receipts' Drive folder and return the file URL.
 */
function saveReceipt_(tx) {
  var blob = Utilities.newBlob(
    Utilities.base64Decode(tx.photo.data),
    tx.photo.mimeType,
    'receipt-' + tx.id + '.jpg'
  );
  var folder = getReceiptFolder_();
  var file = folder.createFile(blob);
  return file.getUrl();
}

/**
 * Get or create the 'CatFlow Receipts' folder, caching its id.
 *
 * The script runs with the narrow drive.file scope: it can only see files
 * and folders it created itself. That is why we track the folder by cached
 * id instead of searching Drive by name (searches are not permitted).
 * You can freely move or rename the folder in Drive — the id stays valid.
 */
function getReceiptFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('RECEIPT_FOLDER_ID');
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      // Folder was deleted or id is stale; fall through and recreate.
    }
  }
  var folder = DriveApp.createFolder('CatFlow Receipts');
  props.setProperty('RECEIPT_FOLDER_ID', folder.getId());
  return folder;
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
