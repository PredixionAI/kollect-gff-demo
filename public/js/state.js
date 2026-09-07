const state = {
  name: '',
  phone: '',
  voice: null, // { id, name, meta, lang, provider, voiceId, sample, ttsLang, pastel }
  archetype: null, // full archetype object
  callId: null,
  geminiAnalysis: null, // {status:'ready'|'unavailable', sentiment, summary, nextBestAction, whatsappCopy, ...} — real-call path only, see implementation_plan.md
};

function goTo(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.body.dataset.screen = id.replace('screen-', '');
}
