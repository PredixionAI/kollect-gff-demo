// Ported from kollect-demo.html 2026-09-05, then reimagined: Kinetic-style
// word-mask headlines, a single persistent "journey orb" that spawns real
// dashboard-agent chips per stage (replacing the old per-beat mini-cards/
// funnel/channel-cards), and an agent-swarm halo behind it all. Self-
// contained: only enterSoftLaunch() is called from outside (capture.js).
let softLaunchTimer = null;
let introBeatTimers = [];

function enterSoftLaunch(){
  goTo('screen-softlaunch');
  if (window.track) track('intro_start', {});
  unlockBeatAudio();
  runSoftLaunch();
}

/* =========================================================
   PER-BEAT VOICEOVER — one real recording per beat (public/audio/intro/),
   synced 1:1 to whichever beat is on screen. Whatever changes the beat
   (auto-timer, a tap, Skip Intro) must also change the audio — there's a
   single entry point (playBeatAudio) called from showBeat() below, so every
   caller of showBeat automatically gets synced audio for free, and a single
   stopBeatAudio() for the one path that leaves the beats entirely
   (Skip Intro) instead of moving to another beat.

   Deployed-environment bug (2026-09-08): beat 1 played fine on auto-advance
   (its showBeat() call happens synchronously inside the "Start the
   simulation" button's click handler — a real user gesture), but beats 2-5
   auto-advance via a setTimeout with no gesture in the call stack at all,
   so the browser's autoplay policy silently blocked `.play()` on those —
   confirmed by the exact symptom reported: audio only ever played on a
   manual tap (content.onclick below, itself a real click handler), never
   on the untouched auto-timer. A user gesture only reliably unlocks the
   SPECIFIC <audio> element it plays, not "audio in general" for the page,
   so the fix is to pre-create and silently play+pause every beat's element
   once, synchronously inside that same initial click (unlockBeatAudio,
   called from enterSoftLaunch above) — every later programmatic .play() on
   those same (already-unlocked) elements then succeeds even from a timer.
========================================================= */
let _introAudioEl = null;
const INTRO_FADE_MS = 180; // "soft" start/stop, not a hard cut — long enough to be felt, short enough to still feel synced to the tap
let _introFadeTimer = null;
const _beatAudioPool = {}; // src -> pre-created, pre-unlocked <audio> element

function unlockBeatAudio(){
  // beat1 deliberately excluded: it plays synchronously inside this exact
  // same click handler (enterSoftLaunch -> runSoftLaunch -> showBeat(0),
  // right after this function returns), so it never needed unlocking. The
  // very first version of this fix primed beat1 here too — its priming
  // play() and the real playBeatAudio() play() landed on the same <audio>
  // element in the same tick, and the priming call's own pause() (in the
  // .then() below) won the race and silenced the real playback moments
  // after it started. Regression found and fixed same day.
  const srcs = [
    '/audio/intro/beat2.wav', '/audio/intro/beat3.wav',
    '/audio/intro/beat4.wav', '/audio/intro/beat5.wav', '/audio/intro/beat6.wav',
    '/audio/intro/beat7.wav',
  ];
  srcs.forEach(src => {
    if(_beatAudioPool[src]) return; // already unlocked from an earlier run (e.g. replaying the intro)
    const el = new Audio(src);
    el.volume = 0;
    _beatAudioPool[src] = el;
    // Play+immediately pause while still inside the click's gesture context
    // — this is what actually unlocks the element for a later, gesture-less
    // .play() call from setTimeout. The .catch is real: browsers vary on
    // whether even this succeeds, but it costs nothing to try, and
    // playBeatAudio's own .catch below still guards the real playback.
    el.play().then(() => { el.pause(); el.currentTime = 0; el.volume = 1; }).catch(() => {});
  });
}

function stopBeatAudio(){
  clearInterval(_introFadeTimer);
  if(!_introAudioEl) return;
  const el = _introAudioEl;
  _introAudioEl = null;
  const steps = 6;
  let i = 0;
  _introFadeTimer = setInterval(() => {
    i++;
    el.volume = Math.max(0, el.volume - 1 / steps);
    if(i >= steps){
      clearInterval(_introFadeTimer);
      el.pause();
    }
  }, INTRO_FADE_MS / steps);
}

function playBeatAudio(src){
  stopBeatAudio();
  if(!src) return;
  // Reuse the pre-unlocked element for this beat if unlockBeatAudio already
  // ran (the normal path); fall back to a fresh Audio() otherwise (e.g. if
  // this somehow gets called before enterSoftLaunch, or the pool doesn't
  // have this src) — worst case that one behaves like it did before this
  // fix, no worse off.
  const el = _beatAudioPool[src] || new Audio(src);
  el.currentTime = 0;
  el.volume = 0;
  _introAudioEl = el;
  el.play().then(() => {
    const steps = 6;
    let i = 0;
    const fadeIn = setInterval(() => {
      if(_introAudioEl !== el){ clearInterval(fadeIn); return; } // superseded by a later beat mid-fade
      i++;
      el.volume = Math.min(1, i / steps);
      if(i >= steps) clearInterval(fadeIn);
    }, INTRO_FADE_MS / steps);
  }).catch(() => {}); // autoplay can be blocked in some browsers — the visuals still work without it
}

function renderWaveformConstant(){
  const el = document.getElementById('ibWaveformConstant');
  if(!el || el.dataset.built) return; // build once, colors/toggles from then on
  el.dataset.built = '1';
  const heights = [13, 25, 19, 33, 23, 16, 27, 12, 8, 6, 5, 4, 3, 3];
  el.innerHTML = heights.map((h, i) => {
    const opacity = Math.max(.32, 1 - i * 0.045).toFixed(2);
    return `<div class="ib-wave-bar" style="height:${h}px; opacity:${opacity}; animation-delay:${(i*0.07).toFixed(2)}s"></div>`;
  }).join('');
}

/* Word-level mask reveal (Kinetic exploration) — each word gets its own
   overflow-hidden mask + staggered transition-delay, so a headline cascades
   into place word by word instead of fading in as one flat block. */
function wordSpans(text){
  return text.split(' ').map((w, i) => `<span class="ib-word-mask"><span class="ib-word" style="transition-delay:${i*40}ms">${w}</span></span>`).join(' ');
}

/* Cluster of glass agent-orbs — each assigned a different behavior, so it reads as many
   distinct processes running at once, not one animation repeated. Positioned as a halo
   around the center text (top/bottom/sides), using the whole screen instead of one huddle. */
const AGENT_ORB_LAYOUT = [
  // top band, above the headline
  {x:12, y:8,  s:32}, {x:30, y:4,  s:26}, {x:50, y:9,  s:36}, {x:70, y:5,  s:28}, {x:88, y:9,  s:24},
  // side bands, level with the text but off to the edges
  {x:4,  y:32, s:40}, {x:6,  y:52, s:34}, {x:94, y:30, s:38}, {x:93, y:54, s:44},
  // bottom band, below the badge
  {x:14, y:74, s:42}, {x:33, y:88, s:30}, {x:52, y:78, s:46}, {x:70, y:90, s:32}, {x:87, y:76, s:38},
];
const AGENT_ORB_TYPES = ['type-pulse','type-spin','type-blink','type-orbit'];
function renderAgentBackground(){
  const el = document.getElementById('ibAgentsBg');
  if(!el || el.dataset.built) return; // build once, reused across the sequence
  el.dataset.built = '1';
  const cluster = document.createElement('div');
  cluster.className = 'ib-agent-cluster';
  cluster.id = 'ibAgentCluster';
  cluster.innerHTML = AGENT_ORB_LAYOUT.map((o, i) => {
    const delay = (i * 0.35).toFixed(2);
    const glowDelay = (i * 0.25).toFixed(2);
    const type = AGENT_ORB_TYPES[i % AGENT_ORB_TYPES.length];
    const orbitR = (o.s / 2 + 4).toFixed(0);
    return `<div class="ib-agent-orb ${type}" style="left:${o.x}%; top:${o.y}%; width:${o.s}px; height:${o.s}px; animation-delay:${delay}s, ${glowDelay}s; --orbit-r:${orbitR}px;"></div>`;
  }).join('');
  el.appendChild(cluster);

  // 3D touch — the whole halo tilts toward the pointer, like the voice-orb carousel
  document.addEventListener('pointermove', (e) => {
    const screenEl = document.getElementById('screen-softlaunch');
    if(!screenEl || !screenEl.classList.contains('active')) return;
    const rect = screenEl.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    cluster.style.transform = `rotateY(${(px * 10).toFixed(1)}deg) rotateX(${(-py * 7).toFixed(1)}deg)`;
  });
}

const JOURNEY_R = 66, JOURNEY_C = 2 * Math.PI * JOURNEY_R;

/* One re-strategize loop icon, shared by every "loop" chip — a plain
   refresh glyph, colored via the chip's own --ch through normal CSS
   custom-property inheritance rather than an inline fill. */
const LOOP_ICON = `<svg class="ib-chip-loop-icon" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>`;

/* Fills #ibJourneyChips for the current beat — cleared and rebuilt each
   stage change (agents don't persist across stages, they spawn fresh per
   stage) with a small spread + stagger so they read as several agents
   arriving together, not one after another in a queue. */
function renderChips(b){
  const chipsEl = document.getElementById('ibJourneyChips');
  chipsEl.innerHTML = '';
  if(!b.agents) return;
  const total = b.agents.length + (b.loop ? 1 : 0);
  const spreads = { 1:[0], 2:[-45,45], 3:[-70,0,70], 4:[-90,-30,30,90] };
  const dx = spreads[total] || spreads[3];
  const makeChip = (label, idx, isLoop) => {
    const chip = document.createElement('div');
    chip.className = 'ib-chip' + (isLoop ? ' loop' : '');
    chip.style.setProperty('--ch', b.ch || 'var(--blue)');
    chip.style.setProperty('--dx', dx[idx] + 'px');
    chip.style.transitionDelay = (idx * 90) + 'ms';
    chip.innerHTML = isLoop ? `${LOOP_ICON}${label}` : `<span class="ib-chip-dot"></span>${label}`;
    chipsEl.appendChild(chip);
  };
  b.agents.forEach((name, idx) => makeChip(name, idx, false));
  if(b.loop) makeChip('Re-strategizing', b.agents.length, true);
  // Same synchronous-reflow reveal as the headline (see showBeat below) —
  // no rAF, so this can't silently stall if the tab isn't actively rendering.
  void chipsEl.offsetWidth;
  [...chipsEl.children].forEach(c => c.classList.add('show'));
}

function runSoftLaunch(){
  const firstName = (state.name || '').split(' ')[0] || 'there';
  const stage = document.getElementById('ibStage');
  const content = document.querySelector('#screen-softlaunch .sl-content');
  const journey = document.getElementById('ibJourney');
  const journeyProgress = document.getElementById('ibJourneyProgress');
  const journeySphere = document.getElementById('ibJourneySphere');
  const agentsBg = document.getElementById('ibAgentsBg');
  const waveEl = document.getElementById('ibWaveformConstant');
  journey.classList.remove('show');
  journeyProgress.style.strokeDasharray = JOURNEY_C;
  journeyProgress.style.strokeDashoffset = JOURNEY_C;
  journeyProgress.style.stroke = 'var(--blue)';
  stage.innerHTML = '';
  agentsBg.classList.remove('show');
  waveEl.classList.remove('wave-blue', 'wave-hidden');
  renderAgentBackground();
  renderWaveformConstant();

  // Every stage's copy and agent roster is pulled straight from the real
  // dashboard's own 13-step process (public/js/dashboard.js STEPS) so the
  // intro previews exactly what the dashboard later shows, not an invented
  // parallel story.
  const beats = [
    { text:'Collection across DPD buckets has always cost lenders more than it should.',
      sub:'One strategy was never built to fit every borrower.',
      dur:4800, audio:'/audio/intro/beat1.wav' },
    { text:'Kollect is a platform of specialized agents, working in perfect harmony.',
      sub:'Proactive. Personalized. Outcome-based by design.',
      dur:4800, revealAgents:true, audio:'/audio/intro/beat2.wav' },
    { text:'It starts with Borrower 360: every touchpoint, pulled in at once.',
      sub:'CIBIL · CRM · Dashboards · User history',
      stage:'b360', ch:'var(--blue)',
      agents:['Default Detection Agent','Data Orchestration Agent','Classification Agent'],
      dur:5000, hideWave:true, audio:'/audio/intro/beat3.wav' },
    { text:'Then Strategy builds a pitch that actually sounds personal.',
      sub:'Tone · Language · Timing · Channel',
      stage:'strategy', ch:'var(--purple)',
      agents:['Strategy Gen Agent','Tone Calibration','NBA Ranking Agent'],
      dur:5000, audio:'/audio/intro/beat4.wav' },
    { text:"Execution isn't one attempt. It's a proactive loop designed to re-strategized after every touchpoint.",
      sub:'WhatsApp · Voice · Recalculated in real time',
      stage:'execution', ch:'var(--amber)',
      agents:['Friendly Reminder Agent','Speech Analyzer','Escalation Agent'], loop:true,
      dur:7000, audio:'/audio/intro/beat5.wav' },
    { text:'Until Fulfilment: resolved without drop-offs, without friction.',
      sub:'Reconciled · Reported · Audited',
      stage:'fulfilment', ch:'var(--green)',
      agents:['Reconciliation Agent','Reporting Agent','Audit Agent'],
      dur:5000, audio:'/audio/intro/beat6.wav' },
    { text:'This is Kollect.', sub:`Welcome, ${firstName}. Let's show you what it feels like.`, dur:5400, audio:'/audio/intro/beat7.wav' },
  ];
  const initialDelay = 600;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  clearTimeout(softLaunchTimer);
  introBeatTimers.forEach(t => clearTimeout(t));
  introBeatTimers = [];

  function showBeat(i){
    if(i >= beats.length) return;
    const b = beats[i];
    const isLast = i === beats.length - 1;
    playBeatAudio(b.audio); // every caller (auto-timer, tap, replay) goes through here, so audio always stays synced to whatever beat is actually on screen
    if(b.revealAgents){
      agentsBg.classList.add('show'); // fades in here, stays for the rest of the sequence
      waveEl.classList.add('wave-blue'); // the voice channel goes from dying (red) to live (blue), same moment
    }
    if(b.hideWave) waveEl.classList.add('wave-hidden'); // fades out here, stays hidden once the journey chips start
    // Direction hints where the beat came from — even indices arrive from the left,
    // odd from the right, so the sequence reads as one continuous pass rather than
    // seven identical fades. The payoff line gets its own climax treatment.
    const dir = reduceMotion ? '' : (i % 2 === 0 ? 'from-left' : 'from-right');
    stage.innerHTML = `
      <div class="ib-beat ${dir}" id="ibBeat">
        <div class="ib-headline${isLast ? ' ib-headline-climax' : ''}">${wordSpans(b.text)}</div>
        ${b.sub ? `<div class="ib-sub">${b.sub}</div>` : ''}
      </div>`;
    // Force the initial (opacity:0/blurred) state to actually commit before
    // flipping to .show, so the transition always plays. A requestAnimationFrame
    // here would depend on the tab actively rendering — it can silently never
    // fire (and the beat stays invisible forever) if the pane is backgrounded
    // at the wrong instant. A synchronous layout read has no such dependency.
    const beatEl = document.getElementById('ibBeat');
    if(beatEl){ void beatEl.offsetWidth; beatEl.classList.add('show'); }

    // The journey orb is the only progress indicator, and it's front and
    // center under the text the whole time — not a small peripheral thing.
    // Its ring fills per beat, its color shifts to the current stage's
    // color, and the sphere gets a small pulse each time work actually lands.
    journeyProgress.style.strokeDashoffset = JOURNEY_C - (JOURNEY_C * (i + 1)) / beats.length;
    journeyProgress.style.stroke = b.ch || 'var(--blue)';
    journeySphere.classList.remove('pulse');
    void journeySphere.offsetWidth;
    journeySphere.classList.add('pulse');
    renderChips(b);
  }

  // Sequential scheduling (not a pre-computed cumulative array) so a click can
  // cut the current beat short and move on without throwing off every beat
  // still queued behind it.
  let beatIndex = 0;
  function scheduleNext(delay){
    introBeatTimers.push(setTimeout(() => {
      beatIndex++;
      if(beatIndex < beats.length){
        showBeat(beatIndex);
        scheduleNext(beats[beatIndex].dur);
      } else {
        stopBeatAudio(); // leaving the beat sequence entirely — nothing left to stay synced to
        softLaunchTimer = setTimeout(() => { goTo('screen-orbs'); renderOrbCarousel(); }, 300);
      }
    }, delay));
  }

  setTimeout(() => journey.classList.add('show'), 150);
  showBeat(0);
  scheduleNext(initialDelay + beats[0].dur);

  // Tap/click anywhere advances the current beat immediately — an impatient
  // viewer isn't stuck waiting out a full beat with only "skip everything".
  // Bound to the whole content column (not just #ibStage) so clicking the
  // journey orb/chips also advances, not just the headline text.
  // .onclick (not addEventListener) so a replayed intro overwrites rather than stacks.
  content.onclick = () => {
    if(beatIndex >= beats.length - 1) return;
    introBeatTimers.forEach(t => clearTimeout(t));
    introBeatTimers = [];
    beatIndex++;
    if (window.track) track('intro_beat_tap', {});
    showBeat(beatIndex);
    scheduleNext(beats[beatIndex].dur);
  };
}

document.getElementById('btnSkipIntro').addEventListener('click', (e) => {
  e.stopPropagation(); // don't also trigger the stage's click-to-advance handler
  clearTimeout(softLaunchTimer);
  introBeatTimers.forEach(t => clearTimeout(t));
  introBeatTimers = [];
  stopBeatAudio(); // leaving the intro screen entirely, not just moving to another beat
  if (window.track) track('intro_skip', {});
  goTo('screen-orbs');
  if (window.track) track('voice_screen_entered', {});
  renderOrbCarousel();
});
