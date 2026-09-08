const fetch = require('node-fetch');
const config = require('../config');
const { parseLine, buildPrompt, buildNoAnswerPrompt } = require('./analysisPrompts');

// GLM 5 via AWS Bedrock's OpenAI-compatible endpoint — primary post-call
// analysis provider as of 2026-09-08 (see callOutcome.js analyzeWithFallback),
// with geminiClient.js as the fallback if this is unconfigured or fails.
// Prompt text and wire-format parsing are shared with geminiClient.js via
// analysisPrompts.js so the two providers can never drift on what they're
// asked for or how the response is read — only the HTTP transport below
// differs (OpenAI-style chat-completions streaming vs Gemini's own SSE shape).
//
// UNVERIFIED against the real endpoint as of this writing — built directly
// from AWS/Aivar's own docs (GLM5-Bedrock-API-Access-Documentation, 2026-09-07)
// and the OpenAI streaming chat-completions spec they claim compatibility
// with, but this project has been burned twice before by a "compatible"
// doc not matching real behavior (VOIZ's Bearer-vs-X-API-Key header, Vobiz's
// two different webhook systems) — confirm the SSE framing (plain \n\n vs
// \r\n\r\n) and the exact chunk shape against a real key before trusting
// this beyond a first smoke test, and update this comment once confirmed.
const TIMEOUT_MS = 8000;

// Shared core: POST the prompt to GLM 5's chat-completions endpoint with
// stream:true, parse "LABEL: value" lines as they complete from the
// standard OpenAI delta.content chunks, call onPartial per field the
// instant it's ready, and resolve with the final merged result.
async function streamLabeledCompletion(promptText, onPartial) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const result = {};

  try {
    const url = `${config.glm.baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.glm.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.glm.model,
        temperature: 0.4,
        stream: true,
        messages: [{ role: 'user', content: promptText }],
      }),
    });

    if (!res.ok) {
      clearTimeout(timer);
      const body = await res.text().catch(() => '');
      console.error(`[glmClient] HTTP ${res.status}`, body.slice(0, 300));
      return { status: 'unavailable', reason: `http_${res.status}` };
    }

    let sseBuffer = '';   // holds a partial SSE "event" (data: {...}\n\n) across chunks
    let lineBuffer = '';  // holds a partial output LINE across SSE events
    let doneSignaled = false;

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
      // Normalizing \r\n defensively, same reasoning as geminiClient.js —
      // unconfirmed whether this proxy sends \n\n or \r\n\r\n between events.
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
          if (jsonStr === '[DONE]') { doneSignaled = true; continue; }
          let evt = null;
          try { evt = JSON.parse(jsonStr); } catch (e) { continue; }
          const text = evt && evt.choices && evt.choices[0]
            && evt.choices[0].delta && evt.choices[0].delta.content;
          if (typeof text === 'string') {
            lineBuffer += text;
            flushCompleteLines(false);
          }
        }
      }
      if (doneSignaled) break;
    }
    flushCompleteLines(true);
    clearTimeout(timer);

    const capturedAny = Object.keys(result).length > 0;
    if (!capturedAny) {
      console.error('[glmClient] stream ended with no parseable fields');
      return { status: 'unavailable', reason: 'invalid_schema' };
    }
    return { status: 'ready', ...result, latencyMs: Date.now() - startedAt };
  } catch (err) {
    clearTimeout(timer);
    const reason = err.name === 'AbortError' ? 'timeout' : 'network_error';
    console.error(`[glmClient] ${reason}:`, err.message);
    // Even on abort/error, surface whatever fields streamed in before it hit —
    // still better than dropping real partial progress on the floor, and
    // matches geminiClient.js's own resilience here.
    const capturedAny = Object.keys(result).length > 0;
    return capturedAny
      ? { status: 'ready', ...result, latencyMs: Date.now() - startedAt, reason }
      : { status: 'unavailable', reason };
  }
}

// Same return shape and same no-op guards as geminiClient.js's equivalents —
// callOutcome.js's analyzeWithFallback treats both providers identically.
async function analyzeCallTranscriptStreaming(input, onPartial) {
  onPartial = onPartial || (() => {});
  if (!config.glm.apiKey) return { status: 'unavailable', reason: 'no_api_key' };
  if (!input || !input.transcript || !input.transcript.trim()) {
    return { status: 'unavailable', reason: 'no_transcript' };
  }
  return streamLabeledCompletion(buildPrompt(input), onPartial);
}

async function analyzeNoAnswerStreaming(input, onPartial) {
  onPartial = onPartial || (() => {});
  if (!config.glm.apiKey) return { status: 'unavailable', reason: 'no_api_key' };
  return streamLabeledCompletion(buildNoAnswerPrompt(input || {}), onPartial);
}

module.exports = { analyzeCallTranscriptStreaming, analyzeNoAnswerStreaming };
