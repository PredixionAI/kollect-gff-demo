const fetch = require('node-fetch');
const config = require('../config');

// Real-call path only (see implementation_plan.md) — never called for
// mock/simulated demo runs. Narrates the real transcript; never fabricates
// Structured Data / Signals, and its output never drives escalation logic.
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

// Hard character ceilings, enforced below regardless of what the model
// returns — the prompt asks for these too, but the model is not trusted to
// obey on its own (see "Guardrails" in implementation_plan.md).
const LIMITS = {
  sentiment: 40,
  summary: 110,
  nextBestAction: 70,
  nextBestActionReason: 100,
  whatsappCopy: 220,
};

// Streamed as plain labeled lines, not JSON — a JSON blob is only valid once
// the whole thing has arrived, which defeats the point of streaming it.
// Fixed order: cheapest/most-useful-first (sentiment, then summary, then
// NBA) so the dashboard fills in the visible-first fields before the
// (unused-until-later) WhatsApp copy even finishes generating.
const FIELD_MAP = {
  SENTIMENT: { key: 'sentiment', limit: LIMITS.sentiment, type: 'string' },
  SUMMARY: { key: 'summary', limit: LIMITS.summary, type: 'string' },
  NBA: { key: 'nextBestAction', limit: LIMITS.nextBestAction, type: 'string' },
  NBA_REASON: { key: 'nextBestActionReason', limit: LIMITS.nextBestActionReason, type: 'string' },
  DISPUTE: { key: 'disputeDetected', limit: null, type: 'boolean' },
  WHATSAPP: { key: 'whatsappCopy', limit: LIMITS.whatsappCopy, type: 'string' },
};
const LINE_RE = /^([A-Z]+):\s?(.*)$/;

function sanitizeText(value, maxLen) {
  if (typeof value !== 'string') return '';
  let out = value
    .replace(/[*_`#]/g, '')            // strip markdown artifacts
    .replace(/https?:\/\/\S+/gi, '')   // strip URLs — never let a real send carry a link the model invented
    .replace(/[\r\t]+/g, ' ')          // no line breaks inside a field (line's already \n-delimited by the wire format)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control characters
    .replace(/\s*[—–]\s*/g, ', ') // em/en dash -> comma; LLM output commonly reaches for one and none should appear anywhere in this demo
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')            // a comma immediately after another (e.g. text already ended in one before the dash)
    .trim();
  if (maxLen && out.length > maxLen) out = out.slice(0, maxLen - 1).trimEnd() + '…';
  return out;
}

// Turns one complete "LABEL: value" line into a clean {key, value} patch, or
// null if the line doesn't match a known label — unrecognized lines are
// skipped, not fatal, since the model occasionally adds stray text.
function parseLine(line) {
  const match = LINE_RE.exec(line.trim());
  if (!match) return null;
  const field = FIELD_MAP[match[1]];
  if (!field) return null;
  const raw = match[2] || '';
  const value = field.type === 'boolean' ? /^true$/i.test(raw.trim()) : sanitizeText(raw, field.limit);
  return { key: field.key, value };
}

function buildPrompt({ transcript, borrowerName, language, dueAmount, dueDate, callDurationSeconds, answered }) {
  return `You are summarizing ONE completed collections call for a compact dashboard UI with hard space limits, not a report.
Output EXACTLY 6 lines, in this exact order, nothing before or after, one field per line, plain text only, no markdown, no bullet points:
SENTIMENT: <2-4 words, e.g. "Cooperative, mildly anxious", max ${LIMITS.sentiment} chars>
SUMMARY: <one sentence, max ${LIMITS.summary} chars>
NBA: <the next best action, action title only, max ${LIMITS.nextBestAction} chars>
NBA_REASON: <one short clause on WHY this action, not what it is, max ${LIMITS.nextBestActionReason} chars, e.g. "customer promised Friday, so remind Thursday evening">
DISPUTE: <true or false — true only if the borrower explicitly disputed the charge's validity>
WHATSAPP: <the actual follow-up message to send, max ${LIMITS.whatsappCopy} chars, matching the tone/language of "${language || 'Hinglish'}">

Do not pad any field. Do not repeat the borrower's name more than once total across all 6 lines. If the call didn't cover something (e.g. no promise-to-pay date mentioned), leave that reasoning out rather than speculating. Ground every claim in the transcript below — never invent a date, amount, or promise the transcript doesn't contain.

WHATSAPP must carry out NBA, not just acknowledge the call — it is the message that actually executes that action (e.g. if NBA is "send a reminder ahead of Friday's promised payment", WHATSAPP is that reminder, referencing the specific date/amount from the call, not a generic thank-you). This is a real message going to the real borrower, not a summary of what happened.

Known facts (real, not to be second-guessed): borrower is ${borrowerName || 'the borrower'}; amount due ₹${dueAmount}; due date ${dueDate}; call ${answered ? 'was answered' : 'was not answered'}; duration ${callDurationSeconds || 0}s.

Transcript:
${transcript}`;
}

// Streams the model's output and calls onPartial({sentiment}|{summary}|
// {nextBestAction}|{disputeDetected}|{whatsappCopy}) the instant each field's
// line completes — well before the whole response finishes, especially on a
// long transcript. Resolves once the stream ends with the FINAL merged
// result: {status:'ready', ...whateverFieldsArrived, latencyMs} if at least
// one field was captured, or {status:'unavailable', reason} if none was
// (network error, timeout, or the model produced nothing usable). A
// call that captured 3 of 5 fields still resolves 'ready' with those 3 —
// same "some fields real, some still scripted" pattern this dashboard
// already uses elsewhere (e.g. Structured Data stays scripted while
// Communication History goes real); callers only ever act on fields that
// are actually present, never assume completeness.
async function analyzeCallTranscriptStreaming(input, onPartial) {
  const noop = () => {};
  onPartial = onPartial || noop;

  if (!config.gemini.apiKey) return { status: 'unavailable', reason: 'no_api_key' };
  if (!input || !input.transcript || !input.transcript.trim()) {
    return { status: 'unavailable', reason: 'no_transcript' };
  }

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
        contents: [{ parts: [{ text: buildPrompt(input) }] }],
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

module.exports = { analyzeCallTranscriptStreaming, LIMITS };
