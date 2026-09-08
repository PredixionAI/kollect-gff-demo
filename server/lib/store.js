const { EventEmitter } = require('events');

// In-memory only — fine for a booth demo, no persistence needed across restarts.
const cases = new Map(); // call_id -> case record
const escalationQueue = [];
const bus = new EventEmitter();

function createCase(callId, record) {
  cases.set(callId, { call_id: callId, status: 'initiated', createdAt: Date.now(), ...record });
  return cases.get(callId);
}

function updateCase(callId, patch) {
  const existing = cases.get(callId) || { call_id: callId };
  const updated = { ...existing, ...patch };
  cases.set(callId, updated);
  bus.emit(`update:${callId}`, updated);
  return updated;
}

function getCase(callId) {
  return cases.get(callId);
}

// Every other lookup here is by call_id; an inbound WhatsApp webhook only
// gives us the sender's phone number, so this is the one place that needs a
// reverse scan. Fine at booth-demo scale (a handful of concurrent cases,
// server/config.js maxConcurrency defaults to 5) — normalizes both sides to
// digits-only so "+918879185247" (how cases store it) matches "918879185247"
// (how WhatsApp's wa_id arrives, no leading +). Returns the MOST RECENT
// matching case if a number was reused across multiple demo runs, since
// that's almost certainly the one a real reply is about.
function findCaseByPhone(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  let best = null;
  for (const c of cases.values()) {
    const caseDigits = String(c.phone || '').replace(/[^0-9]/g, '');
    // Compare on the last 10 digits so a stored "+91XXXXXXXXXX" matches an
    // inbound "91XXXXXXXXXX" or a bare "XXXXXXXXXX" regardless of whichever
    // side does/doesn't carry the country code.
    if (caseDigits && caseDigits.slice(-10) === digits.slice(-10)) {
      if (!best || (c.createdAt || 0) >= (best.createdAt || 0)) best = c;
    }
  }
  return best;
}

// Webhook deliveries can be retried by Vobiz — dedupe by event_id so a retry
// never double-applies a trigger-word match. Capped so a long-running booth
// day doesn't grow this unboundedly.
const seenWebhookEventIds = new Set();
const MAX_SEEN_EVENT_IDS = 1000;
function isDuplicateWebhookEvent(eventId) {
  if (!eventId) return false; // no id to dedupe on — let it through rather than silently dropping everything
  if (seenWebhookEventIds.has(eventId)) return true;
  seenWebhookEventIds.add(eventId);
  if (seenWebhookEventIds.size > MAX_SEEN_EVENT_IDS) {
    seenWebhookEventIds.delete(seenWebhookEventIds.values().next().value);
  }
  return false;
}

function addEscalation(entry) {
  escalationQueue.push(entry);
  bus.emit('escalation', entry);
  return entry;
}

function listEscalations() {
  return escalationQueue;
}

module.exports = {
  bus, createCase, updateCase, getCase, addEscalation, listEscalations,
  findCaseByPhone, isDuplicateWebhookEvent,
};
