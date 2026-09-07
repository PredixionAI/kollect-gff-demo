const express = require('express');
const config = require('../config');
const whatsapp = require('../lib/whatsapp');
const store = require('../lib/store');

const router = express.Router();

// In-call agent tool endpoints — the "seamless WhatsApp" path.
//
// The ElevenLabs agent is configured with webhook (server) tools pointing at
// these routes (docs/ELEVENLABS_MIGRATION.md §4), so the VOICE AGENT ITSELF
// decides mid-conversation when to fire a WhatsApp — "I'm sending you the
// plan on WhatsApp right now" actually sends it in that moment — instead of
// the dashboard's scripted timeline being the only trigger. The scripted
// timeline path (routes/whatsapp.js) still exists untouched; mock/simulated
// runs keep using it.
//
// Everything funnels through the existing lib/whatsapp.js, so mock mode and
// the per-minute/per-case/per-day rate limiter apply exactly as they do
// everywhere else — a runaway agent tool-call loop cannot spend more than
// the same caps allow.
//
// Trust boundary: these endpoints are meant to be reached from ElevenLabs'
// servers, which means they must be exposed publicly (tunnel in dev). They
// are protected by a shared secret header the agent tool config sends
// (X-Tool-Secret, stored as an ElevenLabs workspace secret). With no secret
// configured they still work — for local rehearsal — but log a loud warning.
// The borrower recipient is resolved SERVER-SIDE from the conversation's
// case record, never from the tool-call body, so a prompt-injected agent
// can't redirect messages to an arbitrary number; escalation always goes to
// WHATSAPP_HUMAN_AGENT_NUMBER, same rule as routes/whatsapp.js.

let warnedNoSecret = false;
function checkToolSecret(req, res, next) {
  const secret = config.elevenlabs.toolSecret;
  if (!secret) {
    if (!warnedNoSecret) {
      console.warn('[agentTools] ELEVENLABS_TOOL_SECRET is not set — tool endpoints are UNAUTHENTICATED. Fine on localhost, never expose a tunnel like this.');
      warnedNoSecret = true;
    }
    return next();
  }
  if (req.get('X-Tool-Secret') === secret) return next();
  return res.status(401).json({ error: 'bad or missing X-Tool-Secret' });
}

// Attach the send to the case so the dashboard's existing SSE stream
// (GET /api/call/:id/events) shows the agent-triggered WhatsApp live.
function recordSendOnCase(callId, entry) {
  if (!callId) return;
  const existing = store.getCase(callId);
  if (!existing) return;
  const sends = Array.isArray(existing.agentWhatsappSends) ? existing.agentWhatsappSends : [];
  store.updateCase(callId, { agentWhatsappSends: [...sends, entry] });
}

// POST /api/agent-tools/whatsapp
// Body (populated by the agent's LLM per the tool schema):
//   conversation_id  — injected via the {{system__conversation_id}} dynamic
//                      variable so the send lands on the right case
//   template         — 'paymentReminder' | 'followup'
//   message          — the exact text the agent just promised on the call
router.post('/agent-tools/whatsapp', checkToolSecret, async (req, res) => {
  const { conversation_id: conversationId, template, message } = req.body || {};
  const templateKey = template === 'followup' ? 'followup' : 'paymentReminder';
  if (!message) return res.status(400).json({ error: 'message is required' });

  const caseRecord = (conversationId && store.getCase(conversationId)) || null;
  if (!caseRecord || !caseRecord.phone) {
    // Result text is what the LLM gets back to work with — keep it speakable.
    return res.status(404).json({
      status: 'failed',
      result: 'No borrower phone number is on file for this call, so no WhatsApp was sent. Do not promise a WhatsApp message.',
    });
  }

  try {
    const sendResult = await whatsapp.sendTemplate(templateKey, {
      to: caseRecord.phone,
      caseKey: caseRecord.phone,
      vars: { message },
    });

    const entry = { templateKey, ...sendResult, trigger: 'agent_tool' };
    recordSendOnCase(conversationId, entry);

    if (sendResult.status === 'blocked') {
      return res.json({ status: 'blocked', result: 'WhatsApp send limit reached for this case — tell the borrower the message will follow shortly instead of resending.' });
    }
    return res.json({ status: 'sent', mode: sendResult.mode, result: 'WhatsApp message sent to the borrower just now. You can confirm it is on its way.' });
  } catch (err) {
    console.error('[agentTools] whatsapp send failed', err);
    return res.status(502).json({ status: 'failed', result: 'The WhatsApp message could not be sent. Apologise and continue the call without it.' });
  }
});

// POST /api/agent-tools/escalate
// Fires the human hand-off DURING the call (the post-call escalation in
// lib/callOutcome.js still runs off the final flags — this one is for when
// the agent needs a human looped in immediately).
router.post('/agent-tools/escalate', checkToolSecret, async (req, res) => {
  const { conversation_id: conversationId, reason } = req.body || {};
  const caseRecord = (conversationId && store.getCase(conversationId)) || {};
  const borrowerName = caseRecord.name || 'Unknown borrower';
  const borrowerPhone = caseRecord.phone || 'unknown';
  const summary = reason || 'Escalation requested by the voice agent mid-call.';

  try {
    const whatsappResult = await whatsapp.sendHandoffMessage({ borrowerName, borrowerPhone, summary });
    store.addEscalation({
      call_id: conversationId || null,
      name: borrowerName,
      phone: borrowerPhone,
      escalation_flag: true,
      dispute_flag: false,
      summary,
      whatsapp: whatsappResult,
      trigger: 'agent_tool',
      createdAt: new Date().toISOString(),
    });
    recordSendOnCase(conversationId, { templateKey: 'escalation', ...whatsappResult, trigger: 'agent_tool' });
    return res.json({ status: 'escalated', result: 'A human agent has been notified on WhatsApp and will follow up within 2 hours. Tell the borrower that.' });
  } catch (err) {
    console.error('[agentTools] escalate failed', err);
    return res.status(502).json({ status: 'failed', result: 'Escalation notification failed — reassure the borrower a supervisor will call back.' });
  }
});

// Cheap reachability probe for wiring up the tunnel + tool config.
router.get('/agent-tools/health', (req, res) => {
  res.json({ ok: true, provider: config.voiceProvider, whatsappMode: whatsapp.modeState.getMode(), secured: Boolean(config.elevenlabs.toolSecret) });
});

module.exports = router;
