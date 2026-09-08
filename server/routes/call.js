const express = require('express');
const config = require('../config');
const voizClient = require('../lib/voizClient');
const store = require('../lib/store');
const callPoller = require('../lib/callPoller');

const router = express.Router();

// Standard call endpoint (used by dashboard workflow). Which VOIZ agent gets
// dialed is resolved here from the orb the attendee picked — the client only
// ever sends voiceId, never an agent_id, so it can't be spoofed into calling
// a different agent than the one it displayed.
router.post('/call', async (req, res) => {
  const { name, phone, voiceId, lang, firstMessage, archetypeId, overdueDays } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ error: 'name and phone are required' });
  }

  let formattedPhone = phone.replace(/[^0-9+]/g, '');
  if (!formattedPhone.startsWith('+')) formattedPhone = '+91' + formattedPhone;

  const targetAgentId = (voiceId && config.voiz.agentIdsByVoice[voiceId]) || config.voiz.defaultAgentId;
  if (!targetAgentId) {
    return res.status(500).json({ error: 'No VOIZ agent configured for this voice, and no VOIZ_DEFAULT_AGENT_ID fallback set' });
  }

  try {
    const { httpStatus, body, payloadSent } = await voizClient.placeCall({
      agentId: targetAgentId,
      customerPhone: formattedPhone,
      customerName: name,
      dueAmount: config.demo.dueAmount,
      dueDate: config.demo.dueDate,
      // Extra context beyond the 3 variables VOIZ_API_REFERENCE.md confirms
      // the registered agent's own prompt actually consumes
      // (customer_name/due_amount/due_date) — VOIZ tolerates unknown keys
      // in customer_data without erroring, but tolerating isn't the same as
      // the live agent actually saying anything different because of them.
      // This is forwarded so it's ready the moment the registered agent's
      // prompt template is updated to reference {archetype}/{overdue_days};
      // until then it has NO effect on what the agent actually says on the
      // call (2026-09-08 user request — see chat for the full explanation
      // of why this is a VOIZ-agent-registration limitation, not a bug
      // fixable from this codebase alone).
      customData: {
        archetype: archetypeId || undefined,
        overdue_days: overdueDays !== undefined && overdueDays !== null ? String(overdueDays) : undefined,
      },
    });

    if (httpStatus !== 200 && httpStatus !== 202) {
      return res.status(httpStatus || 502).json({ error: 'VOIZ call dispatch failed', voizStatus: httpStatus, body, payloadSent });
    }

    const callId = body.call_id || `unknown-${Date.now()}`;
    store.createCase(callId, {
      name,
      phone: formattedPhone,
      voiceId: voiceId || null,
      lang: lang || null, // threaded through to geminiClient so its output matches the demo's language mix
      firstMessage: firstMessage || null, // the actual first WhatsApp text already sent — grounds the no-answer follow-up (server/lib/callOutcome.js) if this call goes unanswered
      status: httpStatus === 200 ? 'initiated' : 'queued',
      room_name: body.room_name || null,
    });
    callPoller.pollCall(callId);

    res.status(httpStatus).json({ call_id: callId, status: httpStatus === 200 ? 'initiated' : 'queued', voizResponse: body, payloadSent });
  } catch (err) {
    console.error('[call] dispatch error', err);
    res.status(502).json({ error: 'Could not reach VOIZ', detail: String(err) });
  }
});

// Direct Trigger Call Endpoint (Captures full custom form data just like VOIZ platform UI)
router.post('/call-direct', async (req, res) => {
  const { agentId, customerPhone, customerName, dueAmount, dueDate, sipId, customData } = req.body || {};

  if (!customerPhone) {
    return res.status(400).json({ error: 'customerPhone is required' });
  }

  try {
    const { httpStatus, body, payloadSent } = await voizClient.placeCall({
      agentId: agentId || config.voiz.defaultAgentId,
      customerPhone,
      customerName: customerName || 'Vatsal',
      dueAmount: dueAmount !== undefined ? dueAmount : config.demo.dueAmount,
      dueDate: dueDate || config.demo.dueDate,
      sipId: sipId || config.voiz.sipTrunkId,
      customData,
    });

    const callId = body.call_id || `call_${Date.now()}`;
    store.createCase(callId, {
      name: customerName || 'Vatsal',
      phone: payloadSent.customer_phone,
      voiceId: null,
      status: body.status || (httpStatus === 200 ? 'initiated' : 'failed'),
      room_name: body.room_name || null,
    });
    callPoller.pollCall(callId);

    res.status(httpStatus).json({
      httpStatus,
      call_id: callId,
      status: body.status || 'initiated',
      voizResponse: body,
      payloadSent,
    });
  } catch (err) {
    console.error('[call-direct] error', err);
    res.status(502).json({ error: 'Failed to trigger call via VOIZ API', detail: String(err) });
  }
});

router.get('/call/:callId', (req, res) => {
  const record = store.getCase(req.params.callId);
  if (!record) return res.status(404).json({ error: 'unknown call_id' });
  res.json(record);
});

// SSE stream so the dashboard can watch a case update live without polling.
router.get('/call/:callId/events', (req, res) => {
  const { callId } = req.params;
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const current = store.getCase(callId);
  if (current) send(current);

  const onUpdate = (updated) => send(updated);
  store.bus.on(`update:${callId}`, onUpdate);

  req.on('close', () => {
    store.bus.off(`update:${callId}`, onUpdate);
  });
});

module.exports = router;
