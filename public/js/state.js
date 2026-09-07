const state = {
  name: '',
  phone: '',
  voice: null, // { id, name, meta, lang, provider, voiceId, sample, ttsLang, pastel }
  archetype: null, // full archetype object
  callId: null,
  geminiAnalysis: null, // {status:'ready'|'unavailable', sentiment, summary, nextBestAction, whatsappCopy, ...} — real-call path only, see implementation_plan.md
};

// Top-bar stepper: everything before the active screen is done. The
// soft-launch intro belongs to "Identity"; it has no step of its own.
const STEP_ORDER = ['capture', 'orbs', 'archetype', 'persona', 'dash'];
function syncStepper(key) {
  const navKey = key === 'softlaunch' ? 'capture' : key;
  const idx = STEP_ORDER.indexOf(navKey);
  document.querySelectorAll('#stepper .stepper__step').forEach(el => {
    const i = STEP_ORDER.indexOf(el.dataset.step);
    el.classList.toggle('is-active', i === idx);
    el.classList.toggle('is-done', i > -1 && i < idx);
  });
  document.querySelectorAll('#stepper .stepper__line').forEach((el, i) => {
    el.classList.toggle('is-done', i < idx);
  });
}

function goTo(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  const key = id.replace('screen-', '');
  document.body.dataset.screen = key;
  syncStepper(key);
}
document.body.dataset.screen = 'capture';
syncStepper('capture');
