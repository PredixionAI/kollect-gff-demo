const express = require('express');
const config = require('../config');
const callProvider = require('../lib/callProvider');
const store = require('../lib/store');
const callPoller = require('../lib/callPoller');

const router = express.Router();

// Standard call endpoint (used by dashboard workflow). Which VOIZ agent gets
// dialed is resolved here from the orb the attendee picked — the client only
// ever sends voiceId, never an agent_id, so it can't be spoofed into calling
// a different agent than the one it displayed.
router.post('/call', async (req, res) => {
  const { name, phone, voiceId, lang } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ error: 'name and phone are required' });
  }

  let formattedPhone = phone.replace(/[^0-9+]/g, '');
  if (!formattedPhone.startsWith('+')) formattedPhone = '+91' + formattedPhone;

  const targetAgentId = callProvider.agentIdForVoice(voiceId);
  if (!targetAgentId) {
    return res.status(500).json({ error: 'No agent is configured for this voice yet' });
  }

  try {
    const { httpStatus, body, payloadSent } = await callProvider.placeCall({
      agentId: targetAgentId,
      customerPhone: formattedPhone,
      customerName: name,
      dueAmount: config.demo.dueAmount,
      dueDate: config.demo.dueDate,
    });

    if (httpStatus !== 200 && httpStatus !== 202) {
      return res.status(httpStatus || 502).json({ error: 'The call could not be placed', providerStatus: httpStatus, body, payloadSent });
    }

    const callId = body.call_id || `unknown-${Date.now()}`;
    store.createCase(callId, {
      name,
      phone: formattedPhone,
      voiceId: voiceId || null,
      lang: lang || null, // threaded through to geminiClient so its output matches the demo's language mix
      status: httpStatus === 200 ? 'initiated' : 'queued',
      room_name: body.room_name || null,
    });
    callPoller.pollCall(callId);

    res.status(httpStatus).json({ call_id: callId, status: httpStatus === 200 ? 'initiated' : 'queued', voizResponse: body, payloadSent });
  } catch (err) {
    console.error('[call] dispatch error', err);
    res.status(502).json({ error: 'The call service is unreachable', detail: String(err) });
  }
});

// Direct Trigger Call Endpoint (Captures full custom form data just like VOIZ platform UI)
router.post('/call-direct', async (req, res) => {
  const { agentId, customerPhone, customerName, dueAmount, dueDate, sipId, customData } = req.body || {};

  if (!customerPhone) {
    return res.status(400).json({ error: 'customerPhone is required' });
  }

  try {
    const { httpStatus, body, payloadSent } = await callProvider.placeCall({
      agentId: agentId || callProvider.defaultAgentId(),
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
      // VOIZ payloads carry customer_phone, ElevenLabs payloads to_number.
      phone: payloadSent.customer_phone || payloadSent.to_number,
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
    res.status(502).json({ error: 'The call could not be dispatched', detail: String(err) });
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
