const store = require('./store');
const whatsapp = require('./whatsapp');
const geminiClient = require('./geminiClient');
const config = require('../config');

// Confirmed real fields via GET /calls/{call_id} (2026-09-05) — there is no
// single "disposition" enum as the platform guide's example implied. VOIZ
// uses separate boolean flags instead. Either one triggers escalation.
const ESCALATION_FLAGS = ['escalation_flag', 'dispute_flag'];

function flattenTranscript(record) {
  const messages = record.transcript
    && record.transcript.transcript_data
    && record.transcript.transcript_data.messages;
  if (!Array.isArray(messages)) return null;
  return messages.map(m => `${m.speaker}: ${m.message}`).join('\n');
}

// Called once a call reaches a terminal status, whether learned by polling
// GET /calls/{call_id} (primary path) or, best-effort, by an inbound
// webhook (secondary — payload shape unverified, see webhook.js).
//
// NOTE: every outcome field (escalation_flag, dispute_flag, call_success,
// customer_sentiment, etc.) lives under `record.artifacts.*`, NOT at the
// top level — confirmed against a real call 2026-09-05 after an earlier
// version of this function read the wrong (top-level) path and silently
// got `undefined` for all of them.
async function handleCallOutcome(callId, record) {
  const existing = store.getCase(callId) || {};
  const transcriptText = flattenTranscript(record);
  const a = record.artifacts || {};

  const updated = store.updateCase(callId, {
    status: 'completed',
    call_end_reason: a.call_end_reason,
    answered: a.answered,
    duration: record.duration,
    transcript: transcriptText,
    recording_url: a.recording_url,
    ptp_flag: a.ptp_flag,
    rtp_flag: a.rtp_flag,
    dispute_flag: a.dispute_flag,
    escalation_flag: a.escalation_flag,
    call_success: a.call_success,
    customer_sentiment: a.customer_sentiment,
    next_best_action: a.next_best_action,
    dispute_description: a.dispute_description,
    structured_outputs: a.structured_outputs,
  });

  const shouldEscalate = ESCALATION_FLAGS.some(flag => a[flag] === true);
  if (shouldEscalate) {
    const summary = a.dispute_description
      || (transcriptText ? transcriptText.slice(0, 160) : 'Escalation triggered, no transcript available');
    const borrowerPhone = record.phone || existing.phone || 'unknown';
    const borrowerName = existing.name || record.customer_name || 'Unknown borrower';

    const whatsappResult = await whatsapp.sendHandoffMessage({
      borrowerName,
      borrowerPhone,
      summary,
    });

    store.addEscalation({
      call_id: callId,
      name: borrowerName,
      phone: borrowerPhone,
      escalation_flag: a.escalation_flag,
      dispute_flag: a.dispute_flag,
      summary,
      whatsapp: whatsappResult,
      createdAt: new Date().toISOString(),
    });
  }

  // Post-call intelligence — fire-and-forget, does NOT block this function's
  // return. The real transcript/duration/answered fields above have already
  // rendered on the dashboard by the time this resolves. Streamed: each
  // field (sentiment, summary, NBA, dispute flag, WhatsApp copy) lands as
  // its own store.updateCase the instant it finishes generating — on a long
  // transcript that's the difference between one long silent wait and the
  // dashboard visibly filling in field by field. Every patch re-emits over
  // the same SSE bus the real completion event already used.
  //
  // Always called, even with no API key or no transcript — geminiClient
  // resolves those to {status:'unavailable', reason:...} almost instantly.
  // Skipping the call entirely in that case (an earlier version of this did)
  // meant geminiAnalysis never landed at all, so the dashboard's pending
  // badge sat there for the full client-side ceiling before silently giving
  // up instead of clearing right away.
  // Unanswered/declined/voicemail/cancelled — no transcript exists, and
  // this must NOT quietly fall through to the scripted happy-path follow-up
  // (which assumes the borrower engaged). Route to the dedicated no-answer
  // prompt instead, grounded in the fact that nothing was said and in the
  // one real message already sent (so the second message reads as a
  // continuation of an actual thread, not a restart). a.answered === true
  // is the only case that gets the transcript-analysis path; anything else
  // (false, or missing/undefined on a genuinely weird terminal status)
  // gets the no-answer path.
  // hasTranscript gates the dashboard's Next Best Action pointer (see
  // dashboard.js renderGeminiAnalysis): a genuine transcript can justify
  // replacing the templated NBA with the AI's own read; a call that was
  // never answered has no real conversation to reason from, so its NBA
  // must stay the templated one even though sentiment/summary/WhatsApp
  // copy from the no-answer prompt are still shown (they're honest about
  // "no reply happened", not a fabricated recommendation).
  const runningAnalysis = { status: 'streaming', hasTranscript: a.answered === true };
  const analysisPromise = a.answered === true
    ? geminiClient.analyzeCallTranscriptStreaming({
        transcript: transcriptText,
        borrowerName: existing.name || record.customer_name,
        language: existing.lang,
        dueAmount: existing.dueAmount || config.demo.dueAmount,
        dueDate: existing.dueDate || config.demo.dueDate,
        callDurationSeconds: record.duration,
        answered: a.answered,
      }, (partial) => {
        Object.assign(runningAnalysis, partial);
        store.updateCase(callId, { geminiAnalysis: { ...runningAnalysis } });
      })
    : geminiClient.analyzeNoAnswerStreaming({
        borrowerName: existing.name || record.customer_name,
        language: existing.lang,
        dueAmount: existing.dueAmount || config.demo.dueAmount,
        dueDate: existing.dueDate || config.demo.dueDate,
        firstMessageText: existing.firstMessage,
        callEndReason: a.call_end_reason,
      }, (partial) => {
        Object.assign(runningAnalysis, partial);
        store.updateCase(callId, { geminiAnalysis: { ...runningAnalysis } });
      });

  analysisPromise.then(finalAnalysis => {
    // finalAnalysis is a fresh object from geminiClient (status/fields/
    // latencyMs) — it doesn't carry hasTranscript, which only exists on
    // runningAnalysis above, so it has to be merged back in explicitly or
    // the terminal 'ready' write would silently drop it after the streaming
    // partials (which do carry it) already set the frontend's expectation.
    store.updateCase(callId, { geminiAnalysis: { hasTranscript: runningAnalysis.hasTranscript, ...finalAnalysis } });
  }).catch(err => {
    console.error(`[callOutcome] gemini analysis threw for ${callId}`, err);
    store.updateCase(callId, { geminiAnalysis: { status: 'unavailable', reason: 'threw' } });
  });

  return updated;
}

module.exports = { handleCallOutcome, ESCALATION_FLAGS };
