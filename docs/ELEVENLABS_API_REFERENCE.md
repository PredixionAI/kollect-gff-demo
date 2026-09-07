# ElevenLabs Agents Platform — API reference for this repo

Everything this branch's `server/lib/elevenLabsClient.js` and
`server/routes/agentTools.js` rely on, in the same spirit as
`VOIZ_API_REFERENCE.md`: what each endpoint does and how sure we are of it.

Legend (note the meaning differs slightly from the VOIZ doc):
- 📗 **from official docs** — pulled from https://elevenlabs.io/docs on
  2026-09-07. Believed accurate, but **not yet exercised against a live
  ElevenLabs account from this repo**.
- 📄 **assumed** — reasonable inference, verify before relying on it.

Nothing in this doc is ✅ platform-verified yet. The first real test call
should promote entries here the same way the VOIZ doc was corrected.

## Auth 📗

All REST calls send the API key as an `xi-api-key` header (not
`Authorization: Bearer`):

```
xi-api-key: <ELEVENLABS_API_KEY>
```

Base URL: `https://api.elevenlabs.io` (regional variants exist — US/EU/India;
`ELEVENLABS_BASE_URL` overrides. India residency may matter for this demo).

## 1. Outbound call 📗

Two sibling endpoints, one per telephony transport. Which one applies depends
on how the FROM phone number was imported into ElevenLabs
(`ELEVENLABS_TRANSPORT` in `.env`):

```
POST /v1/convai/twilio/outbound-call      (number imported from Twilio)
POST /v1/convai/sip-trunk/outbound-call   (number connected via SIP trunk)
```

Request body (both endpoints, same shape):

```json
{
  "agent_id": "agent_xxx",                     // required
  "agent_phone_number_id": "phnum_xxx",        // required — the FROM number
  "to_number": "+91XXXXXXXXXX",                // required — E.164
  "conversation_initiation_client_data": {     // optional
    "dynamic_variables": {
      "customer_name": "Vatsal",
      "due_amount": "45000",
      "due_date": "2026-09-05"
    }
  }
}
```

- `dynamic_variables` are substituted into the agent's prompt/first message
  wherever it references `{{customer_name}}` etc. — this replaces VOIZ's
  `customer_data` map.
- Other optional fields: `conversation_config_override` (TTS/ASR/turn
  settings per call), `telephony_call_config` (machine detection, ringing
  timeout, recording).

Response (200):

```json
{
  "success": true,
  "message": "...",
  "conversation_id": "conv_xxx",   // this is our call_id
  "callSid": "CA..."               // twilio endpoint; sip endpoint returns sip_call_id
}
```

Differences from VOIZ worth remembering:
- **No `202 queued` concurrency response.** VOIZ queues at the cap; ElevenLabs
  concurrency is a plan limit and an over-limit call fails rather than
  queues 📄. The dashboard's "queued" handling simply won't trigger.
- `conversation_id` plays the role of VOIZ's `call_id`. There is no
  `room_name`.

## 2. Conversation status + transcript + outcome 📗

```
GET /v1/convai/conversations/{conversation_id}
```

This is the polling target (`server/lib/callPoller.js`), replacing VOIZ's
`GET /calls/{call_id}`.

- `status`: `initiated` → `in-progress` → `processing` → `done` (or
  `failed`). **`processing` means the call has ended but transcript/analysis
  are still being generated** — the client maps only `done`→`completed` and
  `failed`→`failed` as terminal, so the poller keeps waiting through
  `processing` and outcome data is complete when it fires.
- `metadata`: `start_time_unix_secs`, `call_duration_secs`,
  `termination_reason`, `cost`, phone-call details.
- `transcript[]`: `{ role: "user"|"agent", message, time_in_call_secs,
  tool_calls[], tool_results[] }` — tool calls the agent made (e.g. our
  WhatsApp trigger) appear inline in the transcript.
- `analysis`:
  - `call_successful`: `"success" | "failure" | "unknown"`
  - `transcript_summary`: string
  - `evaluation_criteria_results`: per-criterion `{ result, rationale }`
  - `data_collection_results`: per-item `{ value, rationale }` — **this is
    where our VOIZ-style outcome flags come from**, see
    `ELEVENLABS_MIGRATION.md` §3.

Call audio: `GET /v1/convai/conversations/{conversation_id}/audio` 📗
(requires `xi-api-key` — it is not a public URL).

## 3. Agent webhook tools ("server tools") 📗

The mechanism behind the seamless in-call WhatsApp trigger
(`server/routes/agentTools.js`).

- A tool is configured on the agent (dashboard → Agent → Tools → Webhook):
  name, description, URL, HTTP method, and JSON schemas for path/query/body
  params. **The LLM decides mid-conversation when to call it** and fills the
  params from context — the description text is effectively the prompt that
  governs when it fires.
- Headers can carry secrets stored as **workspace secrets** (dashboard →
  Agents → Settings → Secrets) — that's where `X-Tool-Secret` goes, so the
  value never sits in the tool definition or the transcript.
- The tool's HTTP response body is fed back to the LLM, which continues the
  conversation with it — so our endpoints return a short speakable `result`
  string ("WhatsApp message sent…"), not a data dump.
- System dynamic variables (e.g. `{{system__conversation_id}}`) can be bound
  to tool params 📄 — that is how each tool call carries the
  `conversation_id` that lets the backend find the right case record.

## 4. Post-call webhook 📄

ElevenLabs can also POST a `post_call_transcription` webhook (HMAC-signed,
`ElevenLabs-Signature` header) when a conversation ends — the analogue of
VOIZ's `call_completed` webhook. **Unused on this branch**: polling (§2) is
the primary path, same decision as on `main`, so no public tunnel is needed
for call outcomes. Only the agent tools (§3) need public reachability, and
only when you actually configure them.

## What is intentionally NOT wired

- Conversation signed URLs / WebSocket (browser-based conversations) — the
  booth flow is phone-out only.
- Batch calling (`/v1/convai/batch-calling/*`) — one attendee, one call.
- Knowledge base / RAG endpoints — persona prompts are enough for a demo.
