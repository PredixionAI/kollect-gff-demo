const config = require('../config');

// In-memory, single-process — fine for a booth demo. Deliberately strict:
// this exists because a bug that loops a WhatsApp send spends real money
// on Meta's per-conversation pricing, unlike everything else in this app.
const state = {
  dayKey: null,
  dayCount: 0,
  minuteWindowStart: 0,
  minuteCount: 0,
  perCase: new Map(), // caseKey -> count
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// caseKey should be something stable per real-world case (e.g. call_id or
// the recipient phone number) — NOT per message, or the per-case cap does
// nothing.
function checkAndConsume(caseKey) {
  const now = Date.now();
  const day = todayKey();
  if (state.dayKey !== day) { state.dayKey = day; state.dayCount = 0; }
  if (now - state.minuteWindowStart >= 60_000) { state.minuteWindowStart = now; state.minuteCount = 0; }

  const perCaseCount = state.perCase.get(caseKey) || 0;

  if (state.dayCount >= config.whatsapp.maxPerDay) {
    return { allowed: false, reason: `daily cap reached (${config.whatsapp.maxPerDay}) — raise WHATSAPP_MAX_PER_DAY if this is expected` };
  }
  if (state.minuteCount >= config.whatsapp.maxPerMinute) {
    return { allowed: false, reason: `per-minute cap reached (${config.whatsapp.maxPerMinute})` };
  }
  if (perCaseCount >= config.whatsapp.maxPerCase) {
    return { allowed: false, reason: `per-case cap reached (${config.whatsapp.maxPerCase}) for ${caseKey}` };
  }

  state.dayCount += 1;
  state.minuteCount += 1;
  state.perCase.set(caseKey, perCaseCount + 1);
  return { allowed: true };
}

module.exports = { checkAndConsume };
