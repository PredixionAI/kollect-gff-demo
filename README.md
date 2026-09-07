# Kollect GFF 2026 — Booth Demo

Thin Express backend over the VOIZ platform (calls) and Vobiz (WhatsApp),
serving the booth dashboard as static frontend. Built against
`Kollect_GFF_Demo_PRD.docx` and
`VOIZ_MASTER_API_SETUP_AND_VOICE_CATALOG_GUIDE.docx` — see
[docs/VOIZ_API_REFERENCE.md](docs/VOIZ_API_REFERENCE.md) and
[docs/WHATSAPP_API_REFERENCE.md](docs/WHATSAPP_API_REFERENCE.md) for what's
actually been verified against each real platform vs. still assumed.

See [EXECUTION.md](EXECUTION.md) for the full current-state brief and what to
build next — this section is just a quick summary.

> **Branch `feature/elevenlabs`**: calls go through ElevenLabs Agents
> Platform instead of VOIZ (`VOICE_PROVIDER` in `.env` switches back), and
> the voice agent triggers WhatsApp mid-call via webhook tool calls instead
> of only the scripted timeline. See
> [docs/ELEVENLABS_MIGRATION.md](docs/ELEVENLABS_MIGRATION.md) and
> [docs/ELEVENLABS_API_REFERENCE.md](docs/ELEVENLABS_API_REFERENCE.md).

## Current scope (per latest decisions)

- Real outbound call via VOIZ, triggered from the backend (no keys in the
  browser) — confirmed working, see `recordings/`. VOIZ authenticates with
  an `X-API-Key` header, not `Authorization: Bearer` as the platform guide
  documents.
- The booth flow is 6 screens: capture → soft-launch intro → orb voice
  carousel → archetype select → persona reveal → dashboard.
- Each orb in the voice carousel maps to its own VOIZ agent
  (`server/config.js` → `agentIdsByVoice`, keyed off `VOIZ_AGENT_ID_PRIYA` /
  `_ARJUN` / `_MEERA` / `_VIKRAM` / `_RITU` in `.env`). Only Priya has a real
  agent today — the rest show as "Coming soon" until their env var is set.
  Voice-picker previews are spoken client-side via the Web Speech API, not
  pre-recorded clips.
- Live in-call transcript is deferred — the dashboard shows a status line
  (dialing / in progress / queued) and only reveals the transcript after the
  `call_completed` webhook lands.
- WhatsApp (BSP: Vobiz) is fully wired — 3 templates (reminder, plan offer,
  escalation), fired at the matching steps in the dashboard's scripted
  timeline (mirrors how the real call fires), plus a strict per-minute/
  per-case/per-day rate limiter (`server/lib/whatsappRateLimit.js`) — but
  stays `WHATSAPP_MODE=mock` (logs only, zero cost) until the 3 templates
  are Meta-approved and someone deliberately flips it. **No real WhatsApp
  send has been tested, only mock.**
- Concurrency is fixed at 5 (informational on this side — VOIZ enforces the
  real cap and returns `202` when it's hit; the UI already handles that).

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:
- `VOIZ_API_KEY`, `VOIZ_WEBHOOK_SECRET`, `SIP_TRUNK_ID`, `VOIZ_DEFAULT_AGENT_ID`
- `WHATSAPP_CHANNEL_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_HUMAN_AGENT_NUMBER` are
  already set; `WHATSAPP_AUTH_ID`/`WHATSAPP_AUTH_TOKEN` stay blank until
  templates are approved — leave `WHATSAPP_MODE=mock` until then

```bash
npm run dev
```

Open http://localhost:3001

## How this app learns a call ended

No public tunnel needed. `server/lib/callPoller.js` polls `GET
/calls/{call_id}` every 5s after a call starts, using the same `X-API-Key`
already in `.env` — found via VOIZ's real Swagger UI, not documented in the
platform guide. The `call_completed` webhook (`server/routes/webhook.js`)
still exists as an unverified secondary path in case VOIZ ever pushes one,
but nothing in this app depends on it.

## Telemetry & Google Sheets Logging

Attendee sessions (Name, Phone, Login time, Voice/Archetype choices, Dashboard engagement, Call & WhatsApp outcomes) are tracked in real-time.

- **Google Sheets Sync**: Real-time push to Google Sheets via Google Apps Script Webhook (`GOOGLE_SHEET_WEBHOOK_URL` in `.env`). See [docs/GOOGLE_SHEETS_SETUP.md](docs/GOOGLE_SHEETS_SETUP.md) for the 2-minute setup guide.
- **Local Fallback**: Saves sessions to `server/data/sessions.json`.
- **Instant CSV Export**: Download captured session data at any time via `GET /api/telemetry/export-csv`.

## Project layout

`public/` is hand-edited directly — it is the source of truth, nothing
generates it. `legacy/` holds superseded code kept for reference only (see
`legacy/README.md`); nothing there is loaded by the running app.

```
server/
  index.js              Express app, mounts routes + serves public/
  config.js             Reads .env, builds the orb → agent_id map + telemetry config
  voiceCatalog.js       The 5 demo personas + spoken preview text
  whatsappTemplates.js  The 3 Meta templates (name/category/body/variables)
  googleAppsScript.js   Standalone Google Apps Script for live Google Sheets sync
  lib/
    telemetryStore.js   In-memory session tracking, JSON disk fallback & Sheets webhook
    voizClient.js       POST /agents/{id}/call + GET /calls/{id} (X-API-Key auth)
    callPoller.js       Polls GET /calls/{id} every 5s — primary way calls' outcomes are learned
    callOutcome.js      Shared: updates store + fires escalation WhatsApp (used by poller & webhook)
    verifySignature.js  HMAC verification for inbound VOIZ webhooks (secondary path only)
    whatsapp.js         sendTemplate()/sendText() — mock by default, real Vobiz send when live
    whatsappRateLimit.js Per-minute/case/day send caps — applies in mock too
    whatsappModeState.js Runtime mock/live toggle, resets to .env on restart
    store.js            In-memory case + escalation-queue state, SSE bus
  routes/
    telemetry.js        POST /api/telemetry/event, GET /api/telemetry/sessions, GET /api/telemetry/export-csv
    call.js             POST /api/call (resolves agent from voiceId server-side),
                        POST /api/call-direct (manual debug trigger),
                        GET /api/call/:id, SSE /api/call/:id/events
    webhook.js          POST /api/webhooks/voiz (call_completed) — secondary, unverified
    voices.js           GET /api/voices — includes `active` per persona
    escalations.js      GET /api/escalations (second-screen booth staff view)
    whatsapp.js         POST /api/whatsapp/send, GET/POST /api/whatsapp/mode, POST /api/whatsapp/send-test
public/
  index.html            The 6-screen booth dashboard
  css/styles.css
  js/
    telemetry.js        Client-side event tracking engine
    state.js, capture.js, softlaunch.js, orbs.js, archetype.js, persona.js,
    dashboard.js
    vendor/
      thinking-orbs-engine.es.js  Verbatim copy of the `thinking-orbs` npm
                                  package's framework-agnostic engine (see
                                  vendor/thinking-orb.js header for the
                                  upgrade command)
      thinking-orb.js             Vanilla adapter (no React on this page) —
                                  window.ThinkingOrb, used by the dashboard
                                  call-status line (connecting/listening/
                                  breathing states instead of the static dot)
  audio/                No longer used — voice previews are spoken via the
                        Web Speech API instead of recorded clips
legacy/                 Archived/dead code, kept for reference only
recordings/             Real call audio — gitignored, contains PII
docs/
  GOOGLE_SHEETS_SETUP.md     2-minute setup guide for Google Sheets live sync
  VOIZ_API_REFERENCE.md      Corrected VOIZ reference — ✅ verified vs 📄 assumed
  WHATSAPP_API_REFERENCE.md  Same, for Vobiz — nothing past mock is verified yet
```

