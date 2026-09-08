const fetch = require('node-fetch');
const config = require('../config');
const { LIMITS, parseLine, buildPrompt, buildNoAnswerPrompt } = require('./analysisPrompts');

// Real-call path only (see implementation_plan.md) — never called for
// mock/simulated demo runs. Narrates the real transcript; never fabricates
// Structured Data / Signals, and its output never drives escalation logic.
//
// Secondary provider as of 2026-09-08 — glmClient.js (GLM 5 via AWS Bedrock)
// is tried first when configured, this is the fallback (see callOutcome.js
// analyzeWithFallback). Prompt text and wire-format parsing are shared with
// glmClient.js via analysisPrompts.js so the two providers can never drift
// apart on what they're asked for or how the response is read.
//
// 4000 was the original budget (2x the ~2s typical measured via direct curl
// testing) but a real booth call timed out against it in practice — real
// requests carry connection/DNS/TLS overhead a repeated local curl doesn't
// show, and a real conversation transcript runs longer than the synthetic
// ones used to pick 4000. 8000 keeps a genuine ~4x margin over the ~2-2.5s
// typical instead of a razor's-edge one. Streaming (below) also means a
// slow/long transcript shows partial progress well before this deadline
// instead of the dashboard sitting on a single silent wait. See
// implementation_plan.md.
const TIMEOUT_MS = 8000;

// Shared core: POST the given prompt to Gemini's streaming endpoint, parse
// "LABEL: value" lines as they complete, call onPartial per field the
// instant it's ready, and resolve with the final merged result. Used by both
// analyzeCallTranscriptStreaming (real transcript) and
// analyzeNoAnswerStreaming (no transcript, call went unanswered) — they only
// differ in which prompt they hand in.
async function streamLabeledCompletion(promptText, onPartial) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const result = {};

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:streamGenerateContent?alt=sse&key=${config.gemini.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.4,
          // Compact field extraction, not reasoning — 2.5 Flash's default
          // "thinking" mode burned 300+ hidden tokens and ~3.6s on a 6-line
          // transcript in testing (direct curl, 2026-09-07). Disabling it
          // dropped the same request to ~2s with no quality loss here.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) {
      clearTimeout(timer);
      const body = await res.text().catch(() => '');
      console.error(`[geminiClient] HTTP ${res.status}`, body.slice(0, 300));
      return { status: 'unavailable', reason: `http_${res.status}` };
    }

    let sseBuffer = '';   // holds a partial SSE "event" (data: {...}\n\n) across chunks
    let lineBuffer = '';  // holds a partial output LINE across SSE events

    const flushCompleteLines = (endOfStream) => {
      let newlineIdx;
      // eslint-disable-next-line no-cond-assign
      while ((newlineIdx = lineBuffer.indexOf('\n')) !== -1) {
        const line = lineBuffer.slice(0, newlineIdx);
        lineBuffer = lineBuffer.slice(newlineIdx + 1);
        const parsed = parseLine(line);
        if (parsed) {
          result[parsed.key] = parsed.value;
          onPartial({ [parsed.key]: parsed.value });
        }
      }
      if (endOfStream && lineBuffer.trim()) {
        const parsed = parseLine(lineBuffer);
        if (parsed) {
          result[parsed.key] = parsed.value;
          onPartial({ [parsed.key]: parsed.value });
        }
        lineBuffer = '';
      }
    };

    for await (const chunk of res.body) {
      // The real API sends \r\n\r\n between SSE events (confirmed via a raw
      // hexdump, 2026-09-07) — \n\n alone never matched, so sseBuffer just
      // grew forever and nothing ever got parsed. Normalize the ACCUMULATED
      // buffer (not each raw chunk before appending) so a \r\n split across
      // two chunk boundaries still gets caught. Safe either way: the
      // framing is the only place \r shows up; JSON string content itself
      // escapes newlines as literal \n, never a raw CR byte.
      sseBuffer = (sseBuffer + chunk.toString('utf8')).replace(/\r\n/g, '\n');
      let sepIdx;
      // eslint-disable-next-line no-cond-assign
      while ((sepIdx = sseBuffer.indexOf('\n\n')) !== -1) {
        const eventBlock = sseBuffer.slice(0, sepIdx);
        sseBuffer = sseBuffer.slice(sepIdx + 2);
        for (const rawLine of eventBlock.split('\n')) {
          if (!rawLine.startsWith('data:')) continue;
          const jsonStr = rawLine.slice(5).trim();
          if (!jsonStr) continue;
          let evt = null;
          try { evt = JSON.parse(jsonStr); } catch (e) { continue; }
          const text = evt && evt.candidates && evt.candidates[0]
            && evt.candidates[0].content && evt.candidates[0].content.parts
            && evt.candidates[0].content.parts[0] && evt.candidates[0].content.parts[0].text;
          if (typeof text === 'string') {
            lineBuffer += text;
            flushCompleteLines(false);
          }
        }
      }
    }
    flushCompleteLines(true);
    clearTimeout(timer);

    const capturedAny = Object.keys(result).length > 0;
    if (!capturedAny) {
      console.error('[geminiClient] stream ended with no parseable fields');
      return { status: 'unavailable', reason: 'invalid_schema' };
    }
    return { status: 'ready', ...result, latencyMs: Date.now() - startedAt };
  } catch (err) {
    clearTimeout(timer);
    const reason = err.name === 'AbortError' ? 'timeout' : 'network_error';
    console.error(`[geminiClient] ${reason}:`, err.message);
    // Even on abort/error, surface whatever fields streamed in before it hit —
    // still better than dropping real partial progress on the floor.
    const capturedAny = Object.keys(result).length > 0;
    return capturedAny
      ? { status: 'ready', ...result, latencyMs: Date.now() - startedAt, reason }
      : { status: 'unavailable', reason };
  }
}

// Returns { status:'ready', sentiment, summary, nextBestAction,
// nextBestActionReason, whatsappCopy, disputeDetected, latencyMs }
// or { status:'unavailable', reason } — callers must treat 'unavailable'
// as "keep showing whatever real VOIZ data is already on screen", never
// as "fall back to scripted archetype text".
async function analyzeCallTranscriptStreaming(input, onPartial) {
  onPartial = onPartial || (() => {});
  if (!config.gemini.apiKey) return { status: 'unavailable', reason: 'no_api_key' };
  if (!input || !input.transcript || !input.transcript.trim()) {
    return { status: 'unavailable', reason: 'no_transcript' };
  }
  return streamLabeledCompletion(buildPrompt(input), onPartial);
}

// The call rang and nothing was said — no transcript exists, so
// analyzeCallTranscriptStreaming can't run (and shouldn't: there's nothing
// to summarize). This is the dedicated path for that case: composes a
// natural, grounded-in-reality follow-up ("we tried calling, no answer, here's
// the ask again") instead of the caller silently falling back to a scripted
// happy-path message that assumes engagement that never happened. Same
// wire format/guardrails as the transcript path, different prompt.
async function analyzeNoAnswerStreaming(input, onPartial) {
  onPartial = onPartial || (() => {});
  if (!config.gemini.apiKey) return { status: 'unavailable', reason: 'no_api_key' };
  return streamLabeledCompletion(buildNoAnswerPrompt(input || {}), onPartial);
}

module.exports = { analyzeCallTranscriptStreaming, analyzeNoAnswerStreaming, LIMITS };
