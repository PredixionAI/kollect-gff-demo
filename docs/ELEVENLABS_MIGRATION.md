# Migrating the booth demo from VOIZ to ElevenLabs (branch `feature/elevenlabs`)

What this branch changes, what you must set up in the ElevenLabs dashboard,
and how to run it. Companion to `ELEVENLABS_API_REFERENCE.md` (the raw API
facts live there).

## 0. What changed in the code

```
server/lib/callProvider.js      NEW — provider seam: VOICE_PROVIDER picks voiz|elevenlabs
server/lib/elevenLabsClient.js  NEW — outbound call + conversation polling,
                                normalized to the exact record shape
                                callOutcome.js already consumes from VOIZ
server/routes/agentTools.js     NEW — webhook-tool endpoints the ElevenLabs
                                agent calls MID-CONVERSATION to fire WhatsApp
                                (seamless trigger) and mid-call escalation
routes/call.js, lib/callPoller.js, routes/voices.js
                                now go through callProvider instead of
                                voizClient directly — no behavior change
                                when VOICE_PROVIDER=voiz
```

Untouched on purpose: `voizClient.js`, `webhook.js`, all WhatsApp code
(mock mode + rate limiter apply identically to agent-triggered sends), the
Gemini post-call analysis, telemetry, and the entire frontend. The dashboard
does not know or care which provider dialed.

## 1. Account prerequisites (ElevenLabs dashboard)

1. **API key** — Developers → API keys, with Agents Platform permissions.
   → `ELEVENLABS_API_KEY`
2. **Phone number** — Agents → Phone numbers → import from Twilio **or**
   connect a SIP trunk. India note: pick whichever route your telephony
   partner supports; the current VOIZ SIP trunk cannot be reused as-is
   unless it is re-pointed at ElevenLabs' SIP endpoint.
   → `ELEVENLABS_PHONE_NUMBER_ID`, `ELEVENLABS_TRANSPORT=twilio|sip-trunk`
3. **One agent per persona** (start with Priya, same rollout as VOIZ):
   Agents → New agent. Port the persona's system prompt from the VOIZ agent.
   → `ELEVENLABS_AGENT_ID_PRIYA` (+ `_ARJUN` etc. as they're built);
   `ELEVENLABS_DEFAULT_AGENT_ID` = Priya's for now.
   The matching orb lights up automatically once its env var is set —
   same contract as before.

## 2. Dynamic variables (replaces VOIZ `customer_data`)

The backend passes these on every call — reference them in each agent's
prompt / first message:

| Variable            | Example      | Source                        |
|---------------------|--------------|-------------------------------|
| `{{customer_name}}` | Vatsal       | screen-1 capture              |
| `{{due_amount}}`    | 45000        | `DEMO_DUE_AMOUNT`             |
| `{{due_date}}`      | 2026-09-05   | `DEMO_DUE_DATE`               |

## 3. Outcome flags → agent "Data collection" config (IMPORTANT)

VOIZ returned `escalation_flag` / `dispute_flag` / `ptp_flag` / `rtp_flag` /
`customer_sentiment` / `next_best_action` / `dispute_description` under
`record.artifacts.*`. ElevenLabs has no built-in equivalents — they come from
the agent's **Analysis → Data collection** items, which the platform's LLM
extracts after each call and returns in `analysis.data_collection_results`.

On EVERY persona agent, define data-collection items with **these exact
ids** (the mapping in `elevenLabsClient.js` keys off them):

| id                    | type    | description to give the extractor            |
|-----------------------|---------|----------------------------------------------|
| `escalation_flag`     | boolean | Did the borrower demand a human / supervisor? |
| `dispute_flag`        | boolean | Did the borrower dispute the debt?            |
| `ptp_flag`            | boolean | Did the borrower promise to pay?              |
| `rtp_flag`            | boolean | Did the borrower refuse to pay?               |
| `customer_sentiment`  | string  | Overall borrower sentiment (one word)         |
| `next_best_action`    | string  | Recommended next step for collections         |
| `dispute_description` | string  | If disputed: the borrower's stated reason     |

Missing items just come through `undefined` — the dashboard degrades exactly
as it does when VOIZ omits a field. `analysis.call_successful` maps to
`call_success` automatically; the full raw analysis (incl.
`transcript_summary`) lands under `structured_outputs` on the case record.

## 4. Seamless WhatsApp via agent tool calls (the point of this branch)

On `main`, WhatsApp fires from the dashboard's scripted timeline. Here the
**voice agent itself** triggers it mid-call — "I'm sending that to you on
WhatsApp right now" is true the moment it's said, and the send shows up live
on the dashboard through the existing SSE stream.

Configure two **webhook tools** on each agent (Agent → Tools → Webhook):

**Tool 1 — `send_whatsapp`**
- Method/URL: `POST https://<public-base>/api/agent-tools/whatsapp`
- Description (governs when the LLM fires it): *"Send the borrower a WhatsApp
  message summarising what was just agreed (payment link, plan details, or a
  reminder). Call this whenever you tell the borrower you are sending
  something on WhatsApp."*
- Headers: `X-Tool-Secret` from a **workspace secret** = `ELEVENLABS_TOOL_SECRET`
- Body params:
  - `conversation_id` (string) — bind to the system dynamic variable
    `{{system__conversation_id}}`, not LLM-filled
  - `template` (string enum: `paymentReminder` | `followup`)
  - `message` (string) — "the exact message to send, matching what you told
    the borrower"

**Tool 2 — `escalate_to_human`**
- Method/URL: `POST https://<public-base>/api/agent-tools/escalate`
- Description: *"Notify a human collections agent immediately. Call when the
  borrower disputes the debt, is distressed, or demands a supervisor."*
- Headers: same `X-Tool-Secret`
- Body params: `conversation_id` (system variable, as above),
  `reason` (string).

Safety properties (all enforced server-side, see `routes/agentTools.js`):
- Recipient is resolved from the case record by `conversation_id` — the tool
  body cannot redirect a message to an arbitrary number; escalations always
  go to `WHATSAPP_HUMAN_AGENT_NUMBER`.
- Sends run through the same mock/live switch and per-minute/per-case/per-day
  rate limiter as every other WhatsApp path — a looping agent cannot outspend
  the caps, and in `WHATSAPP_MODE=mock` it costs nothing.
- The tools return short speakable `result` strings so the agent can react
  naturally ("that's on its way to your WhatsApp now").

**Public reachability**: ElevenLabs' servers must reach these endpoints, so
for local rehearsal run a tunnel (`ngrok http 3001` or `cloudflared tunnel`)
and put the tunnel base URL in the tool config. This is the ONE thing that
needs a tunnel — call outcomes still arrive by polling, exactly like `main`.
Never expose the tunnel without `ELEVENLABS_TOOL_SECRET` set.

## 5. How a call flows end-to-end now

1. Dashboard hits `POST /api/call` (unchanged).
2. `callProvider` → `elevenLabsClient.placeCall` → `conversation_id` becomes
   the case's `call_id`; poller starts.
3. Mid-call, the agent fires `send_whatsapp` / `escalate_to_human` tool calls
   → `routes/agentTools.js` → existing WhatsApp lib → case record updated →
   dashboard SSE shows it live (`agentWhatsappSends` on the case).
4. Poller sees status `done` → normalized record (transcript + mapped
   artifacts) → `callOutcome.handleCallOutcome` runs unchanged: escalation
   check, Gemini streaming analysis, dashboard reveal.

## 6. Run it locally

```bash
git checkout feature/elevenlabs
npm install
cp .env.example .env    # fill in ELEVENLABS_* (and GEMINI_API_KEY if wanted)
npm run dev             # http://localhost:3001
```

- With no `ELEVENLABS_API_KEY` the server still boots and the UI works; only
  real dialing fails (same behavior as a blank `VOIZ_API_KEY` on main).
- `GET /api/agent-tools/health` → quick check of provider, WhatsApp mode and
  whether the tool secret is set.
- Rehearse the tool endpoints without a real call:

```bash
curl -s -X POST localhost:3001/api/call-direct -H 'Content-Type: application/json' \
  -d '{"customerPhone":"+919999999999","customerName":"Rehearsal"}'   # creates a case
curl -s -X POST localhost:3001/api/agent-tools/whatsapp -H 'Content-Type: application/json' \
  -d '{"conversation_id":"<call_id from above>","template":"paymentReminder","message":"Test"}'
```

  (in mock mode this logs the would-be send and returns `status: sent`).

## 7. Still open / not verified

- No real ElevenLabs call has been made from this repo yet — §1–§4 are set up
  from official docs, not live-tested. Promote items in
  `ELEVENLABS_API_REFERENCE.md` once the first Priya test call lands.
- Whether `{{system__conversation_id}}` binding matches the current dashboard
  UI naming — check the tool editor when configuring.
- Telephony for India (SIP trunk vs Twilio) — commercial/latency call, not
  code.
