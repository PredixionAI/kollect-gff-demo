const fetch = require('node-fetch');
const config = require('../config');
const templates = require('../whatsappTemplates');
const rateLimit = require('./whatsappRateLimit');
const modeState = require('./whatsappModeState');

const VOBIZ_SEND_URL = 'https://api.vobiz.ai/api/v1/messaging/messages';

async function postToVobiz(payload) {
  const res = await fetch(VOBIZ_SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-ID': config.whatsapp.authId,
      'X-Auth-Token': config.whatsapp.authToken,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return {
    mode: 'live',
    httpStatus: res.status,
    to: payload.to,
    template: payload.template ? payload.template.name : null,
    voizMessageId: body.id || null,
    metaMessageId: body.meta_message_id || null,
    status: body.status || (res.ok ? 'pending' : 'failed'),
    sentAt: new Date().toISOString(),
    raw: body,
  };
}

// caseKey should be stable per real-world case (call_id or recipient phone),
// so the per-case cap actually limits a case, not a single message.
async function sendTemplate(templateKey, { to, caseKey, vars }) {
  const tpl = templates[templateKey];
  if (!tpl) throw new Error(`Unknown WhatsApp template key: ${templateKey}`);
  if (!to) throw new Error('sendTemplate requires "to"');

  const gate = rateLimit.checkAndConsume(caseKey || to);
  if (!gate.allowed) {
    console.warn(`[whatsapp] BLOCKED (${gate.reason}) — template=${templateKey} to=${to}`);
    return { status: 'blocked', reason: gate.reason, template: tpl.name, to };
  }

  // TEMPORARY fallback (config.whatsapp.useTemplates=false) while templates
  // await Meta approval: send the same content as free-form text instead.
  // Only reaches a real recipient if they've messaged in within 24h — this
  // is a rehearsal/known-number workaround, NOT usable for a real booth
  // attendee (who has never messaged the business). Switch back the moment
  // templates are approved: set WHATSAPP_USE_TEMPLATES=true (or remove it).
  if (!config.whatsapp.useTemplates) {
    const body = (vars && vars.message) || `[${tpl.name}] (no message text provided)`;
    if (modeState.getMode() !== 'live') {
      console.log(`[whatsapp:mock] (as text, templates pending) would send "${tpl.name}" to ${to}:`, body);
      return { mode: 'mock', to, template: tpl.name, asText: true, body, status: 'sent', sentAt: new Date().toISOString() };
    }
    const result = await postToVobiz({
      channel_id: config.whatsapp.channelId,
      waba_id: config.whatsapp.wabaId,
      to,
      type: 'text',
      text: { body },
    });
    return { ...result, template: tpl.name, asText: true };
  }

  const components = tpl.buildComponents(vars || {});

  if (modeState.getMode() !== 'live') {
    console.log(`[whatsapp:mock] would send "${tpl.name}" to ${to}:`, JSON.stringify(components));
    return {
      mode: 'mock',
      to,
      template: tpl.name,
      components,
      status: 'sent', // pretend delivery succeeded; UI treats this identically to a real send
      sentAt: new Date().toISOString(),
    };
  }

  return postToVobiz({
    channel_id: config.whatsapp.channelId,
    waba_id: config.whatsapp.wabaId,
    to,
    type: 'template',
    template: { name: tpl.name, language: { code: tpl.language }, components },
  });
}

// Free-form text — only usable when the recipient messaged in within the
// last 24h (WhatsApp's window rule; see docs/WHATSAPP_API_REFERENCE.md).
// NOT wired into the dashboard/booth UI on purpose — this exists solely for
// a manual, deliberate verification send before templates are approved.
async function sendText(to, body, caseKey) {
  if (!to) throw new Error('sendText requires "to"');
  if (!body) throw new Error('sendText requires "body"');

  const gate = rateLimit.checkAndConsume(caseKey || to);
  if (!gate.allowed) {
    console.warn(`[whatsapp] BLOCKED (${gate.reason}) — text send to=${to}`);
    return { status: 'blocked', reason: gate.reason, to };
  }

  if (modeState.getMode() !== 'live') {
    console.log(`[whatsapp:mock] would send text to ${to}:`, body);
    return { mode: 'mock', to, body, status: 'sent', sentAt: new Date().toISOString() };
  }

  return postToVobiz({
    channel_id: config.whatsapp.channelId,
    waba_id: config.whatsapp.wabaId,
    to,
    type: 'text',
    text: { body },
  });
}

// Thin wrapper kept for the existing webhook.js call site (real-outcome
// escalation, PRD §7.1, once Phase 0.5 branch scripts + real dispositions
// exist). Sends to the human agent, never the borrower.
async function sendHandoffMessage({ borrowerName, borrowerPhone, summary }) {
  return sendTemplate('escalation', {
    to: config.whatsapp.humanAgentNumber,
    caseKey: borrowerPhone,
    vars: { message: `Escalation: ${borrowerName}. ${summary} Contact: ${borrowerPhone}. Please follow up within 2 hours.` },
  });
}

module.exports = { sendTemplate, sendText, sendHandoffMessage, modeState };
