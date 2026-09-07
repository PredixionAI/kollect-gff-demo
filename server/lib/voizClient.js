const fetch = require('node-fetch');
const config = require('../config');

async function placeCall({ agentId, customerPhone, customerName, dueAmount, dueDate, sipId, customData }) {
  const targetAgentId = agentId || config.voiz.defaultAgentId;
  const url = `${config.voiz.baseUrl}/api/agents/${targetAgentId}/call`;

  let formattedPhone = (customerPhone || '').trim().replace(/[^0-9+]/g, '');
  if (formattedPhone && !formattedPhone.startsWith('+')) {
    formattedPhone = '+91' + formattedPhone;
  }

  const payload = {
    customer_phone: formattedPhone,
    sip_id: sipId || config.voiz.sipTrunkId || undefined,
    customer_data: {
      name: customerName || 'Valued Customer',
      customer_name: customerName || 'Valued Customer',
      due_amount: String(dueAmount !== undefined ? dueAmount : config.demo.dueAmount),
      due_date: String(dueDate || config.demo.dueDate),
      ...(customData || {}),
    },
  };

  console.log(`[voizClient] Posting to VOIZ API ${url}:`, JSON.stringify(payload, null, 2));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.voiz.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  console.log(`[voizClient] Response HTTP ${res.status}:`, JSON.stringify(body, null, 2));
  return { httpStatus: res.status, body, payloadSent: payload };
}

// GET /calls/{call_id} — confirmed real, works with X-API-Key, no webhook
// registration needed. Returns the full call record: status, transcript
// (transcript_data.messages[]), and outcome fields (escalation_flag,
// dispute_flag, ptp_flag, rtp_flag, call_success, customer_sentiment,
// next_best_action, etc.) — verified against a real completed call
// 2026-09-05. No single "disposition" enum field exists.
async function getCallDetails(callId) {
  const url = `${config.voiz.baseUrl}/calls/${callId}`;
  const res = await fetch(url, { headers: { 'X-API-Key': config.voiz.apiKey } });
  const body = await res.json().catch(() => ({}));
  return { httpStatus: res.status, body };
}

module.exports = { placeCall, getCallDetails };
