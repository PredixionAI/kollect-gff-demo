# Implementation Plan: Gemini Post-Call Intelligence (Real-Call Path Only)

**Status: implemented and verified (fake-data integration tests, no real Gemini key configured yet — see "Verified" note at the bottom).**

## Decision

Integrate. Reasoning (from prior review, confirmed against `docs/VOIZ_API_REFERENCE.md`): on a real VOIZ call today, `customer_sentiment`, `next_best_action`, `dispute_description`, and every outcome flag come back `null`. `renderRealCallSummary()`'s `bits`/`next_best_action` checks never populate, so `_summaryIsReal`/`_nbaIsReal` never flip — **Summary and Next Best Action silently keep showing scripted archetype text forever, even after a genuine call.** Only the transcript, `answered`, `duration`, and `call_end_reason` are honestly real today. Gemini is the only way to make the *interpretation* of a real call as honest as the *fact* of the call.

Scope is deliberately narrow:
- **Only fires on the real-call path.** Mock/simulate mode is untouched — zero risk to the 95% of demo runs.
- **Only narrates/interprets the real transcript.** Never fabricates Structured Data, Purchasing Signals, or Payment Patterns (those stay backend-sourced/scripted).
- **Never drives control flow.** Gemini's read of dispute/PTP is displayed as text only. It is explicitly NOT wired into `ESCALATION_FLAGS`/state-machine branching in this phase — that stays a separate, deliberate decision later if ever made.

## A real blocker found while planning this: the SSE connection closes on first `completed` event

`public/js/dashboard.js`'s `subscribeToCallEvents()` calls `source.close()` the instant `update.status === 'completed'` arrives (line ~922). `server/lib/store.js`'s `updateCase()` re-emits the *entire* record on every patch, over the *same* `update:${callId}` bus event — which is how a second wave (Gemini analysis, arriving a beat after the real completion) was going to reach the browser. With the current code, it can't: the client tears down the connection before Gemini has had a chance to respond.

**Fix (required, do this first):** in `subscribeToCallEvents`, don't close on the first `completed` message. Close only when `update.geminiAnalysis` is present (analysis done) or after a hard client-side timeout (~5s) fires regardless — whichever comes first. This is what makes the two-stage reveal (real completion → AI catches up moments later) actually deliverable, and it's also the "showcase it's fast" mechanic: the audience sees the real call finish, then watches the AI-enhanced fields land visibly within ~1–2s.

```js
function subscribeToCallEvents(callId){
  const source = new EventSource(`/api/call/${callId}/events`);
  let analysisTimer = null;
  source.onmessage = (evt) => {
    const update = JSON.parse(evt.data);
    // ...existing initiated/queued/completed handling stays as-is...
    if(update.status === 'completed'){
      // existing renderRealCallSummary(update); markRealCallOutcome(update); ...
      if(update.geminiAnalysis){
        renderGeminiAnalysis(update.geminiAnalysis);
        clearTimeout(analysisTimer);
        source.close();
      } else if(!analysisTimer){
        setAnalysisPending(); // "✨ Analyzing transcript…" shimmer, see below
        analysisTimer = setTimeout(() => source.close(), 5000);
      }
    }
  };
}
```

Guard the side effects that already run in the `completed` branch (`track('call_outcome', ...)`, `markRealCallOutcome`) so they don't double-fire on the second wave — gate the analytics call behind `if(!update.geminiAnalysis)`, since `markRealCallOutcome`'s overwrite-in-place is already idempotent and safe to re-run.

## Data flow

1. `server/lib/callOutcome.js`'s `handleCallOutcome()` builds `updated` from real VOIZ fields exactly as it does today — **this still returns immediately**, unchanged. The real transcript/duration/answered render on the dashboard with zero added latency.
2. Immediately after, **fire-and-forget** (don't `await` inside the function that returns `updated`): if `transcriptText` is non-empty, call `geminiClient.analyzeCallTranscript({...})`. On success or failure, call `store.updateCase(callId, { geminiAnalysis: {...} })` — this alone re-triggers the SSE push via the existing bus, no new route needed.
3. `GET /api/call/:callId` (`server/routes/call.js`) already returns the full record via `store.getCase()` — `geminiAnalysis` rides along automatically once step 2 lands, so a late-joining client (page reload mid-demo) still gets it without a second real Gemini call.

## Prompt input (grounding)

Send Gemini only what's needed — real transcript plus known-true facts, so it narrates rather than guesses:

```json
{
  "transcript": "agent: ...\ncustomer: ...",
  "borrower_name": "Vatsal",
  "language": "hi-en",           // from state.voice/lang — keeps tone consistent with the rest of the scripted dialogue
  "due_amount": 45000,
  "due_date": "2026-09-05",
  "call_duration_seconds": 102,
  "answered": true
}
```

Do **not** send Structured Data (CRM/LMS/Bank), Purchasing Signals, or archetype metadata — those aren't the model's job and including them invites it to reference fabricated context in its output.

## Prompt instruction + output schema (minimal-character discipline)

Use `responseMimeType: "application/json"` with a `responseSchema` enforcing types, and instruct explicit length budgets in the prompt itself — but **do not trust the model to obey them**; enforce with a hard server-side truncate/reject pass after parsing (see Guardrails). Budgets below are starting points, grounded in this project's own scripted-text precedent (e.g. `f12Details:'Time to first payment: ~5h 30m from default'` ≈ 45 chars; `w2Lines` messages run ≈130–220 chars across archetypes) — verify final numbers empirically against the actual fitted containers (same `scrollHeight === clientHeight` method used all session), don't ship on the estimate alone.

**Correction made during implementation:** the original draft targeted "Phone step 6 (Call Analysis) terminal line" for `sentiment`. That surface doesn't exist — `renderStep()` only updates the phone pane for `s.live.type === 'chat'`; a `'terminal'`-type step (step 6 is one) leaves the phone showing whatever it last displayed, per the comment at `dashboard.js:733`. Step 6's scripted `sentAction`/`sentDetails` render into the shared `#actionText`/`#detailsText` boxes instead, which are reused by every step — writing sentiment there would leave stale text stuck on screen once the operator moves to step 7+. Retargeted to the surfaces that actually exist and are already scoped correctly for real-call data: `#rtOutcome` (the badge row above the transcript, already home to a `Sentiment: X` badge that never appears today since `customer_sentiment` is always null), `#summaryPointer`, `#nbaPointer`.

**Superseded by streaming, below** — kept here for the reasoning on *why* these specific ceilings, but the wire format is no longer JSON/`responseSchema`; see the "Streaming" section further down for what's actually implemented (`sentimentNote`/`nextBestActionReason` were dropped entirely, since neither was ever rendered anywhere).

| Field | Target budget | Feeds |
|---|---|---|
| `sentiment` | ≤ 40 chars, 2–4 words (e.g. "Cooperative, mildly anxious") | `#rtOutcome` badge |
| `summary` | ≤ 110 chars, one sentence | `#summaryPointer` (only overwrites if VOIZ's own fields left it un-set) |
| `nextBestAction` | ≤ 70 chars, action title only | `#nbaPointer` (same — only when not already real) |
| `whatsappCopy` | ≤ 220 chars, natural Hinglish/English matching `language` | Steps 7 & 9 phone WhatsApp bubble + real send — **step 9 only when `s.live.audience !== 'agent'`**; the agent-escalation handoff at step 9 is a structurally different case-summary message and is never overridden |
| `disputeDetected` | boolean, display-only | carried in `state.geminiAnalysis`, not wired to escalation logic |

Prompt instruction, verbatim intent (adapt into the actual system/user prompt in `geminiClient.js`):

> You are summarizing ONE completed collections call for a compact dashboard UI with hard space limits — not a report. Every field has a strict character ceiling; do not pad, do not repeat the borrower's name more than once total across all fields, no markdown, no bullet points, no line breaks inside a field, plain text only. If the call didn't cover something (e.g. no PTP date mentioned), leave that reasoning out rather than speculating. Match the tone and language mix of: "{language}". Ground every claim in the transcript — never invent a date, amount, or promise the transcript doesn't contain.

## Guardrails (enforce in `geminiClient.js`, after parsing, before it ever reaches `store.updateCase`)

- Hard character truncation per field (table above) regardless of what the model returned.
- Strip markdown artifacts (`*`, `` ` ``, `#`), URLs, and control characters — this text can reach a real WhatsApp send; a booth visitor's arbitrary spoken input must never let the model emit a link or formatting WhatsApp can't render cleanly.
- Schema validation (required keys present, correct types) — on any failure, mark the whole analysis `unavailable` and stop; never render a partially-parsed object.
- 4s hard timeout via `AbortController` on the Gemini request itself (Flash typically responds in 1–2s; 4s catches the tail without the client-side 5s SSE-close timer above ever needing to fire in the common case).

## Fallback behavior (must be explicit, this was the gap in the original draft)

If Gemini times out, errors, or fails validation: `geminiAnalysis` is set to `{ status: 'unavailable' }`. The dashboard falls back to **whatever real VOIZ data already rendered** (transcript, duration, connection status — all real, already on screen) — it must never fall back to the scripted archetype text for a call that genuinely happened. No prominent failure banner; a small muted "AI read unavailable" only if the field is inspected, not a headline failure state in front of the booth audience.

## Speed showcase mechanic

This is the concrete answer to "showcase the process is taking less time than usual":
1. The instant the real `completed` event lands (transcript/duration real, immediately), show a small pulsing "✨ Analyzing transcript…" chip next to Summary/NBA — `setAnalysisPending()` above.
2. Server records `analysisStartedAt`/`analysisCompletedAt` in `geminiClient.js`, computes `latencyMs`, includes it in `geminiAnalysis`.
3. When the second wave lands, swap the pending chip for **"✨ AI · analyzed in 1.3s"** — a real, honest, measured number, not a marketing claim. The contrast is inherent: the call itself took the full VOIZ conversation duration; the AI read of it lands about a second later. Don't fabricate a "normally takes 10 minutes" comparison — the real number next to the real call duration already makes the point.
4. Optional: type the WhatsApp copy onto the phone screen at step 8/10 with a brief typing-indicator beat before the message appears, rather than an instant paste — reinforces "live, not pre-recorded" without adding real latency (this is a ~400–600ms CSS/JS reveal, not a wait on the network).

## WhatsApp send race condition (steps 7 & 9)

`triggerWhatsApp(templateKey, message, stepIdx)` is called at stepIdx 3/7/9 with scripted `message`. Implemented as: `renderStep()` mutates `s.live.lines` to `[geminiAnalysis.whatsappCopy]` *before* both the phone-pane render and the `triggerWhatsApp` call further down read it — same array, so the displayed bubble and the actual send can never disagree. Gated three ways: (1) `state.geminiAnalysis.status === 'ready'`, (2) `s.live.audience !== 'agent'` (step 9's handoff case is excluded), (3) the step's own one-shot sent-flag (`whatsappRound2Sent` / `whatsappEscalationSent`) must still be false — once a step's message has actually gone out (scripted, because Gemini wasn't ready yet), revisiting that step via prev/next never repaints the bubble to text that wasn't what was actually sent.

## Files added / modified (as actually built)

- **NEW** `server/lib/geminiClient.js` — REST call to `gemini-2.5-flash` generateContent via `node-fetch` (matches the existing `voizClient.js` convention), `responseMimeType:'application/json'` + `responseSchema`, 4s `AbortController` timeout, `analyzeCallTranscript({transcript, borrowerName, language, dueAmount, dueDate, callDurationSeconds, answered})`. Exports `LIMITS` too, for anything that wants to reference the character ceilings. Short-circuits to `{status:'unavailable', reason:'no_api_key'|'no_transcript'}` near-instantly when there's no key or transcript — always called, never skipped (see the fix below).
- **MODIFY** `server/config.js` — `gemini: { apiKey: required('GEMINI_API_KEY', true), model: ... }`. Blank key warns once at boot (same pattern as every other optional key here), never throws.
- **MODIFY** `server/lib/callOutcome.js` — fire-and-forget call to `geminiClient.analyzeCallTranscript()` after `updated` is computed and returned; on resolve/reject, `store.updateCase(callId, { geminiAnalysis })`. **Bug caught during implementation and fixed**: an earlier version of this only called Gemini `if (config.gemini.apiKey && transcriptText)` — with no key configured (the common case until a real key is added), that skipped the call entirely, so `geminiAnalysis` never landed and the client's pending badge sat there for the full 5s ceiling before silently giving up. Fixed by always calling it — `geminiClient` itself resolves the no-key case almost instantly, so the pending badge clears right away instead.
- **MODIFY** `server/routes/call.js` — `POST /call` now reads `lang` from the request body and stores it on the case record, so `callOutcome.js` can pass the demo's actual language mix through to the Gemini prompt instead of guessing.
- **MODIFY** `public/js/dashboard.js` — `subscribeToCallEvents` two-wave fix; new `setAnalysisPending()` / `renderGeminiAnalysis(analysis)` (populates `#rtOutcome`, `#summaryPointer`, `#nbaPointer` only when VOIZ's own real fields left them unset, plus the speed badge); the WhatsApp-copy override inside `renderStep()` (see above); `triggerRealCall()` now sends `lang: personaLang()`.
- **MODIFY** `public/js/state.js` — added `geminiAnalysis: null` field.
- **MODIFY** `public/css/styles.css` — `.rt-badge.ai-badge` / `.rt-badge.ai-pending` (extend the existing `.rt-badge` pill, not a new banner style), `aiPendingPulse` keyframe gated behind `prefers-reduced-motion`.
- **MODIFY** `.env` / `.env.example` — `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-2.5-flash`.

## Verification plan

1. **Unit** — `geminiClient` against a canned transcript: confirm JSON shape, confirm truncation actually fires when the model over-answers (test with a deliberately verbose fake response).
2. **Fallback path** — force a timeout (stub a slow response) and a malformed-JSON response: confirm the dashboard never blanks, never hangs, and keeps showing real-but-unenhanced data.
3. **Race condition** — script-drive `goToStep` through 7/9 faster than Gemini's real latency: confirm WhatsApp send uses the scripted fallback, never blank.
4. **SSE two-wave delivery** — confirm the fix above actually delivers the second event (this was silently broken before the fix; test it explicitly, don't assume).
5. **Fit/overflow** — stress-test the character budgets at their ceiling (paste max-length fake values into all AI fields) across all 4 archetypes, verify via `scrollHeight === clientHeight`, same method used throughout this project — don't ship on the estimated budgets alone.
6. **Manual live call** — place a real test call, say something with a specific date/amount not in the scripted archetype (e.g. *"Friday ko 15,000 bhej dunga"*), confirm the WhatsApp message that actually sends references it, confirm the speed badge shows a real sub-2s number.

### Verified so far (no real GEMINI_API_KEY configured yet — steps 1–5 done, step 6 pending a real key + real call)

1. **Fire-and-forget confirmed non-blocking**: `handleCallOutcome()` against a fake completed call record returned in 2ms, unaffected by the Gemini call still resolving after it.
2. **Two-wave SSE delivery confirmed**: the same fake-call test observed exactly 2 `update:${callId}` bus events — real completion, then `geminiAnalysis` — proving the `subscribeToCallEvents` fix actually works, not just compiles.
3. **Guardrails confirmed against fake Gemini responses** (node-fetch stubbed, no network hit): an over-length response got truncated to every field's exact character ceiling with an ellipsis; markdown (`**`, `` ` ``, `#`) and a URL got stripped cleanly; a response missing a required field was rejected outright as `unavailable`/`invalid_schema`, never partially rendered.
4. **No-API-key path confirmed fast**: resolves to `{status:'unavailable', reason:'no_api_key'}` in ~2ms, so the client's pending badge clears immediately rather than waiting out the 5s ceiling.
5. **Frontend reveal confirmed** (fake `renderGeminiAnalysis()` call, no real network): pending badge appears on wave 1, gets replaced by `✨ AI · 1.3s` + sentiment badge on wave 2; `#summaryPointer`/`#nbaPointer` fill in with the `REAL` tag; the WhatsApp bubble at step 7 shows the Gemini copy; step 9's agent-handoff bubble correctly stays untouched. Zero overflow across all 4 archetypes, zero console errors.
6. **Real Gemini API round-trip — done, 2026-09-07, with two real bugs found and fixed (one from testing, one from an actual live call).**
   - **Bug 1 (found via curl):** first run against the real API timed out at the 4s ceiling every time. Direct `curl` against the endpoint isolated why: the exact request shape this app sends (our `responseSchema`, 6 required fields) took 3.6s on a 6-line transcript, driven by 2.5 Flash's default "thinking" mode (331 hidden reasoning tokens on that request) — the "1-2s" assumption in this doc's Prompt section was wrong for this schema shape. Fixed with `thinkingConfig:{thinkingBudget:0}` in `generationConfig` (this is compact field extraction, not a task that benefits from reasoning) — same request dropped to ~2s.
   - Re-ran the full `handleCallOutcome` flow against the real API after that fix: 2336ms latency, all 6 fields returned, within budget, genuinely grounded in the transcript (₹45,000, Friday, UPI — nothing invented). Confirmed visually too: Summary/NBA/sentiment badge/speed badge rendered correctly, and the step-8 WhatsApp bubble showed Gemini's copy correctly superseding the scripted "systemic" archetype's installment-offer text — which would've been actively wrong for that transcript (customer already promised full payment; script offers a 2-installment split anyway).
   - **Bug 2 (found on an actual live booth call, not a test):** a real call — a dispute that got transferred to a human executive — hit `[geminiClient] timeout: The user aborted a request.` in the server log. Summary/NBA stayed at "—" on the dashboard as a result (the correct fallback behavior, just triggered by a timeout that shouldn't have happened). A longer, more realistic dispute/escalation transcript measured via curl came back in 2.49s — still comfortably under 4s — so the real call likely hit connection/DNS/TLS overhead a repeated local curl doesn't show, on top of a longer real transcript than any transcript used to pick 4000ms. Fixed by raising `TIMEOUT_MS` to 8000 (server) and the client's SSE-close ceiling to 10000 (`dashboard.js`) — a real ~4x margin over the ~2-2.5s typical, instead of a razor's-edge one. Re-verified against a reconstructed version of the same dispute/transfer scenario: 2505ms, all fields correct, `disputeDetected: true`.

## Streaming (added 2026-09-07, in response to "if the transcript is too big, can you stream this")

Switched `analyzeCallTranscript` (single atomic JSON response) to `analyzeCallTranscriptStreaming(input, onPartial)` using Gemini's `:streamGenerateContent?alt=sse` endpoint. Motivation: on a longer/slower transcript, a single-shot call means one long silent wait before anything appears; streaming means Summary/NBA/sentiment fill in field by field as each finishes generating, which is both a better experience on a large transcript and a better "showcase it's fast, in real time" moment than a single reveal.

**Wire format changed from JSON to plain labeled lines** — `SENTIMENT: ...` / `SUMMARY: ...` / `NBA: ...` / `DISPUTE: true|false` / `WHATSAPP: ...`, one per line, fixed order (cheapest/most-visible field first). A JSON blob is only valid once the whole thing has arrived; streaming a schema-constrained JSON response the way this app was using it (`responseMimeType:'application/json'` + `responseSchema`) can't be progressively parsed mid-stream without a hand-rolled incremental JSON parser, which is a lot of fragile machinery for a booth demo. Plain lines let each field become usable the instant its own `\n` arrives — trivial and robust to parse incrementally.

**`geminiClient.js`** reads `res.body` as a Node stream (`for await (const chunk of res.body)`), accumulates SSE `data: {...}` events, extracts the incremental text delta from each, and appends it to a running line buffer. Every time a `\n` completes a line, that line is matched against the known labels, sanitized/truncated through the same `sanitizeText()` guardrail as before, and handed to `onPartial({fieldName: value})` immediately — well before the rest of the response finishes. `sentimentNote`/`nextBestActionReason` were dropped from the wire format entirely (they were never rendered anywhere — see the "Correction made during implementation" note above — keeping them would've just added parsing surface for two fields nothing uses).

**Real bug found and fixed while building this**: the first test streamed zero fields, every time, despite the raw API response visibly containing the right `SENTIMENT: ...` text when inspected via curl. A hexdump of the raw bytes found why — the real API separates SSE events with `\r\n\r\n`, not `\n\n`. The code was searching for `\n\n` only, so the event-boundary search never matched a single time and the whole response just piled up unprocessed in a buffer. Fixed by normalizing `\r\n`→`\n` on the accumulated buffer (not per-chunk, so a `\r\n` split across two chunk boundaries still gets caught) before searching for the `\n\n` separator.

**`callOutcome.js`** accumulates each `onPartial` patch into a `runningAnalysis` object (`status:'streaming'`) and pushes it via `store.updateCase` on every single field arrival — each one re-emits over the same SSE bus the real call-completion event already uses, no new endpoint needed. The final resolved value (`status:'ready'` if at least one field was ever captured, `'unavailable'` if none was) gets one last `store.updateCase`.

**`dashboard.js`** — `subscribeToCallEvents` no longer closes on the first sight of `geminiAnalysis`; it only closes once `geminiAnalysis.status` is `'ready'` or `'unavailable'` (both terminal), keeping the connection open across every intermediate `'streaming'` wave. `renderGeminiAnalysis` was rewritten to be safe to call repeatedly with partial data: every field write still checks `_summaryIsReal`/`_nbaIsReal` before writing (same idempotency as before), and every badge insert (`#aiSentimentBadge`, `#aiSpeedBadge`) is guarded against existing already, so re-rendering on each new wave never duplicates a badge.

**Verified against the real streaming API** (2026-09-07, dispute/business-trip transcript): 7 distinct waves observed — sentiment at +1.4s, summary/NBA/dispute clustered at +1.5s (arrived in the same chunk), WhatsApp copy completing the response at +1.86s total, final `status:'ready'` immediately after. Total time (1.86s) was actually *faster* than the earlier non-streaming call (2.3-2.5s) on a comparable transcript — streaming isn't a tradeoff against speed here, it's strictly better on both latency and perceived responsiveness. Confirmed in the browser too: sentiment badge appears first (while the pending pulse is still showing), Summary/NBA fill in next, pending badge clears and the real `✨ AI · Xs` speed badge appears only once, with no duplicate badges across the 3 waves tested.
