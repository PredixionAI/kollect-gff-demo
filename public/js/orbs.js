// Built-in fallback voices (shown when /api/voices returns nothing useful)
const BUILTIN_ORBS = [
  { id:'priya',   name:'Neha',   lang:'Hinglish', meta:'Hinglish · Female', active:true,  pastel:'#ff9eb5', ttsLang:'hi-IN', sample:'Namaste! Main Neha bol rahi hoon, Predixion Fincorp ki taraf se.' },
  { id:'swara',   name:'Swara',   lang:'Hindi', meta:'Hindi · Female', active:true,  pastel:'#8ecbff', ttsLang:'hi-IN', sample:'Namaste, main Swara bol rahi hoon, Predixion Fincorp ki taraf se.' },
  { id:'aditi',   name:'Aditi',   lang:'Marathi',  meta:'Marathi · Female',active:true,  pastel:'#8ef0c4', ttsLang:'mr-IN', sample:'Namaskar, mi Aditi boltey, Predixion Fincorp kadun.' },
  { id:'karthik', name:'Karthik', lang:'Tamil',    meta:'Tamil · Male',    active:false, pastel:'#a99bd6' },
  { id:'deepa',   name:'Deepa',   lang:'Kannada',  meta:'Kannada · Female',active:false, pastel:'#d6ab8e' },
];

let orbList = [];
let orbIndex = 0;

async function initOrbs(){
  try {
    const res = await fetch('/api/voices');
    const apiVoices = await res.json();
    if(Array.isArray(apiVoices) && apiVoices.length > 0){
      // Merge API voices into orb structure
      orbList = apiVoices.map((v, i) => ({
        id: v.id,
        name: v.name,
        lang: v.lang || 'Hinglish',
        meta: v.meta || 'Voice Agent',
        // Only callable once the server has a real VOIZ agent_id for this
        // persona (server/config.js agentIdsByVoice) — see routes/voices.js.
        active: !!v.active,
        pastel: BUILTIN_ORBS[i % BUILTIN_ORBS.length].pastel,
        ttsLang: v.ttsLang || BUILTIN_ORBS[i % BUILTIN_ORBS.length].ttsLang || 'hi-IN',
        sample: v.sample || BUILTIN_ORBS[i % BUILTIN_ORBS.length].sample || '',
        // Real recording of this agent's own voice (its actual introduction
        // line from a real VOIZ call, trimmed) — takes priority over the
        // Web Speech API fallback in playOrbSample() below. null for
        // personas without a captured recording yet.
        sampleAudio: v.sampleAudio || null,
      }));
    } else {
      orbList = BUILTIN_ORBS;
    }
  } catch(e) {
    orbList = BUILTIN_ORBS;
  }
}

function renderOrbCarousel(autoplay){
  if(autoplay === undefined) autoplay = true;
  if(!orbList.length){ orbList = BUILTIN_ORBS; }
  const track = document.getElementById('orbCarousel');
  track.innerHTML = '';
  let frontOrb = null, frontEl = null;
  orbList.forEach((o, i) => {
    const offset = i - orbIndex;
    const dist = Math.abs(offset);
    const scale = offset === 0 ? 1 : Math.max(0.5, 1 - dist * 0.22);
    const z = -dist * 70;
    const x = offset * 122;
    const opacity = Math.max(0.28, 1 - dist * 0.3);
    // Showcase (play a sample) is driven by whether there's a REAL
    // recording — not the Web Speech TTS fallback, and not whether a real
    // VOIZ agent is registered. Those are different things: "active" below
    // still gates whether this persona can actually be CONFIRMED and dialed
    // (server/routes/call.js 500s with no configured agent_id), but a real
    // recorded voice is worth showcasing long before its agent is
    // registered — TTS-only personas (no recording yet) still say
    // "Coming soon" since there's nothing genuine to showcase yet.
    const canShowcase = !!o.sampleAudio;
    const el = document.createElement('div');
    // .disabled (grayscale + "not-allowed" cursor) matches "Coming soon" now
    // — an orb with a real recording reads as fully alive even before its
    // agent is registered, since there's genuinely something to hear.
    el.className = 'orb' + (canShowcase ? '' : ' disabled') + (offset === 0 ? ' front' : '');
    el.style.setProperty('--pastel', o.pastel || '#8ecbff');
    el.style.transform = 'translate(-50%,-50%) translate3d(' + x + 'px,0,' + z + 'px) scale(' + scale + ')';
    el.style.opacity = opacity;
    el.style.zIndex = 100 - dist;
    el.innerHTML =
      '<div class="orb-sphere"><div class="orb-glow"></div></div>' +
      '<div class="orb-label">' +
        '<div class="oname">' + o.name + '</div>' +
        '<div class="olang">' + o.lang + '</div>' +
        (canShowcase
          ? (offset === 0 ? '<button class="orb-play" type="button" data-role="play">&#9654; Replay</button>' : '')
          : '<div class="osoon">Coming soon</div>') +
        (!o.active && canShowcase ? '<div class="osoon osoon-pending">Agent pending</div>' : '') +
      '</div>';
    el.addEventListener('click', (e) => {
      if(e.target.closest('[data-role="play"]')){ playOrbSample(o, el); return; }
      if(offset !== 0){ orbIndex = i; renderOrbCarousel(); return; }
      // Already the front orb — clicking the sphere itself (not just the
      // small Replay button) should also (re)play the sample.
      if(canShowcase) playOrbSample(o, el);
    });
    if(offset === 0){ frontOrb = o; frontEl = el; }
    track.appendChild(el);
  });
  // Confirming still requires a real registered VOIZ agent — showcasing the
  // voice doesn't mean it can actually be dialed yet.
  document.getElementById('btnOrbNext').disabled = !orbList[orbIndex].active;
  state.voice = orbList[orbIndex];
  // Autoplay-on-arrival matches what's actually shown: only orbs with a
  // visible Replay button (a real recording) play automatically — staying
  // silent for "Coming soon" ones instead of TTS-narrating them unprompted.
  if(autoplay && frontOrb && frontOrb.sampleAudio){
    playOrbSample(frontOrb, frontEl);
  }
}

let _orbAudioEl = null;

function playOrbSample(o, el){
  if (window.track) track('voice_sample_played', { orbName: o.name, isAutoplay: false });
  const sphere = el.querySelector('.orb-sphere');
  const btn = el.querySelector('[data-role="play"]');
  document.querySelectorAll('.orb-sphere').forEach(s => s.classList.remove('speaking'));
  sphere.classList.add('speaking');
  if(btn) btn.classList.add('playing');
  let done = false;
  function stopGlow(){
    if(done) return; done = true;
    sphere.classList.remove('speaking');
    if(btn) btn.classList.remove('playing');
  }

  // Real recording of the agent's own voice — preferred whenever available.
  if(o.sampleAudio){
    if(_orbAudioEl){ _orbAudioEl.pause(); _orbAudioEl = null; }
    if('speechSynthesis' in window) window.speechSynthesis.cancel();
    const audio = new Audio(o.sampleAudio);
    _orbAudioEl = audio;
    audio.addEventListener('ended', stopGlow);
    audio.addEventListener('error', stopGlow);
    // Safety net only — real playback ends via 'ended' above, this just
    // guards against a stuck glow if the clip fails to fire that event.
    setTimeout(stopGlow, 15000);
    audio.play().catch(stopGlow);
    return;
  }

  // Fallback: no recording yet for this persona, speak the sample text.
  setTimeout(stopGlow, 1900);
  try {
    if('speechSynthesis' in window && o.sample){
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(o.sample);
      utter.lang = o.ttsLang || 'hi-IN';
      utter.rate = 1; utter.pitch = 1;
      utter.onend = stopGlow; utter.onerror = stopGlow;
      window.speechSynthesis.speak(utter);
    }
  } catch(e) {}
}

function stepOrb(delta){
  const next = Math.max(0, Math.min(orbList.length - 1, orbIndex + delta));
  if(next !== orbIndex){
    orbIndex = next;
    if (window.track) track('voice_browsed', { newOrbName: (orbList[next] || {}).name, direction: delta > 0 ? 'right' : 'left' });
    renderOrbCarousel();
  }
}

document.getElementById('orbPrev').addEventListener('click', () => stepOrb(-1));
document.getElementById('orbNext').addEventListener('click', () => stepOrb(1));

const _orbCarousel = document.getElementById('orbCarousel');
let _orbWheelLock = false;
_orbCarousel.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if(Math.abs(delta) < 12 || _orbWheelLock) return;
  _orbWheelLock = true;
  stepOrb(delta > 0 ? 1 : -1);
  setTimeout(() => _orbWheelLock = false, 260);
}, { passive:false });

let _orbDragStartX = null;
_orbCarousel.addEventListener('pointerdown', (e) => { _orbDragStartX = e.clientX; });
_orbCarousel.addEventListener('pointerup', (e) => {
  if(_orbDragStartX === null) return;
  const dx = e.clientX - _orbDragStartX;
  if(Math.abs(dx) > 40){ stepOrb(dx < 0 ? 1 : -1); }
  _orbDragStartX = null;
});

document.getElementById('btnOrbNext').addEventListener('click', () => {
  if (window.track) track('voice_confirmed', { voiceName: (state.voice || {}).name, voiceLang: (state.voice || {}).lang });
  if (window.track) track('archetype_screen_entered', {});
  goTo('screen-archetype');
  buildArchetypes();
});

// Initialise orbs (fetch from API, then build DOM silently)
initOrbs().then(() => renderOrbCarousel(false));
