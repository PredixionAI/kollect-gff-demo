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
    // Add VOIZ_AGENT_ID_SWARA / _MEERA / _VIKRAM / _RITU to .env as each new
    // agent is registered — no code change needed, the orb lights up
    // ("active") automatically once its env var is set (see routes/voices.js).
    agentIdsByVoice: {
      priya: process.env.VOIZ_AGENT_ID_PRIYA || process.env.VOIZ_DEFAULT_AGENT_ID || '',
      swara: process.env.VOIZ_AGENT_ID_SWARA || '',
      meera: process.env.VOIZ_AGENT_ID_MEERA || '',
      vikram: process.env.VOIZ_AGENT_ID_VIKRAM || '',
      ritu: process.env.VOIZ_AGENT_ID_RITU || '',
    },
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
    // TEMPORARY, until the 3 templates are Meta-approved: send free-form
    // `text` instead of `type: "template"`. Only works for a recipient who
    // has already messaged in within 24h (open window) — this does NOT
    // work for a real booth attendee, who has never messaged the business.
    // Only useful for rehearsal with known numbers. Flip back to `true`
    // (or delete the env var) the moment templates are approved.
    useTemplates: process.env.WHATSAPP_USE_TEMPLATES !== 'false',
    // Strict caps — a bug that loops this WILL spend real money on Meta's
    // per-conversation pricing. Deliberately conservative; raise only if
    // rehearsal actually needs more.
    maxPerMinute: Number(process.env.WHATSAPP_MAX_PER_MINUTE || 5),
    maxPerCase: Number(process.env.WHATSAPP_MAX_PER_CASE || 3),
    maxPerDay: Number(process.env.WHATSAPP_MAX_PER_DAY || 30),
  },
};
