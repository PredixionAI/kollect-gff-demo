# Execution Brief — Kollect GFF 2026 Booth Demo

Working doc for whoever (human or IDE agent) picks this repo up next. Source
docs: `Kollect_GFF_Demo_PRD.docx` (scope/phases) and
`VOIZ_MASTER_API_SETUP_AND_VOICE_CATALOG_GUIDE.docx` (API/voice reference) —
neither lives in this repo, ask Kamal if you need to re-check them.

## 1. What exists right now

A working Express backend (`server/`) proxies VOIZ so no API key ever sits in
browser JS, plus the booth dashboard (`public/`) served statically. It runs
(`npm run dev`). Real calls work end-to-end — see `recordings/` for proof
(actual attendee call audio; never commit this folder, it's gitignored).

**The flow is 6 screens, not 4**: Capture → Soft-launch intro → Orb voice
carousel → Archetype select ("which borrower are you today?") → Persona
typewriter reveal → Dashboard. `public/` is the single source of truth —
edit files there directly. `legacy/` holds superseded code kept only for
reference (a one-shot generator script, two dead screen scripts from the
old 4-screen flow, and scratch extraction dumps) — nothing in it is loaded
by the running app; see `legacy/README.md`.

Decisions locked in (do not re-litigate without checking with Kamal):
- Live in-call transcript is **out of scope for this phase** — the dashboard
  only shows call status (dialing/queued/completed) and reveals the
  post-call transcript once it's fetched, not token-by-token.
- **How this app learns a call ended, as of 2026-09-05: polling `GET
  /calls/{call_id}` (`server/lib/callPoller.js`), not the `call_completed`
  webhook.** Found via the real Swagger UI (not in the platform guide at
  all), works with the existing `X-API-Key`, no public tunnel or Voiz-Agents
  team registration needed. The webhook receiver
  (`server/routes/webhook.js`) still exists as an unverified secondary path
  but nothing depends on it. See [docs/VOIZ_API_REFERENCE.md](docs/VOIZ_API_REFERENCE.md).
- **No single `disposition` enum field exists** (the platform guide's
  `call_completed` example assumed one). Real outcome data is separate
  boolean flags (`escalation_flag`, `dispute_flag`, `ptp_flag`, `rtp_flag`,
  `call_success`, ...) and strings (`customer_sentiment`,
  `next_best_action`, `dispute_description`), all nested under
  `record.artifacts.*` — a real bug this project hit once was reading them
  from the top level instead, where they're always `undefined`.
  `server/lib/callOutcome.js` is the shared, corrected logic both the
  poller and the webhook route call.
- Voice picker previews use in-browser Web Speech API TTS (a spoken sample
  line per persona, see `sampleText` in `server/voiceCatalog.js`), not
  recorded clips — the original "5 pre-recorded mp3s" plan was superseded
  during the orb-carousel rebuild.
- WhatsApp is mocked (`server/lib/whatsapp.js`) until BSP access lands.
- Concurrency cap is 5 (VOIZ-side; this app doesn't enforce it, just handles
  the `202 queued` response VOIZ returns).
- **VOIZ authenticates with an `X-API-Key` header, not `Authorization:
  Bearer`** as the platform guide documents — confirmed by real working
  calls. `server/lib/voizClient.js` uses the correct header. See
  [docs/VOIZ_API_REFERENCE.md](docs/VOIZ_API_REFERENCE.md) for the corrected
  reference — it also flags which endpoints (agent registration, the
  `call_completed` webhook) are still unverified against the real platform,
  vs. the call-dispatch endpoint which is proven working.
- Each orb now maps to its own VOIZ agent via `server/config.js`
  `agentIdsByVoice` (sourced from `VOIZ_AGENT_ID_PRIYA` / `_SWARA` /
  `_VIKRAM` in `.env` — Meera and Ritu were removed from the roster
  2026-09-08, see `server/voiceCatalog.js`). Neha, Swara and Vikram all have
  real registered agents now, so all three orbs are selectable
  (`public/js/orbs.js`, `renderOrbCarousel`). **Filling in one of those env
  vars is the entire activation step** — no code change needed — because
  `GET /api/voices` (`server/routes/voices.js`) computes
  `active: Boolean(agentIdsByVoice[id])` per persona and the orb carousel
  reads that flag directly.

## 2. Getting value out of `.env` — do this first

Copy `.env.example` to `.env` and fill in what you have. Nothing below works
until the corresponding variable is set — the app intentionally does NOT
throw at boot for missing values (it just warns), so a blank var fails
silently at the specific route that needed it. Check in this order:

| Variable | Unlocks | Where it's read |
|---|---|---|
| `VOIZ_API_KEY` | Outbound call dispatch | [server/lib/voizClient.js](server/lib/voizClient.js) — sent as `X-API-Key` (not `Bearer` — see §1) |
| `VOIZ_BASE_URL` | Same — which VOIZ environment you're hitting | same file |
| `VOIZ_DEFAULT_AGENT_ID` | Fallback agent, and currently Neha's real agent | [server/config.js](server/config.js), used by [server/routes/call.js](server/routes/call.js) |
| `VOIZ_AGENT_ID_SWARA` / `_VIKRAM` | Activates that orb — set once the agent is registered, no code change | `server/config.js` → `server/routes/voices.js` → `public/js/orbs.js` |
| `SIP_TRUNK_ID` | Passed through to VOIZ's call payload | `voizClient.js` |
| `VOIZ_WEBHOOK_SECRET` | Inbound `call_completed` webhook signature check — now a secondary/optional path, see §1 | [server/lib/verifySignature.js](server/lib/verifySignature.js) |
| `WHATSAPP_CHANNEL_ID` / `WHATSAPP_WABA_ID` / `WHATSAPP_AUTH_ID` / `WHATSAPP_AUTH_TOKEN` | Set and confirmed working — a live verification text send succeeded 2026-09-05 | `server/lib/whatsapp.js` |
| `WHATSAPP_HUMAN_AGENT_NUMBER` | Escalation recipient — real even in mock mode (shows in the mock log line) | `server/lib/whatsapp.js` |
| `WHATSAPP_MAX_PER_MINUTE/_CASE/_DAY` | Rate-limit caps — see Phase 3 below | `server/lib/whatsappRateLimit.js` |
| `DEMO_DUE_AMOUNT` / `DEMO_DUE_DATE` | The fixed demo case values sent on every call | `call.js` |

Note: `CARTESIA_API_KEY` exists in `.env` but nothing in the codebase reads it
yet — `provider: 'cartesia'` in `voiceCatalog.js` is just documentation of
which real VOIZ catalog voice a persona maps to, not a live API call. Don't
assume it's wired up.

**Verification steps once `.env` is filled:**
1. `npm run dev`, open `http://localhost:3001`, and click through the 6
   screens (capture → intro → orb carousel → archetype → persona reveal) to
   reach the dashboard. On the orb screen, `GET /api/voices` should show
   `active: true` for every persona whose `VOIZ_AGENT_ID_*` you've set — an
   orb missing its env var renders "Coming soon" and can't be confirmed.
2. At step 5/13 ("Round 1: Voice Agent") the app fires the real call
   (`triggerRealCall()` in [public/js/dashboard.js](public/js/dashboard.js)),
   dialing whichever agent the selected orb resolved to
   (`server/routes/call.js`). Watch the terminal running the server — a 200
   or 202 from VOIZ confirms the key/agent/SIP trunk are all correct for that
   persona. A 401/403 means the key is wrong; a 404 usually means that
   persona's agent_id doesn't exist yet.
3. The call-status line above the tab row should update from "Dialing…" to
   "Call in progress…" via the SSE stream. If it never updates past
   "Dialing…", the `/api/call/:id/events` SSE connection or `store.js` isn't
   wiring through — check browser devtools Network tab for the EventSource.
4. To test the webhook path without waiting for a real call to finish: send
   a manual POST to `/api/webhooks/voiz` shaped like the `call_completed`
   example in the platform guide, signed with `VOIZ_WEBHOOK_SECRET` using
   HMAC-SHA256 over the raw JSON body, header `X-Voiz-Signature: sha256=<hex>`.
   A 200 back confirms signature verification and the escalation-check logic
   both work end to end (check `/api/escalations` afterward if the test
   payload's `disposition` is in the escalation list).

**Real call transcript/outcome panel — done 2026-09-05.** The left column
now has a "Real Call Outcome" card (`#realTranscriptCard` in
`public/index.html`, `renderRealCallSummary()` in `public/js/dashboard.js`)
— hidden until a real call completes, then shows outcome badges
(escalated/resolved/sentiment/NBA/answered) and the real transcript, fed by
the same SSE stream the call-status line already used. Verified live: fed a
real call record through the actual running server's webhook route and
watched it render in the browser via the real SSE push, not a simulated
call. Resets (hides again) on every new dashboard run.

## 3. What to build next, in order

This follows the PRD's own Phase 0–6 build order, filtered to what's still
open after the scope decisions in §1.

### Phase 0 — Agent registration (done)
Neha, Swara and Vikram are all registered and working (`VOIZ_DEFAULT_AGENT_ID`
/ `VOIZ_AGENT_ID_SWARA` / `VOIZ_AGENT_ID_VIKRAM`, real call recordings exist
in `recordings/`). Meera and Ritu were removed from the roster 2026-09-08
(never had a registered agent or a correctly-matched recording). If another
persona is added later, register it via `POST /api/agents` (platform guide
§3.1). The moment each is registered:
1. Set its `VOIZ_AGENT_ID_*` var in `.env` (see §2 table).
2. That's it — the orb activates itself, no code change (see §1).

### Phase 0.5 — Branch scripts (the actual open item from last conversation)
This is what's blocking real per-persona *conversation* behavior (the orb→
agent plumbing above is separate and already done). When ready to write
these:
- Each branch (pay-now, negotiate, escalate) plus one off-script fallback
  needs a `prompt_text`, `first_message`, and `variables[]` in the
  `/api/agents` payload shape (guide §3.1).
- Decide whether branches are separate *agents* (fits the current
  one-agent-per-orb model, `agentIdsByVoice` in `server/config.js`) or
  separate *behaviors within* one agent's prompt — the PRD assumes the
  former (§6 Phase 0: "one per demo branch"), so default to that unless
  Kamal says otherwise.
- Decide the escalation trigger values and update
  `ESCALATION_DISPOSITIONS` in `server/routes/webhook.js` — currently a
  placeholder guess (`HUMAN_ESCALATION_REQUESTED`, `UNRESOLVED`) pending the
  full disposition enum from the Voiz-Agents team (PRD open question).

### Phase 1 — Booth trigger integration
Mostly done (`triggerRealCall()` + `/api/call`). Remaining: confirm the 200
vs 202 UI states actually look right at the booth — right now both just set
a text line, no distinct visual treatment. Worth a pass once Phase 0 is live
and you can trigger a real queued response to look at.

### Phase 3 — WhatsApp (Vobiz) — code done, waiting on template approval
BSP is Vobiz (not Gupshup/Twilio/Interakt as the PRD's options listed — this
was decided directly). `WHATSAPP_CHANNEL_ID` / `WHATSAPP_WABA_ID` are set in
`.env`, and **auth is confirmed working** — a live verification text send to
`+918879185247` succeeded 2026-09-05 (`201`, real `wamid`,
`meta_error_code: null`).

**Templates are single-dynamic-body by design.** The dashboard's scripted
timeline has 4 borrower archetypes (technical/systemic/disputed/unreachable
— `personaPacks()` in `public/js/dashboard.js`), each with different Round-2
and hand-off wording, and the hand-off goes to either the borrower or the
human agent depending on which archetype fires. Rather than one Meta
template per archetype variant, each of the 3 templates in
`server/whatsappTemplates.js` has a body that's just `{{1}}` — the exact
on-screen text (`s.live.lines.join('\n')`) is sent as that one variable.
What the attendee sees on screen IS what goes out, byte-for-byte, for any
archetype, with no separate copy to keep in sync as the script evolves.

Two send paths exist, both going through `server/lib/whatsapp.js`'s
`sendTemplate()`:

1. **Scripted-timeline sends** (`POST /api/whatsapp/send`,
   `server/routes/whatsapp.js`) — fired from `public/js/dashboard.js`'s
   `triggerWhatsApp()` at steps 4/8/10 (idx 3/7/9):
   - idx 3 → `paymentReminder` (identical across all 4 archetypes)
   - idx 7 → `followup` (Round 2, always to the borrower)
   - idx 9 → `followup` if `s.live.audience === 'borrower'` (technical/
     systemic — resolves without a human), else `escalation` (disputed/
     unreachable)
   Client sends `message` (the exact on-screen text) plus `name`/`phone` —
   same trust boundary as `POST /api/call`, the only recipient a client can
   pick for reminder/followup is themselves. Escalation is the exception:
   `to` is always `config.whatsapp.humanAgentNumber` server-side, the
   client's `message` text is trusted but the recipient never is.
2. **Real-outcome escalation** (`server/routes/webhook.js` →
   `whatsapp.sendHandoffMessage()`) — fires when a real `call_completed`
   webhook's disposition matches `ESCALATION_DISPOSITIONS`. Still blocked on
   Phase 0.5 (no real dispositions exist yet).

**These 3 templates must be submitted in Meta Business Manager and approved
(24-48h) before `WHATSAPP_MODE` can go `live` for template sends** — submit
them now, don't wait. (Free-form `text` sends, used only for the manual
verification path, don't need template approval — see
`docs/WHATSAPP_API_REFERENCE.md`.)

A strict rate limiter (`server/lib/whatsappRateLimit.js`) gates every send:
per-minute, per-case, and per-day caps (`WHATSAPP_MAX_PER_*` in `.env`,
defaults 5/3/30). This applies in mock mode too, so it's already been
exercised — a 4th send to the same case in mock mode correctly returns
`{status: 'blocked', reason: '...'}` instead of sending.

**Mock/live toggle**: `server/lib/whatsappModeState.js` holds a runtime-only
override, flippable from the dashboard topbar (📱 WhatsApp: MOCK/LIVE button,
next to Direct VOIZ Call — confirms before arming live, pulses red while
armed) or via `GET`/`POST /api/whatsapp/mode`. Deliberately NOT persisted —
resets to whatever `.env`'s `WHATSAPP_MODE` says on every restart, so a
server crash/redeploy can never leave live mode silently armed.

**Remaining before this is fully live — and a real blocker found 2026-09-05:**
A live test run (all 3 templates, real Meta API) returned real rejections,
not successes:
```
kollect_demo_payment_reminder → 132000 "Number of parameters does not match the expected number"
kollect_demo_followup         → 132001 "Template name does not exist in the translation"
kollect_demo_case_escalation  → 132001 "Template name does not exist in the translation"
```
Reading: `payment_reminder` IS registered in Meta and approved, but with a
different variable count than this code sends (1, full-message-as-{{1}}) —
likely the earlier 2-variable design from before the single-dynamic-body
redesign, if that's what got submitted. `followup`/`escalation` don't exist
under language `en` at all — never submitted, or submitted under a
different name/language code. **Needs Kamal to check exactly what's
registered in Meta Business Manager (name, language, variable count) before
code can be fixed to match** — this isn't guessable from here.
- Once that's resolved: fill in `WHATSAPP_AUTH_ID`/`WHATSAPP_AUTH_TOKEN`
  (already done) and flip `WHATSAPP_MODE=live` (or use the runtime toggle)
  for template sends.
- Free-form `text` sends (the manual verification path) are unaffected by
  this — that one already works, confirmed 2026-09-05.
- **Reminder**: driving through the dashboard's scripted timeline also
  fires a real VOIZ call at step 5, regardless of WhatsApp mode. Testing
  WhatsApp live means a real call happens too — not a separate opt-in.
- No delivery/read status is wired yet. The webhook side for that
  (`message.status` events — `X-Webhook-Signature` header, HMAC-SHA256 over
  raw body, per Vobiz's docs) isn't built — same pattern as
  `server/routes/webhook.js`'s VOIZ handler, but this needs a route AND a
  one-time `POST /api/v1/messaging/webhooks` registration call once a
  public URL exists to register.
- No visible send-status UI yet (unlike the call's status line) — sends are
  fire-and-forget with only a `console.log`/`console.warn`. Worth adding if
  demoing the WhatsApp side needs to be visibly proven working, not just
  trusted.

### Phase 4 — Outcome-driven branching
Not started, and blocked on Phase 0.5. Once real `disposition`/`sentiment`/
`ptp_amount`/`ptp_date` values come back from real calls, replace the fixed
13-step scripted timeline in `public/js/dashboard.js` (`steps()`) with logic
that branches on those fields instead. Don't attempt this before Phase 0.5 —
there's nothing real to branch on yet.

### Phase 5 — Reliability / fallback toggle
Not started. Needs a UI control to fall back to the old fully-scripted
timeline (already sitting in `steps()`) if live infra fails mid-event. Low
effort, do this last once everything else is proven to work — don't build a
fallback for infrastructure that hasn't been exercised yet.

### Phase 6 — Rehearsal
Run all branches with real phone numbers once Phase 0.5 exists. Time each
one against the PRD's 35–70s target window.

## 4. Don't do yet

- Don't build live-transcript streaming (LiveKit data channel subscription) —
  explicitly deferred, see §1.
- Don't build the real WhatsApp BSP integration before templates are
  Meta-approved — there's nothing to test against.
- Don't add authentication/multi-tenant handling — this is a single-booth
  demo app, not KollectBackend/KollectFrontend, and stays that way per PRD
  scope (§2.2 out of scope).
