/* Landing page behaviour.
   1. Mounts the scrollcraft engine on the page.
   2. The signature move: a sample Kollect call that writes itself under the
      reader's scroll. The engine publishes --sc-p (0..1) on the pinned "turn"
      act; each transcript line carries data-at, the progress at which it
      lands. The call status, the WhatsApp beat and the outcome stamps all
      hang off the same value, so scrolling backwards un-says the call. */

ScrollCraft.mount(document.body);

(function scrollDrivenCall(){
  const act = document.getElementById('turn');
  const root = act && act.querySelector('[data-call]');
  if(!act || !root) return;

  const lines   = Array.from(root.querySelectorAll('[data-at]')).map(el => ({ el, at: parseFloat(el.dataset.at) }));
  const status  = root.querySelector('[data-call-status]');
  const outcome = root.querySelector('[data-call-outcome]');
  const list    = root.querySelector('[data-call-lines]');
  const orbHolder = root.querySelector('[data-call-orb]');

  let orb = null;
  (function mountOrb(n){
    if(window.ThinkingOrb){ orb = window.ThinkingOrb.mount(orbHolder, { state: 'connecting', size: 20, theme: 'dark', label: 'Kollect agent' }); }
    else if((n||0) < 20) setTimeout(() => mountOrb((n||0)+1), 150);
  })();

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastP = -1, lastPhase = '';

  function phaseFor(p){
    if(p < 0.05) return 'dialing';
    if(p < 0.62) return 'talking';
    if(p < 0.78) return 'sending';
    if(p < 0.90) return 'talking';
    return 'done';
  }
  const STATUS = { dialing: 'Dialing…', talking: 'On call · 00:41', sending: 'Sending WhatsApp…', done: 'Call ended · 01:12' };
  const ORB    = { dialing: 'connecting', talking: 'listening', sending: 'working', done: 'breathing' };

  function render(p){
    for(const l of lines) l.el.classList.toggle('is-on', p >= l.at);
    // the not-yet-said line shows the agent "typing"
    let next = lines.find(l => p < l.at);
    for(const l of lines) l.el.classList.toggle('is-next', l === next && p > l.at - 0.08);
    outcome.classList.toggle('is-on', p >= 0.88);
    const phase = phaseFor(p);
    if(phase !== lastPhase){
      status.textContent = STATUS[phase];
      status.dataset.phase = phase;
      if(orb) orb.setState(ORB[phase]);
      lastPhase = phase;
    }
    // keep the newest line in view inside the phone
    const on = lines.filter(l => p >= l.at);
    if(on.length){ const last = on[on.length-1].el; list.scrollTop = Math.max(0, last.offsetTop - list.clientHeight + last.offsetHeight + 12); }
  }

  if(reduced){ render(1); return; }
  (function tick(){
    const p = parseFloat(getComputedStyle(act).getPropertyValue('--sc-p')) || 0;
    if(Math.abs(p - lastP) > 0.0005){ render(p); lastP = p; }
    requestAnimationFrame(tick);
  })();
})();

// Kollect card: the whole card is the link, keyboard included.
(function kollectCard(){
  const card = document.getElementById('agentKollect');
  if(!card) return;
  const go = () => { location.href = '/app.html'; };
  card.addEventListener('click', (e) => { if(!(e.target.closest('a'))) go(); });
  card.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } });
})();
