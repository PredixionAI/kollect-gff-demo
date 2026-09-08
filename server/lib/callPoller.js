const callProvider = require('./callProvider');
const callOutcome = require('./callOutcome');
const store = require('./store');

// Primary way this app learns a call's outcome — GET /calls/{call_id},
// confirmed working with just X-API-Key (2026-09-05). No public webhook
// tunnel or Voiz-Agents team registration needed. webhook.js is kept as a
// best-effort secondary path in case VOIZ ever pushes one, but nothing here
// depends on it.
//
// Two ways to drive it:
//   pollCall(id)  — a background setInterval. Right on a long-lived server
//                   (npm run dev / npm start).
//   refresh(id)   — one check, now. Right on serverless hosts (Vercel), where
//                   a function is frozen after it responds and timers die.
//                   routes/call.js calls this from GET /api/call/:id and the
//                   SSE stream, so the dashboard's own polling keeps the case
//                   fresh without any server-side timer surviving.
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'no_answer', 'cancelled']);
const POLL_INTERVAL_MS = 5000;
// PRD targets 35-70s per branch; 3 minutes is a generous safety cap so a
// stuck poll can't run forever.
const MAX_POLL_MS = 3 * 60 * 1000;

const lastChecked = new Map(); // callId -> ms timestamp of the last provider fetch

function isTerminal(record) {
  return Boolean(record && TERMINAL_STATUSES.has(record.status));
}

// One provider fetch. Returns the (possibly updated) case record, or null
// if the provider does not know the call. Throttled to POLL_INTERVAL_MS per
// call so a chatty client cannot hammer the provider.
async function refresh(callId, { force = false } = {}) {
  const existing = store.getCase(callId);
  if (isTerminal(existing)) return existing;

  const last = lastChecked.get(callId) || 0;
  if (!force && Date.now() - last < POLL_INTERVAL_MS) return existing || null;
  lastChecked.set(callId, Date.now());

  const { httpStatus, body } = await callProvider.getCallDetails(callId);
  if (httpStatus !== 200) return existing || null;

  // A cold serverless instance may not have the case in memory at all —
  // reconstruct the minimum from the provider so the dashboard still works.
  if (!existing) {
    store.createCase(callId, {
      name: body.customer_name || 'Unknown borrower',
      phone: body.phone || null,
      voiceId: null,
      status: isTerminal(body) ? body.status : 'initiated',
    });
  }

  if (isTerminal(body)) {
    return callOutcome.handleCallOutcome(callId, body);
  }
  return store.getCase(callId);
}

function pollCall(callId) {
  const startedAt = Date.now();

  const timer = setInterval(async () => {
    if (Date.now() - startedAt > MAX_POLL_MS) {
      console.warn(`[callPoller] giving up on ${callId} after ${MAX_POLL_MS}ms — never reached a terminal status`);
      clearInterval(timer);
      return;
    }
    try {
      const record = await refresh(callId, { force: true });
      if (isTerminal(record)) clearInterval(timer);
    } catch (err) {
      console.error(`[callPoller] error polling ${callId}`, err);
    }
  }, POLL_INTERVAL_MS);

  // Never keep a serverless instance alive just for this timer.
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = { pollCall, refresh, isTerminal, POLL_INTERVAL_MS };
