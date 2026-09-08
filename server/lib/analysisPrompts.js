// Shared between geminiClient.js and glmClient.js — the prompt text and the
// "LABEL: value" wire-format parsing are provider-agnostic (they're just
// instructions to an LLM and a fixed text format), so both providers stay
// byte-for-byte consistent instead of two prompts silently drifting apart.
// Only the HTTP transport (how each API is called and how its streaming
// chunks are shaped) differs between the two client files.

// Hard character ceilings, enforced below regardless of what the model
// returns — the prompt asks for these too, but the model is not trusted to
// obey on its own.
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
const LINE_RE = /^([A-Z_]+):\s?(.*)$/;

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

// No transcript exists here — the call rang and nothing was said (unanswered,
// declined, voicemail, cancelled...). This must NOT pretend a conversation
// happened or fall back to the scripted happy-path narrative (which assumes
// the borrower engaged) — it has to read as what actually occurred: one
// attempt, no reply, moving forward from there. Grounded in the one real
// message already sent, so the second message reads as a continuation of an
// actual thread, not a generic restart.
function buildNoAnswerPrompt({ borrowerName, language, dueAmount, dueDate, firstMessageText, callEndReason }) {
  return `A collections call to a borrower just ended WITHOUT being answered — no conversation happened, there is no transcript. Do not invent one.
Output EXACTLY 6 lines, in this exact order, nothing before or after, one field per line, plain text only, no markdown, no bullet points:
SENTIMENT: <2-4 words describing the SITUATION, not a mood that was never observed, e.g. "Unresponsive, first attempt", max ${LIMITS.sentiment} chars>
SUMMARY: <one sentence stating plainly that the call went unanswered, max ${LIMITS.summary} chars>
NBA: <the next best action given no response yet, action title only, max ${LIMITS.nextBestAction} chars>
NBA_REASON: <one short clause on why, max ${LIMITS.nextBestActionReason} chars, e.g. "no pickup on first attempt, try a written nudge before escalating">
DISPUTE: false
WHATSAPP: <a short natural follow-up message that acknowledges the missed call and restates the ask, max ${LIMITS.whatsappCopy} chars, matching the tone/language of "${language || 'Hinglish'}">

Do not pad any field. Do not repeat the borrower's name more than once total across all 6 lines. Never claim the borrower said anything, agreed to anything, or expressed any sentiment — nothing was said. WHATSAPP must read as a natural continuation of the thread below (same tone, doesn't repeat it word for word, doesn't contradict it), acknowledging that a call was just attempted and there was no answer — not a generic restart as if this were the first contact.

Known facts (real, not to be second-guessed): borrower is ${borrowerName || 'the borrower'}; amount due ₹${dueAmount}; due date ${dueDate}; call ended: ${callEndReason || 'no answer'}.

The one message already sent to this borrower before the call (for tone/context only — do not repeat it):
${firstMessageText || '(none sent yet)'}`;
}

module.exports = { LIMITS, FIELD_MAP, LINE_RE, sanitizeText, parseLine, buildPrompt, buildNoAnswerPrompt };
