const express = require('express');
const config = require('../config');
const store = require('../lib/store');
const { verifyVobizSignature } = require('../lib/verifySignature');

const router = express.Router();

// Real inbound WhatsApp replies from a borrower, e.g. "SPLIT" confirming the
// Systemic archetype's 2-installment offer — see public/js/dashboard.js
// personaPacks().systemic.w2Lines for the exact prompt this responds to.
// Extend this list to add more trigger words; matching is case-insensitive,
// whole-word, and the first match wins.
const TRIGGER_WORDS = [
  { pattern: /\bsplit\b/i, label: 'SPLIT — plan accepted' },
];

function matchTrigger(text) {
  if (!text) return null;
  const hit = TRIGGER_WORDS.find(t => t.pattern.test(text));
  return hit ? hit.label : null;
}

// Vobiz's outbound webhook — three event types share this one endpoint
// (message.inbound / message.status / call.<event>), routed on
// X-Webhook-Event / payload.event_type. Only message.inbound does anything
// right now; the others are acknowledged (200) but not yet acted on.
// See docs/WHATSAPP_API_REFERENCE.md for the registration call and the
// exact envelope/signature scheme this implements.
router.post('/webhooks/vobiz', (req, res) => {
  if (!config.whatsapp.webhookSecret) {
    console.error('[whatsappWebhook] WHATSAPP_WEBHOOK_SECRET not set — rejecting rather than accepting unverifiable deliveries');
    return res.status(501).json({ error: 'webhook secret not configured' });
  }

  const signature = req.get('X-Webhook-Signature');
  if (!verifyVobizSignature(req.rawBody, signature, config.whatsapp.webhookSecret)) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  const envelope = req.body || {};
  const eventType = req.get('X-Webhook-Event') || envelope.event_type;

  // Vobiz retries deliveries — dedupe by event_id so a retry never
  // double-applies a trigger-word match to the same case.
  if (store.isDuplicateWebhookEvent(envelope.event_id)) {
    return res.status(200).json({ deduped: true });
  }

  // Respond fast (Vobiz's own "Best Practices"), everything below is cheap
  // in-memory work so doing it inline before responding is fine here — no
  // queue needed at booth-demo scale.
  if (eventType !== 'message.inbound') {
    return res.status(200).json({ ignored: eventType || 'unknown' });
  }

  try {
    const value = envelope.payload && envelope.payload.entry
      && envelope.payload.entry[0] && envelope.payload.entry[0].changes
      && envelope.payload.entry[0].changes[0] && envelope.payload.entry[0].changes[0].value;
    const message = value && value.messages && value.messages[0];
    const fromPhone = (message && message.from) || (value && value.contacts && value.contacts[0] && value.contacts[0].wa_id);

    if (!message || !fromPhone) {
      console.warn('[whatsappWebhook] message.inbound with no parseable message/sender', JSON.stringify(envelope).slice(0, 300));
      return res.status(200).json({ ignored: 'unparseable' });
    }

    // Only plain text carries a trigger word directly; a button/interactive
    // reply (quick-reply buttons, list picks) has its label in a different
    // field — not needed yet since nothing in this demo sends those, but
    // logged rather than silently dropped so a future template with buttons
    // doesn't look like inbound replies stopped working.
    const text = message.type === 'text' ? (message.text && message.text.body) : null;
    if (message.type !== 'text') {
      console.log(`[whatsappWebhook] inbound message.type=${message.type} from ${fromPhone} — no text body to match against`);
    }

    const matchedCase = store.findCaseByPhone(fromPhone);
    if (!matchedCase) {
      console.warn(`[whatsappWebhook] inbound message from ${fromPhone} matched no open case`);
      return res.status(200).json({ ignored: 'no_matching_case' });
    }

    const triggerMatched = matchTrigger(text);
    const inboundEntry = {
      text: text || `(${message.type} message)`,
      receivedAt: new Date().toISOString(),
      triggerMatched,
    };
    const existingMessages = matchedCase.realInboundMessages || [];
    store.updateCase(matchedCase.call_id, {
      realInboundMessages: [...existingMessages, inboundEntry],
      realInboundLatest: inboundEntry, // convenience field so the SSE consumer doesn't have to diff the array
    });

    console.log(`[whatsappWebhook] inbound "${text}" from ${fromPhone} -> case ${matchedCase.call_id}${triggerMatched ? `, trigger: ${triggerMatched}` : ''}`);
    return res.status(200).json({ received: true, caseId: matchedCase.call_id, triggerMatched });
  } catch (err) {
    console.error('[whatsappWebhook] error handling message.inbound', err);
    // Still 200 — Vobiz would otherwise retry a payload that will fail the
    // same way every time, and the error is already logged for follow-up.
    return res.status(200).json({ error: 'handler_threw' });
  }
});

module.exports = router;
