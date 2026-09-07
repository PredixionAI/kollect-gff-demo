# Vobiz WhatsApp API Reference — for this project

Companion to [VOIZ_API_REFERENCE.md](VOIZ_API_REFERENCE.md). Same confidence
tags:

- **✅ Verified** — this project has actually called it.
- **📄 Per Vobiz docs, unverified here** — copied from their docs, never
  exercised by this codebase. Mock-mode sends don't count as verification —
  they never reach Vobiz at all.

Nothing here has gone live yet. `WHATSAPP_MODE=mock` in `.env` means every
send below is currently just a `console.log`, not a real request — see
`server/lib/whatsapp.js`.

## Authentication — 📄 Unverified here

```
X-Auth-ID: MA_XXXXXXXX
X-Auth-Token: <token>
Content-Type: application/json
```

Per Vobiz's docs. Unlike the VOIZ auth-header correction in the sibling doc,
there's no evidence yet that this is wrong — it just hasn't been tried.

## POST /api/v1/messaging/messages — 📄 Unverified here

```
POST https://api.vobiz.ai/api/v1/messaging/messages
Content-Type: application/json
X-Auth-ID: <WHATSAPP_AUTH_ID>
X-Auth-Token: <WHATSAPP_AUTH_TOKEN>

{
  "channel_id": "4bf1cd7d-e9cf-466a-98d8-39d616e94067",
  "waba_id": "1565839671851811",
  "to": "+919876543210",
  "type": "template",
  "template": {
    "name": "kollect_demo_payment_reminder",
    "language": { "code": "en" },
    "components": [{
      "type": "body",
      "parameters": [{ "type": "text", "text": "Namaste Ramesh ji,\n\nAapki EMI ₹45,000 kal due thi.\n\nAbhi pay karein: https://pay.link/45k" }]
    }]
  }
}
```

`channel_id`/`waba_id` are this project's real values (Kamal provided
these directly, not from docs). `type: "template"` is required for the
first message to any attendee — see the 24-hour window note below.

All 3 templates take exactly **one** body parameter — the full message text,
already exactly as shown on the dashboard (see `server/whatsappTemplates.js`
for why: 4 borrower archetypes produce different wording, so the template
body is just `{{1}}` rather than trying to fix per-archetype text into the
approved template itself).

Success is `201` with a `Message` object; `meta_message_id` is `null` until
Meta accepts it — correlate later `message.status` webhooks using it once
it's populated (`statuses[].id` in the webhook = `meta_message_id` here).

`server/lib/whatsapp.js`'s `sendTemplate()` builds exactly this payload from
`server/whatsappTemplates.js`'s template registry — the registry is the
single source of truth for template name/language/component structure.

## The 24-hour window — why every send here is a template, not free text

A booth attendee has never messaged the business first, so there's no open
24h window — a free-form `text` send would be rejected. **This is why all
three of this project's templates use `type: "template"`, never `type:
"text"`**, even though the dashboard's scripted mockup shows plain chat
bubbles. If the demo flow later needs a genuinely free-form reply (e.g. the
attendee texts back), that only becomes possible after their first inbound
message opens the window.

## Webhook: message.status — 📄 Unverified here

Not implemented in this project yet (see `EXECUTION.md` Phase 3 remaining
work). Per Vobiz's docs:

- **Registration**: `POST https://api.vobiz.ai/api/v1/messaging/webhooks`
  with `{ "url": "<your https endpoint>", "secret": "<your chosen secret>" }`,
  authenticated the same way as sending. Per-account, not per-channel. The
  secret is returned only once at creation — store it (a new
  `WHATSAPP_WEBHOOK_SECRET` env var, not yet added).
- **Delivery**: `POST` to your registered URL, `X-Webhook-Signature: <hex
  HMAC-SHA256 of the raw body, keyed by your secret>` — no `sha256=` prefix,
  unlike VOIZ's webhook signature. Verify with a constant-time compare.
- **Payload** (`event_type: "message.status"`):
  ```json
  {
    "event_id": "...", "event_type": "message.status",
    "account_id": "MA_...", "occurred_at": "...",
    "payload": {
      "messaging_product": "whatsapp",
      "metadata": { "display_phone_number": "...", "phone_number_id": "..." },
      "statuses": [
        { "id": "<wamid>", "recipient_id": "+91...", "status": "delivered", "timestamp": "..." }
      ]
    }
  }
  ```
  `status` is one of `sent` / `delivered` / `read` / `failed` — these are
  **values of one event type**, not separate event types.

## Rate limiting — this project's own safety net, not a Vobiz feature

`server/lib/whatsappRateLimit.js` caps sends per-minute / per-case / per-day
(`WHATSAPP_MAX_PER_*` in `.env`). This exists because a bug that loops a
send spends real money on Meta's per-conversation pricing — Vobiz doesn't
protect you from that, this project does it itself. Applies even in mock
mode (already verified — a 4th mock send to the same recipient correctly
returns `blocked` instead of `sent`).

## Recommended next step to move from unverified to verified

1. Get the 3 templates in `server/whatsappTemplates.js` approved in Meta
   Business Manager.
2. Fill in `WHATSAPP_AUTH_ID`/`WHATSAPP_AUTH_TOKEN`.
3. As a deliberate, watched one-off (not from the dashboard flow), flip
   `WHATSAPP_MODE=live` and send one message to a real test number you
   control. Confirm the request/response shape actually matches this doc,
   then update anything that doesn't.
4. Only after that, register a webhook and build the `message.status`
   receiver.
