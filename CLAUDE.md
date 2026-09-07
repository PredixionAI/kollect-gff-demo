# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Booth demo for GFF 2026: a thin Express backend that proxies a voice-calling
platform (so no API key ever reaches the browser) plus WhatsApp (Vobiz BSP),
serving a static 6-screen attendee flow from `public/`. Real outbound calls to
the attendee's phone are the core of the demo. `EXECUTION.md` is the working
brief — its "Decisions locked in" list is authoritative; don't re-litigate
those without checking with Kamal.

## Commands

```bash
npm install
cp .env.example .env   # then fill in keys — see .env.example comments
npm run dev            # node --watch, http://localhost:3001
npm start              # same without watch
```

There is no test suite, linter, or build step. Verification is running the
server and hitting endpoints (`GET /api/voices`, `GET /api/agent-tools/health`,
`POST /api/call-direct` for a manual call). The server boots with a blank
`.env` (config warns instead of throwing); only real dialing/sends fail.

## Branches

- `main` / `dev` — VOIZ is the only call provider.
- `feature/elevenlabs` — adds a provider seam (`server/lib/callProvider.js`,
  `VOICE_PROVIDER=elevenlabs|voiz`) and in-call WhatsApp via ElevenLabs agent
  webhook tools (`server/routes/agentTools.js`). See
  `docs/ELEVENLABS_MIGRATION.md`.

## Architecture — the parts that span multiple files

**Call lifecycle** (the main flow to understand first):
`public/js/dashboard.js` → `POST /api/call` (`routes/call.js`, resolves the
orb's agent id server-side so the client can never pick an agent) → provider
client places the call → `lib/callPoller.js` polls call details every 5s →
on a terminal status, `lib/callOutcome.js` updates the in-memory case,
fires the escalation WhatsApp if flagged, and kicks off streaming Gemini
analysis (`lib/geminiClient.js`) — every patch re-emits over the SSE bus in
`lib/store.js`, which the dashboard watches at `GET /api/call/:id/events`.

**Polling, not webhooks, is how call completion is learned.** The
`call_completed` webhook receiver (`routes/webhook.js`) exists only as an
unverified secondary path; nothing depends on it and no public tunnel is
needed for outcomes.

**Outcome fields are nested, not top-level.** VOIZ returns
`escalation_flag`/`dispute_flag`/`ptp_flag`/etc. under `record.artifacts.*` —
reading them top-level silently yields `undefined` (a real bug this repo hit).
There is no single `disposition` enum. On the ElevenLabs branch,
`lib/elevenLabsClient.js` normalizes conversations into this same record
shape, so `callOutcome.js` stays provider-agnostic.

**WhatsApp cost discipline.** Every send path (scripted timeline via
`routes/whatsapp.js`, escalation, agent tool calls) funnels through
`lib/whatsapp.js`, which enforces `WHATSAPP_MODE=mock` (log-only, default)
and the per-minute/per-case/per-day caps in `lib/whatsappRateLimit.js`.
Real sends cost money per Meta conversation — never flip mode to `live`,
raise the caps, or bypass this module in new send paths. The runtime
mock/live toggle (`lib/whatsappModeState.js`) resets to `.env` on restart
by design.

**Frontend is hand-edited vanilla JS** — `public/` is the source of truth,
nothing generates it, there is no React/bundler. One screen ≈ one file in
`public/js/`. Third-party UI code goes in `public/js/vendor/` as vendored
static files (see `vendor/thinking-orb.js` header for the pattern).
`legacy/` is dead code kept for reference; nothing there is loaded.

**Telemetry** (`lib/telemetryStore.js`, `routes/telemetry.js`) tracks each
attendee session in memory, persists to `server/data/sessions.json`, and
pushes to Google Sheets via an Apps Script webhook when
`GOOGLE_SHEET_WEBHOOK_URL` is set. `server/googleAppsScript.js` is that
standalone script, not server code.

## Platform facts that contradict the vendor docs

`docs/VOIZ_API_REFERENCE.md` and `docs/WHATSAPP_API_REFERENCE.md` track what
is ✅ verified against the real platforms vs 📄 assumed — trust those files
over the platform guides. Highlights: VOIZ authenticates with an `X-API-Key`
header (the platform guide says Bearer, which does not work); ElevenLabs uses
`xi-api-key` (`docs/ELEVENLABS_API_REFERENCE.md`, from official docs, not yet
live-verified).

## Cautions

- `recordings/` contains real attendee call audio (PII) and is gitignored —
  never commit it or anything like it.
- Concurrency: VOIZ enforces the real cap of 5 and returns `202 queued`;
  this app just handles that response, it does not enforce anything.
