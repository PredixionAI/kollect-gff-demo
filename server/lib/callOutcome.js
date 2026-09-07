const store = require('./store');
const whatsapp = require('./whatsapp');

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

  return updated;
}

module.exports = { handleCallOutcome, ESCALATION_FLAGS };
