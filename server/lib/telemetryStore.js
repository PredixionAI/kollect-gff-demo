/**
 * telemetryStore.js
 *
 * Manages live telemetry sessions for the Kollect GFF booth demo.
 *
 * Flow per event:
 *   1. Upsert session record in the in-memory Map (instant).
 *   2. Write the full updated record to server/data/sessions.json (local fallback).
 *   3. POST a partial patch to the Google Apps Script webhook if configured.
 *
 * Nothing here can throw in a way that crashes the demo — every risky path is
 * wrapped in a try/catch that logs and continues.
 */

const fs   = require('fs');
const path = require('path');

// ─── Local fallback file ──────────────────────────────────────────────────────
const DATA_DIR  = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'sessions.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readDiskSessions() {
  try {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.warn('[telemetry] Could not read sessions.json:', e.message);
    return {};
  }
}

function writeDiskSessions(all) {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2), 'utf8');
  } catch (e) {
    console.warn('[telemetry] Could not write sessions.json:', e.message);
  }
}

// ─── In-memory store ──────────────────────────────────────────────────────────
// Populated from disk on first access so a server restart doesn't lose data
// that arrived before the crash.
let _sessions = null;

function getSessions() {
  if (!_sessions) _sessions = readDiskSessions();
  return _sessions;
}

// ─── Google Sheets webhook ────────────────────────────────────────────────────
// Fire-and-forget with 3 retries and a 6 s timeout per attempt.
// We use the built-in http/https modules (no extra deps) via node-fetch v2
// which is already in package.json.
const fetch = require('node-fetch');

async function pushToSheets(sessionRecord) {
  const config = require('../config');
  const url    = config.telemetry && config.telemetry.googleSheetWebhookUrl;
  if (!url) return; // not configured — silent skip

  const MAX_TRIES = 3;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        method:   'POST',
        headers:  { 'Content-Type': 'application/json' },
        body:     JSON.stringify(sessionRecord),
        signal:   controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeout);
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.ok) return; // success
        console.warn(`[telemetry] Sheets webhook responded with app error:`, body.error);
        return;
      }
      console.warn(`[telemetry] Sheets webhook HTTP ${res.status} (attempt ${attempt})`);
    } catch (err) {
      console.warn(`[telemetry] Sheets webhook error (attempt ${attempt}):`, err.message);
    }
    if (attempt < MAX_TRIES) await new Promise(r => setTimeout(r, 800 * attempt));
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upsert a session record.
 * `patch` is any subset of the session fields — it is deep-merged into the
 * existing record (or a new record is created).  Arrays in `uiTapLog` are
 * appended to, not replaced.
 */
function upsertSession(sessionId, patch) {
  if (!sessionId) return;
  const all     = getSessions();
  const existing = all[sessionId] || { sessionId, loginTime: null };

  // Merge uiTapLog (array) by appending new entries
  const existingTaps = existing.uiTapLog || [];
  const newTaps      = patch.uiTapLog    || [];
  const mergedTaps   = existingTaps.concat(newTaps);

  const updated = {
    ...existing,
    ...patch,
    sessionId,
    uiTapLog:  mergedTaps.length ? mergedTaps : undefined,
    lastUpdated: new Date().toLocaleTimeString('en-IN', { hour12: true }),
  };

  // Clean up undefined keys
  Object.keys(updated).forEach(k => updated[k] === undefined && delete updated[k]);

  all[sessionId] = updated;
  writeDiskSessions(all);
  // Push async — do not await
  pushToSheets(updated).catch(() => {});
  return updated;
}

function getAll() {
  return getSessions();
}

function getSession(sessionId) {
  return getSessions()[sessionId] || null;
}

/**
 * Export all sessions as CSV.
 * Column order matches the 32-column schema in the implementation plan.
 */
const CSV_COLUMNS = [
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

function exportCsv() {
  const all  = getSessions();
  const rows = Object.values(all);

  const escape = (v) => {
    if (v === undefined || v === null) return '';
    const str = Array.isArray(v) ? v.join(' | ') : String(v);
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? '"' + str.replace(/"/g, '""') + '"'
      : str;
  };

  const header = CSV_COLUMNS.join(',');
  const lines  = rows.map(r => CSV_COLUMNS.map(c => escape(r[c])).join(','));
  return [header, ...lines].join('\n');
}

module.exports = { upsertSession, getAll, getSession, exportCsv };
