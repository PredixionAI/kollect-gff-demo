const callProvider = require('./callProvider');
const callOutcome = require('./callOutcome');

// Primary way this app learns a call's outcome — GET /calls/{call_id},
// confirmed working with just X-API-Key (2026-09-05). No public webhook
// tunnel or Voiz-Agents team registration needed. webhook.js is kept as a
// best-effort secondary path in case VOIZ ever pushes one, but nothing here
// depends on it.
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'no_answer', 'cancelled']);
const POLL_INTERVAL_MS = 5000;
// PRD targets 35-70s per branch; 3 minutes is a generous safety cap so a
// stuck poll can't run forever.
const MAX_POLL_MS = 3 * 60 * 1000;

function pollCall(callId) {
  const startedAt = Date.now();

  const timer = setInterval(async () => {
    if (Date.now() - startedAt > MAX_POLL_MS) {
      console.warn(`[callPoller] giving up on ${callId} after ${MAX_POLL_MS}ms — never reached a terminal status`);
      clearInterval(timer);
      return;
    }

    try {
      const { httpStatus, body } = await callProvider.getCallDetails(callId);
      if (httpStatus !== 200) return; // transient — keep polling

      if (TERMINAL_STATUSES.has(body.status)) {
        clearInterval(timer);
        await callOutcome.handleCallOutcome(callId, body);
      }
    } catch (err) {
      console.error(`[callPoller] error polling ${callId}`, err);
    }
  }, POLL_INTERVAL_MS);

  return timer;
}

module.exports = { pollCall };
