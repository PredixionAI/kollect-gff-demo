require('dotenv').config();

function required(name, fallbackOk) {
  const v = process.env[name];
  if (!v && !fallbackOk) {
    console.warn(`[config] ${name} is not set — related endpoints will fail until it is.`);
  }
  return v || '';
}

module.exports = {
  port: process.env.PORT || 3001,

  voiz: {
    baseUrl: required('VOIZ_BASE_URL'),
    apiKey: required('VOIZ_API_KEY'),
    webhookSecret: required('VOIZ_WEBHOOK_SECRET'),
    sipTrunkId: required('SIP_TRUNK_ID'),
    defaultAgentId: required('VOIZ_DEFAULT_AGENT_ID'),
    // Which VOIZ agent_id an orb dials. Neha (id 'priya') falls back to
    // VOIZ_DEFAULT_AGENT_ID since that's the one agent registered so far.
    // Add VOIZ_AGENT_ID_SWARA / _VIKRAM to .env as each new agent is
    // registered — no code change needed, the orb lights up ("active")
    // automatically once its env var is set (see routes/voices.js). Meera
    // and Ritu removed 2026-09-08 (user request, see voiceCatalog.js).
    agentIdsByVoice: {
      priya: process.env.VOIZ_AGENT_ID_PRIYA || process.env.VOIZ_DEFAULT_AGENT_ID || '',
      swara: process.env.VOIZ_AGENT_ID_SWARA || '',
      vikram: process.env.VOIZ_AGENT_ID_VIKRAM || '',
    },
  },

  // "Enhanced Quality" real-call routing (2026-09-08/09 user request) —
  // ElevenLabs Conversational AI as an alternative to VOIZ, opted into per
  // attendee. Dispatch, outcome polling, and outcome mapping are all real
  // and confirmed against the live API (2026-09-09) — see
  // server/lib/elevenLabsClient.js for the endpoint-correction history and
  // what's still unconfirmed (a genuinely ANSWERED call's exact shape).
  // Blank apiKey means the toggle is harmless: call.js falls back to VOIZ.
  //
  // Per-voice agent mapping, same pattern as voiz.agentIdsByVoice below —
  // each persona has its OWN ElevenLabs agent (they're different registered
  // agents, not one agent that switches voice). Only personas with a real
  // agent_id here are eligible for Enhanced Quality; call.js falls back to
  // VOIZ for any other voice selection even if the toggle is on.
  elevenLabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID || '',
    agentIdsByVoice: {
      // id 'priya' = Neha (see server/voiceCatalog.js) — "Collections Agent
      // - Live Demo", confirmed by user 2026-09-09. No hardcoded fallback
      // (unlike an earlier version of this file) — these real agent IDs
      // belong only in .env, not in tracked source, even though an agent ID
      // alone isn't a credential (see 2026-09-24 gitignore/secrets audit).
      priya: process.env.ELEVENLABS_AGENT_ID_PRIYA || '',
      vikram: process.env.ELEVENLABS_AGENT_ID_VIKRAM || '',
    },
  },

  // Sarvam ("Samvaad") voice agents — third real-call provider, added
  // 2026-09-24. Unlike VOIZ/ElevenLabs, Sarvam has no per-persona agent
  // catalog yet (only one agent has been deployed) — appId/appVersion below
  // apply to whichever voice is selected, until more agents get registered.
  // Blank config = silently skipped, same safe-by-default pattern as
  // elevenLabs above.
  sarvam: {
    apiKey: process.env.SARVAM_API_KEY || '',
    orgId: process.env.SARVAM_ORG_ID || '',
    workspaceId: process.env.SARVAM_WORKSPACE_ID || '',
    appId: process.env.SARVAM_APP_ID || '',
    appVersion: Number(process.env.SARVAM_APP_VERSION || 1),
    connectionId: process.env.SARVAM_CONNECTION_ID || '',
    agentPhoneNumber: process.env.SARVAM_AGENT_PHONE_NUMBER || '',
  },

  demo: {
    dueAmount: Number(process.env.DEMO_DUE_AMOUNT || 45000),
    dueDate: process.env.DEMO_DUE_DATE || '2026-09-05',
    maxConcurrency: Number(process.env.MAX_CONCURRENCY || 5),
  },

  // Post-call intelligence — real-call path only (see implementation_plan.md).
  // Blank key means analysis is silently skipped (geminiClient short-circuits
  // to `{status:'unavailable'}`); mock/simulated demo runs never touch this.
  gemini: {
    apiKey: required('GEMINI_API_KEY', true),
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },

  // GLM 5 via AWS Bedrock's OpenAI-compatible endpoint — tried FIRST for
  // post-call analysis when configured (server/lib/callOutcome.js
  // analyzeWithFallback), with Gemini above as the fallback. Blank key means
  // GLM is silently skipped and Gemini runs as before — see
  // server/lib/glmClient.js and docs/GLM5-Bedrock-API-Access-Documentation
  // (Aivar Innovations, issued 2026-09-07, expires 2026-10-07 — request a
  // renewed key before then or every request starts failing auth).
  glm: {
    apiKey: process.env.GLM_BEDROCK_API_KEY || '',
    baseUrl: process.env.GLM_BEDROCK_BASE_URL || 'https://bedrock-runtime.ap-south-1.amazonaws.com/openai/v1',
    model: process.env.GLM_MODEL || 'zai.glm-5',
  },

  telemetry: {
    // Set GOOGLE_SHEET_WEBHOOK_URL in .env to the Apps Script web-app URL.
    // When blank the Google Sheets push is simply skipped — local fallback
    // (server/data/sessions.json) always runs regardless.
    googleSheetWebhookUrl: process.env.GOOGLE_SHEET_WEBHOOK_URL || '',
  },

  whatsapp: {
    // Stays 'mock' until you flip it — real sends cost money per PRD §8,
    // and nobody should flip this without deliberately deciding to.
    mode: process.env.WHATSAPP_MODE || 'mock', // 'mock' | 'live'
    provider: process.env.WHATSAPP_PROVIDER || 'vobiz',
    authId: process.env.WHATSAPP_AUTH_ID || '',
    authToken: process.env.WHATSAPP_AUTH_TOKEN || '',
    channelId: process.env.WHATSAPP_CHANNEL_ID || '',
    wabaId: process.env.WHATSAPP_WABA_ID || '',
    // Escalation hand-off goes here, not to the borrower (PRD §7.1).
    humanAgentNumber: process.env.WHATSAPP_HUMAN_AGENT_NUMBER || '',
    // Secret for verifying inbound Vobiz webhook deliveries (message.inbound
    // / message.status / call.*) — returned once when you register a
    // subscription via POST https://api.vobiz.ai/api/v1/messaging/webhooks,
    // never re-shown after that. See server/routes/whatsappWebhook.js.
    webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET || '',
    // TEMPORARY, until the 3 templates are Meta-approved: send free-form
    // `text` instead of `type: "template"`. Only works for a recipient who
    // has already messaged in within 24h (open window) — this does NOT
    // work for a real booth attendee, who has never messaged the business.
    // Only useful for rehearsal with known numbers. Flip back to `true`
    // (or delete the env var) the moment templates are approved.
    useTemplates: process.env.WHATSAPP_USE_TEMPLATES !== 'false',
    // Rate limiting removed 2026-09-08 (explicit user request) — every real
    // send now goes out uncapped, including every escalation alert to the
    // human agent. There is no longer a safety net against a bug that loops
    // a send spending real money on Meta's per-conversation pricing; that
    // risk is accepted, not overlooked.
  },
};
