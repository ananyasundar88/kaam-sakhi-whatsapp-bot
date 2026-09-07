/**
 * Paste this into: your Google Sheet → Extensions → Apps Script.
 * Then: Deploy → New deployment → type "Web app" →
 *   Execute as: Me
 *   Who has access: Anyone
 * Copy the resulting URL (ends in /exec) into APPS_SCRIPT_URL on Railway.
 *
 * Change SHARED_SECRET below to your own random string, and put that same
 * string in APPS_SCRIPT_SECRET on Railway — this is what stops a stranger
 * who finds your URL from writing junk rows into your sheet.
 */

var SHARED_SECRET = 'REPLACE_WITH_YOUR_OWN_RANDOM_STRING';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.secret !== SHARED_SECRET) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
    sheet.appendRow([
      new Date(),
      body.phone || '',
      body.name || '',
      body.city || '',
      body.languages || '',
      body.hometown || '',
      body.work_platform || '',
      body.work_city || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
