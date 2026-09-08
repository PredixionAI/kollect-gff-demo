# VOIZ API Reference — corrected against real integration

This replaces the "Unified End-to-End API Reference" section of
`VOIZ_MASTER_API_SETUP_AND_VOICE_CATALOG_GUIDE.docx` for the endpoints this
project actually calls. It does not cover architecture, local dev setup, AMD,
or the voice catalog — see the original guide for those.

Each endpoint below is tagged with how confident we are in it:

- **✅ Verified** — this project has placed real calls against it and it
  works exactly as described here.
- **📄 Per platform guide, unverified here** — copied from the guide as-is;
  this codebase has not exercised it, so treat the shape as a starting point,
  not a guarantee.

## Authentication — ✅ Verified (correction)

**The platform guide is wrong about this.** It documents:

```
Authorization: Bearer <API_KEY>
```

That does not work. What actually works, confirmed by real successful call
dispatch (see `server/lib/voizClient.js` and the recordings it produced):

```
X-API-Key: <API_KEY>
```

Use `X-API-Key` for every request in this reference. If you're pulling from
the original guide for an endpoint not listed here, don't trust its auth
header either — try `X-API-Key` first.

Webhook signature verification is unaffected by this — that's a separate
HMAC scheme (see below).

## POST /api/agents/{agent_id}/call — ✅ Verified

Dispatches an outbound call. This is the one endpoint this project has
proven end-to-end (real calls, real recordings).

```
POST {VOIZ_BASE_URL}/api/agents/{agent_id}/call
Content-Type: application/json
X-API-Key: <VOIZ_API_KEY>

{
  "customer_phone": "+919876543210",
  "sip_id": "ST_jtDDZVvDLDxb",
  "customer_data": {
    "name": "Ramesh Patil",
    "customer_name": "Ramesh Patil",
    "due_amount": "45000",
    "due_date": "2026-09-05"
  }
}
```

Notes on the payload, from what's actually been sent successfully:
- `customer_phone` must be E.164 (`+91...`) — this project auto-prefixes
  `+91` if the number doesn't already start with `+`.
- `due_amount` / `due_date` are sent as **strings**, not numbers — the guide's
  example shows `due_amount` as a JSON number (`12500.50`); sending strings
  is what this project does and it works, but it hasn't been proven that a
  number would fail. If you're registering a new agent's `variables[]` and
  something isn't populating right, this is worth double-checking first.
- Both `name` and `customer_name` are sent with the same value. This is
  defensive/redundant on this project's side, not a confirmed VOIZ
  requirement — we haven't tested whether VOIZ actually needs both keys or
  just one.
- Extra fields can be merged into `customer_data` (this project's
  `/api/call-direct` debug route passes through an arbitrary `customData`
  object) — VOIZ has tolerated additional keys without erroring.

Responses (per the guide, and consistent with what this project has
observed):

```
# 200 OK — immediate dispatch
{ "status": "initiated", "call_id": "call_...", "room_name": "room_call_..." }

# 202 Accepted — queued (capacity reached)
{ "status": "queued", "call_id": "call_...", "message": "..." }
```

Handle both — a booth with limited concurrency (see the platform guide's
concurrency section) will return 202 during busy periods, not just as an
edge case.

## GET /calls/{call_id} — ✅ Verified — PRIMARY way to learn call outcome

Not in the platform guide at all — found via the real Swagger UI at
`{VOIZ_BASE_URL}/docs`. **This is now the primary way this app learns how a
call ended** (`server/lib/callPoller.js` polls it every 5s after a call
starts); the `call_completed` webhook below is kept only as an unverified
secondary path.

```
GET {VOIZ_BASE_URL}/calls/{call_id}
X-API-Key: <VOIZ_API_KEY>
```

Returns the full call record. Confirmed real shape (verified against an
actual completed call, 2026-09-05):

```json
{
  "call_id": "call_...", "phone": "+91...", "customer_name": "...",
  "status": "completed",
  "agent_id": "agent_...", "agent_name": "Priya",
  "created_at": "...", "started_at": "...", "ended_at": "...",
  "duration": 102,
  "transcript": {
    "transcript_data": { "messages": [{ "speaker": "agent", "message": "..." }, ...] },
    "summary": { "outcome": "...", "summary": "..." }
  },
  "artifacts": {
    "amd": { "is_machine": false, ... },
    "metrics": { "EOU_METRICS": [...], "LLM_METRICS": [...], "STT_METRICS": [...], "TTS_METRICS": [...] },
    "answered": true, "answered_at": "...",
    "call_end_reason": "COMPLETED",
    "call_success": null,
    "ptp_flag": null, "rtp_flag": null, "dispute_flag": null, "escalation_flag": null,
    "customer_sentiment": null, "next_best_action": null, "dispute_description": null,
    "emi_interested": null, "waiver_interested": null,
    "ptp_captured": null, "ptp_confidence_score": null,
    "recording_url": "https://....ogg?<sas-token>",
    "structured_outputs": {},
    "ring_duration_seconds": 12, "talk_duration_seconds": 90,
    "transcript_json": { "messages": [...] }
  }
}
```

**The one thing to not get wrong here (a real bug this project actually
hit once): every outcome field is nested under `artifacts`, not top-level.**
`record.escalation_flag` is always `undefined` — the real field is
`record.artifacts.escalation_flag`. `server/lib/callOutcome.js` reads from
`record.artifacts.*` for this reason; if you're adding a new field to read,
check `artifacts` first.

**There is no single `disposition` enum field anywhere in this response.**
The platform guide's `call_completed` webhook example shows one
(`"disposition": "HUMAN_PROMISE_TO_PAY"`) — that shape doesn't match reality.
Real outcome data is a set of separate fields instead:
- Booleans: `ptp_flag`, `rtp_flag`, `dispute_flag`, `escalation_flag`,
  `call_success`, `machine_answered`, `emi_interested`, `waiver_interested`
- Strings: `customer_sentiment`, `next_best_action`, `dispute_description`
- `structured_outputs` (object, empty `{}` in every call seen so far)

All of the above were `null`/empty in the one real call inspected — that
call used a generic loan-offer test script, not a collections script
designed to populate them. Whether they populate meaningfully depends on
the registered agent's prompt design (Phase 0.5, branch scripts) — this
isn't a separate mystery to resolve with the Voiz-Agents team, it's a
consequence of what script is running.

`server/lib/callOutcome.js`'s `ESCALATION_FLAGS = ['escalation_flag',
'dispute_flag']` — a call escalates if either is `true`.

## POST /api/agents — 📄 Per platform guide, unverified here

Registers an agent spec. This project has not called this endpoint itself —
the one agent in use (Priya) was registered outside this codebase. Shape per
the guide:

```
POST {VOIZ_BASE_URL}/api/agents
Content-Type: application/json
X-API-Key: <VOIZ_API_KEY>

{
  "agent_name": "DebtCollectionAgent_v3",
  "description": "Outbound EMI reminder agent with Marathi & Hindi support",
  "tts_provider_uid": "prov_...",
  "stt_provider_uid": "prov_...",
  "llm_provider_uid": "prov_...",
  "prompt_key": "smfg_collections_v2",
  "prompt_text": "You are {agent_name} from {company_name}. Remind customer of EMI {due_amount}.",
  "first_message": "Namaste {customer_name} ji! Main {agent_name} bol rahi hoon.",
  "variables": [
    { "key": "customer_name", "type": "string" },
    { "key": "due_amount", "type": "currency_inr" },
    { "key": "due_date", "type": "date_hindi" }
  ],
  "knowledge_base_ids": [101, 104]
}

# 201 Created
{ "success": true, "agent_id": "agent_...", "status": "active", "version": 1 }
```

**Given the auth-header correction above and the `due_amount`/`due_date`
type note in the call endpoint, don't assume this payload is 100% accurate
either — verify the auth header works here before relying on any other
field shape being exact.** If you're registering the next agent (Swara,
Meera, Vikram, or Ritu — see `EXECUTION.md`), this is the endpoint to use;
treat the first registration as the verification step for this section too,
and update this doc once you've confirmed the real shape.

## Webhook: call_completed — 📄 Per platform guide, unverified here — SECONDARY, not required

**Superseded by `GET /calls/{call_id}` polling above as of 2026-09-05.**
This app no longer depends on this webhook at all — no public URL has ever
been registered with VOIZ for it, and none is needed now. This section is
kept only in case VOIZ ever pushes one; `server/routes/webhook.js` accepts
it best-effort but nothing relies on it arriving.

VOIZ POSTs this to whatever webhook URL is registered for your tenant once a
call ends. This project implements a receiver for it
(`server/routes/webhook.js`) and the signature-verification scheme is
implemented and internally consistent (`server/lib/verifySignature.js`), but
**no real call_completed webhook has been received and confirmed against
this implementation yet** — Priya's calls have connected, but end-to-end
webhook delivery hasn't been independently verified in this project. Given
the platform guide's example below uses a `disposition` field that we now
know doesn't exist in the real `GET /calls/{call_id}` shape, treat this
example as likely wrong in the same way, not just "unverified."

```
POST <your registered webhook URL>
Content-Type: application/json
X-Voiz-Signature: sha256=<hex HMAC-SHA256 of the raw request body, keyed by VOIZ_WEBHOOK_SECRET>

{
  "event": "call_completed",
  "call_id": "call_...",
  "agent_id": "agent_...",
  "customer_phone": "+919876543210",
  "duration_seconds": 192,
  "talk_duration_seconds": 178,
  "answered": true,
  "disposition": "HUMAN_PROMISE_TO_PAY",
  "amd_result": "HUMAN_CONFIRMED",
  "transcript": "Agent: ... Customer: ...",
  "recording_url": "https://storage.voiz.ai/recordings/call_....mp4",
  "structured_outputs": {
    "ptp_amount": 12500.50,
    "ptp_date": "2026-09-02",
    "sentiment": "positive"
  }
}
```

The signature verification this project does:
1. Compute HMAC-SHA256 of the **raw** request body (before JSON parsing —
   Express is configured to capture this, see `server/index.js`'s
   `express.json({ verify })`), keyed with `VOIZ_WEBHOOK_SECRET`.
2. Format as `sha256=<hex digest>`.
3. Compare against the incoming `X-Voiz-Signature` header with a
   constant-time comparison.

This mechanism is standard and almost certainly correct as implemented, but
whether the header name (`X-Voiz-Signature`), the `sha256=` prefix, and the
full field list above match what VOIZ *actually* sends is still unconfirmed.
**The full `disposition` enum is also still undocumented** (only
`HUMAN_PROMISE_TO_PAY` is shown as an example anywhere) — see
`EXECUTION.md`'s Phase 0.5 notes.

**Recommended next step to close this out**: tunnel a local endpoint (e.g.
ngrok), register it as the webhook URL for a real test call, and capture one
actual payload. Once you have it, update this section from "unverified" to
"verified" and correct anything that doesn't match.

## POST /api/vault/credentials — 📄 Per platform guide, unverified here

Not used by this project (WhatsApp is currently mocked, so no BSP key needs
storing here yet). Shape per the guide:

```
POST {VOIZ_BASE_URL}/api/vault/credentials
Content-Type: application/json
X-API-Key: <VOIZ_API_KEY>

{
  "provider": "cartesia",
  "credential_name": "Production Sonic Key",
  "api_key": "sk_...",
  "rate_limit_per_minute": 120
}
```

Same caveat as above: don't trust this shape until it's actually been
called once.
