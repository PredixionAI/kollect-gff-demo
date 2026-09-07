const state = {
  name: '',
  phone: '',
  voice: null, // { id, name, meta, lang, provider, voiceId, sample, ttsLang, pastel }
  archetype: null, // full archetype object
  callId: null,
  geminiAnalysis: null, // {status:'ready'|'unavailable', sentiment, summary, nextBestAction, whatsappCopy, ...} — real-call path only, see implementation_plan.md
};

// Screen order drives the sidebar: everything before the active step is done.
// The soft-launch intro has no nav item of its own; it belongs to "Identity".
const STEP_ORDER = ['capture', 'orbs', 'archetype', 'persona', 'dash'];
const STEP_LABEL = { capture: 'Identity', softlaunch: 'Introduction', orbs: 'Voice', archetype: 'Borrower role', persona: 'Case file', dash: 'Live dashboard' };

function syncShell(screenId) {
  const key = screenId.replace('screen-', '');
  const navKey = key === 'softlaunch' ? 'capture' : key;
  const idx = STEP_ORDER.indexOf(navKey);
  document.querySelectorAll('#stepNav .ds-nav__item').forEach(item => {
    const i = STEP_ORDER.indexOf(item.dataset.step);
    item.classList.toggle('is-active', i === idx);
    item.classList.toggle('is-done', i > -1 && i < idx);
  });
  const crumb = document.getElementById('crumbScreen');
  if (crumb) crumb.textContent = STEP_LABEL[key] || key;
  document.body.dataset.screen = key;
}

function goTo(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  syncShell(id);
}
syncShell('screen-capture');
