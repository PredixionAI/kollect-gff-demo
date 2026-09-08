const fetch = require('node-fetch');
const config = require('../config');

// "Enhanced Quality" real-call routing (2026-09-08/09 user request) —
// ElevenLabs Conversational AI as an alternative to VOIZ, opted into per
// attendee via the capture-screen checkbox or the dashboard's Enhanced
// Quality toggle (public/js/dashboard.js).
//
// Outbound-dispatch shape below is per the user's own reference (2026-09-09,
// not a platform doc this project independently verified) — same "confirm
// before trusting beyond a first smoke test" posture as every other
// integration here (VOIZ's auth header and Vobiz's webhook shape both
// turned out to differ from their own docs). Update this comment once a
// real call has actually gone out and the response shape is confirmed.
//
// Outcome/transcript retrieval — GET /v1/convai/conversations/{id}, per
// user reference 2026-09-09. Response shape (status field name, transcript
// structure) is still unconfirmed against a real conversation; getConversation
// below returns the raw body untouched so a caller can inspect it the first
// time this actually runs, rather than this file guessing a shape and
// silently reading the wrong field (VOIZ's own artifacts.* nesting bit this
// project once already — see docs/VOIZ_API_REFERENCE.md).
//
// There is also no ElevenLabs-side poller wired up yet (the equivalent of
// server/lib/callPoller.js) — placeCall below dispatches the call, but
// nothing currently calls getConversation on a schedule to learn when it's
// done. Do not treat a 2xx from placeCall as "the whole pipeline works" —
// it only confirms the call was dispatched.
const TIMEOUT_MS = 8000;
// Path history (2026-09-09), each step verified against the real API with
// a fake destination number so nothing ever actually dialed:
//   /v1/convai/phone-numbers/outbound-call -> 405 Method Not Allowed
//     (path doesn't exist at all — user's first reference was wrong)
//   /v1/convai/twilio/outbound-call -> 400 "not a Twilio number"
//     (real endpoint, but ELEVENLABS_PHONE_NUMBER_ID is a SIP trunk
//     number, not a Twilio-provisioned one)
//   /v1/convai/sip-trunk/outbound-call -> this one, confirmed against
//     ElevenLabs' own public docs for SIP-trunk numbers specifically.
// Response shape per those same docs: { success, message, conversation_id,
// sip_call_id } — conversation_id is what getConversation below polls with.
const OUTBOUND_CALL_URL = 'https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call';
const CONVERSATIONS_URL = 'https://api.elevenlabs.io/v1/convai/conversations';

async function placeCall({ agentId, customerPhone, customerName }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const payload = {
    agent_id: agentId,
    agent_phone_number_id: config.elevenLabs.phoneNumberId,
    to_number: customerPhone,
    conversation_initiation_client_data: {
      dynamic_variables: {
        customer_name: customerName || 'Valued Customer',
        mobile_number: customerPhone,
      },
    },
  };

  console.log(`[elevenLabsClient] Posting to ElevenLabs API ${OUTBOUND_CALL_URL}:`, JSON.stringify(payload, null, 2));

  try {
    const res = await fetch(OUTBOUND_CALL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': config.elevenLabs.apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const body = await res.json().catch(() => ({}));
    console.log(`[elevenLabsClient] Response HTTP ${res.status}:`, JSON.stringify(body, null, 2));

    // Response field name for the call/conversation id is UNCONFIRMED —
    // trying the plausible candidates rather than assuming one. Logged raw
    // above regardless, so the real shape is visible in server logs the
    // first time this actually runs.
    const callId = body.conversation_id || body.call_sid || body.callSid || body.id || null;

    return { httpStatus: res.status, body: { ...body, call_id: callId }, payloadSent: payload };
  } catch (err) {
    clearTimeout(timer);
    const reason = err.name === 'AbortError' ? 'timeout' : 'network_error';
    console.error(`[elevenLabsClient] ${reason}:`, err.message);
    return { httpStatus: 502, body: { error: reason }, payloadSent: payload };
  }
}

// GET /v1/convai/conversations/{conversation_id} — per user reference
// 2026-09-09. Returns the raw body as-is (see comment above) — callers must
// inspect `body` themselves until the real shape is confirmed.
async function getConversation(conversationId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = `${CONVERSATIONS_URL}/${conversationId}`;

  try {
    const res = await fetch(url, {
      headers: { 'xi-api-key': config.elevenLabs.apiKey },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await res.json().catch(() => ({}));
    console.log(`[elevenLabsClient] GET ${url} -> HTTP ${res.status}:`, JSON.stringify(body, null, 2));
    return { httpStatus: res.status, body };
  } catch (err) {
    clearTimeout(timer);
    const reason = err.name === 'AbortError' ? 'timeout' : 'network_error';
    console.error(`[elevenLabsClient] getConversation ${reason}:`, err.message);
    return { httpStatus: 502, body: { error: reason } };
  }
}

module.exports = { placeCall, getConversation };
