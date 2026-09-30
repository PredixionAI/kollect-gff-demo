const state = {
  name: '',
  phone: '',
  voice: null, // { id, name, meta, lang, provider, voiceId, sample, ttsLang, pastel }
  useCase: 'collections', // 'collections' | 'sales' — picked on screen-usecase, 2026-09-30
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
  // The direct-call FAB/overlay (public/js/landing.js) live at the body
  // level so they render at real mobile scale outside #app's transform —
  // but that also means, unlike the old inline button, they have no
  // natural relationship to which screen is active. Without this they'd
  // float on top of every screen (found while testing the new use-case
  // screen, 2026-09-30), not just the landing page they belong to.
  const fab = document.getElementById('btnDirectCallFab');
  if (fab) fab.style.display = id === 'screen-landing' ? '' : 'none';
  if (id !== 'screen-landing') {
    const overlay = document.getElementById('directCallOverlay');
    if (overlay) overlay.style.display = 'none';
  }
}
