/**
 * Kollect GFF Booth Demo — Google Apps Script Webhook
 * =====================================================
 * Paste this entire file into the Apps Script editor for your Google Sheet,
 * then deploy it as a Web App (see GOOGLE_SHEETS_SETUP.md).
 *
 * Every time an attendee interacts with the demo, the Node.js server sends a
 * POST request here with the full session record.  This script finds the
 * existing row for that Session ID and updates it in-place, or appends a new
 * row if it's the first event for that session.
 */

var SHEET_NAME = 'Attendee Sessions';

// Column order must match telemetryStore.js CSV_COLUMNS exactly.
var COLUMNS = [
  'sessionId', 'loginTime', 'name', 'phone', 'loginMethod',
  'introAction',
  'voiceSelected', 'voiceBrowseCount', 'voicePlayCount',
  'archetypeSelected',
  'timeOnVoiceScreenS', 'timeOnArchetypeScreenS', 'timeOnPersonaScreenS',
  'dashboardEntryTime',
  'timeOnBorrower360S', 'timeOnStrategyS', 'timeOnExecutionS', 'timeOnFulfilmentS',
  'dashboardTotalTimeS',
  'highestStepReached',
  'autoPlayUsed',
  'manualStepsNext', 'manualStepsPrev',
  'resetCount',
  'directCallModalOpened', 'whatsappToggleUsed',
  'uiTapLog',
  'callId', 'callStatus', 'callOutcome',
  'whatsappRound1', 'whatsappRound2',
  'lastUpdated',
];

// Human-readable header labels (same order as COLUMNS)
var HEADERS = [
  'Session ID', 'Login Time', 'Name', 'Phone', 'Login Method',
  'Intro Action',
  'Voice Selected', 'Voice Browse Count', 'Voice Play Count',
  'Archetype Selected',
  'Time on Voice (s)', 'Time on Archetype (s)', 'Time on Persona (s)',
  'Dashboard Entry Time',
  'Time on Borrower 360 (s)', 'Time on Strategy (s)', 'Time on Execution (s)', 'Time on Fulfilment (s)',
  'Dashboard Total Time (s)',
  'Highest Step Reached',
  'Auto-Play Used',
  'Manual Steps Next', 'Manual Steps Prev',
  'Reset Count',
  'Direct Call Modal Opened', 'WhatsApp Toggle Used',
  'UI Tap Log',
  'Call ID', 'Call Status', 'Call Outcome',
  'WhatsApp Round 1', 'WhatsApp Round 2',
  'Last Updated',
];

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var sessionId = body.sessionId;
    if (!sessionId) {
      return jsonResponse({ error: 'sessionId missing' }, 400);
    }

    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    // Ensure header row exists
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // Find existing row for this sessionId
    var data   = sheet.getDataRange().getValues();
    var rowIdx = -1; // 0-indexed in `data`; row 0 is headers
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(sessionId)) { rowIdx = i; break; }
    }

    // Build the updated row by merging existing values with the new payload
    var existing = (rowIdx !== -1 && rowIdx < data.length) ? data[rowIdx] : [];
    var newRow   = COLUMNS.map(function (col, i) {
      var incoming = body[col];
      // Arrays (uiTapLog) → join with " | " for readability
      if (Array.isArray(incoming)) incoming = incoming.join(' | ');
      // If incoming is valid, use it; otherwise keep existing
      return (incoming !== undefined && incoming !== null && incoming !== '')
        ? incoming
        : (existing[i] !== undefined ? existing[i] : '');
    });

    if (rowIdx === -1) {
      // New session — append the row directly
      sheet.appendRow(newRow);
      return jsonResponse({ ok: true, action: 'appended', row: sheet.getLastRow() });
    } else {
      // Existing session — update in-place (rowIdx 0 = row 1 in sheet)
      var sheetRowNum = rowIdx + 1;
      sheet.getRange(sheetRowNum, 1, 1, newRow.length).setValues([newRow]);
      return jsonResponse({ ok: true, action: 'updated', row: sheetRowNum });
    }
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function jsonResponse(obj, code) {
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// doGet — health check so you can verify deployment is alive
function doGet(e) {
  return jsonResponse({ status: 'ok', sheet: SHEET_NAME });
}
