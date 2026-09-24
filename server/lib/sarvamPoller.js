const sarvamClient = require('./sarvamClient');
const callOutcome = require('./callOutcome');

// Sarvam equivalent of callPoller.js / elevenLabsPoller.js — polls the
// attempts endpoint until connectivity_status stops being null (per the
// campaigns webhook payload doc, connectivity_status is one of connected/
// busy/no_answer/failed/null while a call is still in progress), then fetches
// the transcript and hands off to handleSarvamOutcome.
//
// MAX_POLL_MS matches ElevenLabs' 6-minute cap (bumped 2026-09-19 after a
// real ElevenLabs call's post-call processing phase outlasted 3 minutes) —
// Sarvam's own post-call processing latency is unconfirmed, so starting
// from the same learned value rather than the original (too-short) 3
// minutes both providers started with.
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_MS = 6 * 60 * 1000;

function pollAttempt(callId) {
  const startedAt = Date.now();

  const timer = setInterval(async () => {
    if (Date.now() - startedAt > MAX_POLL_MS) {
      console.warn(`[sarvamPoller] giving up on ${callId} after ${MAX_POLL_MS}ms — never reached a terminal status`);
      clearInterval(timer);
      return;
    }

    try {
      const { httpStatus, attempt } = await sarvamClient.getAttempt(callId);
      if (httpStatus !== 200 || !attempt) return; // transient/not-yet-indexed, same posture as the other pollers

      if (attempt.connectivity_status !== null && attempt.connectivity_status !== undefined) {
        clearInterval(timer);
        await callOutcome.handleSarvamOutcome(callId, attempt);
      }
    } catch (err) {
      console.error(`[sarvamPoller] error polling ${callId}`, err);
    }
  }, POLL_INTERVAL_MS);

  return timer;
}

module.exports = { pollAttempt };
