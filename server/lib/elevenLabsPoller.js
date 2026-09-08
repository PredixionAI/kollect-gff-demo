const elevenLabsClient = require('./elevenLabsClient');
const callOutcome = require('./callOutcome');

// ElevenLabs equivalent of callPoller.js — polls GET /v1/convai/conversations/
// {id} until it looks terminal, then hands off to handleElevenLabsOutcome.
//
// Terminal-status detection is a best-effort allowlist, not confirmed
// against every real value ElevenLabs can return — the only real response
// inspected so far (2026-09-09) had status:"failed" for a call that never
// connected at the SIP level. Anything NOT in IN_PROGRESS_STATUSES is
// treated as terminal, which is the safer direction to be wrong in: an
// unanticipated "still going" value getting treated as done just means
// this fires one poll tick early, versus polling forever on a genuinely
// terminal status this list didn't anticipate.
const IN_PROGRESS_STATUSES = new Set(['initiated', 'in-progress', 'processing', 'ringing', 'queued']);
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_MS = 3 * 60 * 1000;

function pollConversation(callId) {
  const startedAt = Date.now();

  const timer = setInterval(async () => {
    if (Date.now() - startedAt > MAX_POLL_MS) {
      console.warn(`[elevenLabsPoller] giving up on ${callId} after ${MAX_POLL_MS}ms — never reached a terminal status`);
      clearInterval(timer);
      return;
    }

    try {
      const { httpStatus, body } = await elevenLabsClient.getConversation(callId);
      // A brand-new conversation can 404 for a moment before ElevenLabs has
      // indexed it — treat as transient, not terminal, same as callPoller.js
      // does for a non-200 from VOIZ.
      if (httpStatus !== 200) return;

      if (!IN_PROGRESS_STATUSES.has(body.status)) {
        clearInterval(timer);
        await callOutcome.handleElevenLabsOutcome(callId, body);
      }
    } catch (err) {
      console.error(`[elevenLabsPoller] error polling ${callId}`, err);
    }
  }, POLL_INTERVAL_MS);

  return timer;
}

module.exports = { pollConversation };
