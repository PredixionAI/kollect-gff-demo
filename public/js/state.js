const state = {
  name: '',
  phone: '',
  voice: null, // { id, name, meta, lang, provider, voiceId, sample, ttsLang, pastel }
  archetype: null, // full archetype object
  callId: null,
  geminiAnalysis: null, // {status:'ready'|'unavailable', sentiment, summary, nextBestAction, whatsappCopy, ...} — real-call path only, see implementation_plan.md
  // Opted in on the capture screen ("enroll for higher quality voice call")
  // or toggled later on the dashboard (btnEnhancedQualityToggle) — routes
  // the real call through ElevenLabs instead of VOIZ when true AND the
  // server actually has ElevenLabs configured; falls back to VOIZ
  // transparently otherwise (see server/routes/call.js). 2026-09-08.
  enhancedQuality: false,
};

function goTo(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
