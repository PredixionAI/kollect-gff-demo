const fetch = require('node-fetch');
const config = require('../config');

// ElevenLabs Agents Platform client — same interface as voizClient
// (placeCall / getCallDetails) so callProvider can swap between them.
//
// Endpoints verified against the official docs 2026-09-07 (see
// docs/ELEVENLABS_API_REFERENCE.md) but NOT yet exercised against a live
// account — flip VOICE_PROVIDER=elevenlabs only after a real test call.
//
// Auth is an `xi-api-key` header. Outbound calls go through either
// POST /v1/convai/twilio/outbound-call or /v1/convai/sip-trunk/outbound-call
// depending on how the agent's phone number was imported
// (ELEVENLABS_TRANSPORT). Both take the same body and both return a
// conversation_id, which is this provider's "call_id".

function outboundCallUrl() {
  const transport = config.elevenlabs.transport === 'twilio' ? 'twilio' : 'sip-trunk';
  return `${config.elevenlabs.baseUrl}/v1/convai/${transport}/outbound-call`;
}

async function placeCall({ agentId, customerPhone, customerName, dueAmount, dueDate, customData }) {
  const targetAgentId = agentId || config.elevenlabs.defaultAgentId;

  let formattedPhone = (customerPhone || '').trim().replace(/[^0-9+]/g, '');
  if (formattedPhone && !formattedPhone.startsWith('+')) {
    formattedPhone = '+91' + formattedPhone;
  }

  const payload = {
    agent_id: targetAgentId,
    agent_phone_number_id: config.elevenlabs.phoneNumberId,
    to_number: formattedPhone,
    conversation_initiation_client_data: {
      // The agent's prompt/first message must reference these as
      // {{customer_name}} / {{due_amount}} / {{due_date}} — see
      // docs/ELEVENLABS_MIGRATION.md §2.
      dynamic_variables: {
        customer_name: customerName || 'Valued Customer',
        due_amount: String(dueAmount !== undefined ? dueAmount : config.demo.dueAmount),
        due_date: String(dueDate || config.demo.dueDate),
        ...(customData || {}),
      },
    },
  };

  const url = outboundCallUrl();
  console.log(`[elevenLabsClient] Posting to ${url}:`, JSON.stringify(payload, null, 2));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': config.elevenlabs.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.json().catch(() => ({}));
  console.log(`[elevenLabsClient] Response HTTP ${res.status}:`, JSON.stringify(raw, null, 2));

  // Normalized so routes/call.js can keep reading body.call_id regardless of
  // provider. ElevenLabs has no "202 queued" concurrency response like VOIZ —
  // a rejected call comes back as success:false / non-200.
  const body = {
    ...raw,
    call_id: raw.conversation_id || null,
  };
  const httpStatus = res.ok && raw.success === false ? 502 : res.status;
  return { httpStatus, body, payloadSent: payload };
}

// ElevenLabs conversation statuses: initiated | in-progress | processing |
// done | failed. "processing" means the call has ended but transcript/
// analysis are still being generated — deliberately mapped to a NON-terminal
// status so callPoller keeps polling until analysis is ready ("done").
function mapStatus(status) {
  if (status === 'done') return 'completed';
  if (status === 'failed') return 'failed';
  return status || 'in_progress';
}

function truthy(v) {
  return v === true || v === 'true' || v === 'True' || v === 'yes';
}

// Outcome flags come from the agent's Analysis → Data collection config —
// the agent must define items with these exact ids for the mapping to land
// (docs/ELEVENLABS_MIGRATION.md §3). Missing items simply come through
// undefined, same as VOIZ fields the platform didn't populate.
const DATA_COLLECTION_FLAGS = ['escalation_flag', 'dispute_flag', 'ptp_flag', 'rtp_flag'];
const DATA_COLLECTION_STRINGS = ['customer_sentiment', 'next_best_action', 'dispute_description'];

function mapArtifacts(conversation) {
  const analysis = conversation.analysis || {};
  const dcr = analysis.data_collection_results || {};
  const metadata = conversation.metadata || {};

  const artifacts = {
    call_end_reason: metadata.termination_reason,
    answered: conversation.status !== 'failed' && (metadata.call_duration_secs || 0) > 0,
    call_success: analysis.call_successful === 'success',
    // Post-processing (Gemini) can still enrich these, same as the VOIZ path.
    structured_outputs: {
      transcript_summary: analysis.transcript_summary,
      evaluation_criteria_results: analysis.evaluation_criteria_results,
      data_collection_results: dcr,
    },
    // Audio isn't a public URL — it's behind the API key. The dashboard only
    // displays this string, it never fetches it client-side.
    recording_url: conversation.has_audio
      ? `${config.elevenlabs.baseUrl}/v1/convai/conversations/${conversation.conversation_id}/audio`
      : undefined,
  };

  for (const key of DATA_COLLECTION_FLAGS) {
    if (dcr[key] !== undefined) artifacts[key] = truthy(dcr[key] && dcr[key].value);
  }
  for (const key of DATA_COLLECTION_STRINGS) {
    if (dcr[key] !== undefined) artifacts[key] = dcr[key] && dcr[key].value;
  }
  return artifacts;
}

// GET /v1/convai/conversations/{conversation_id} — normalized into the same
// record shape callOutcome.handleCallOutcome already consumes from VOIZ:
// { status, duration, phone, transcript.transcript_data.messages[], artifacts.* }
async function getCallDetails(conversationId) {
  const url = `${config.elevenlabs.baseUrl}/v1/convai/conversations/${conversationId}`;
  const res = await fetch(url, { headers: { 'xi-api-key': config.elevenlabs.apiKey } });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) return { httpStatus: res.status, body: raw };

  const transcript = Array.isArray(raw.transcript) ? raw.transcript : [];
  const messages = transcript
    .filter(t => t.message)
    .map(t => ({
      speaker: t.role === 'agent' ? 'agent' : 'customer',
      message: t.message,
    }));

  const metadata = raw.metadata || {};
  const phoneCall = metadata.phone_call || {};

  const body = {
    status: mapStatus(raw.status),
    duration: metadata.call_duration_secs,
    phone: phoneCall.external_number || phoneCall.to_number || undefined,
    transcript: { transcript_data: { messages } },
    artifacts: mapArtifacts(raw),
    raw,
  };
  return { httpStatus: res.status, body };
}

module.exports = { placeCall, getCallDetails };
