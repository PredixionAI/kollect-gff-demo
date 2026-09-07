/**
 * ARCHIVED — DO NOT RUN.
 *
 * This one-shot generator wrote the initial 6-screen version of
 * public/index.html + several public/js/*.js files from template strings.
 * It was never wired to write public/js/dashboard.js or public/css/styles.css
 * (despite this file's original header claiming otherwise, and despite the
 * final console.log below telling you to run a `css` argument that this
 * script never actually handles) — those two were always hand-edited
 * directly. Since the other files it writes were also hand-edited after
 * this ran once, running it again would silently overwrite that work with
 * stale content.
 *
 * public/ is now the single source of truth. Edit files under public/
 * directly. This file is kept only as a historical reference for how the
 * 6-screen flow was originally scaffolded.
 */
const fs = require('fs');
const path = require('path');

/* =========================================================
   1. public/index.html
   Six screens + modal + external scripts
========================================================= */
const indexHTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kollect &mdash; Live Agentic Collections Demo</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/styles.css">
</head>
<body>
<div id="app">

  <!-- ============ SCREEN 1: CAPTURE ============ -->
  <div class="screen active" id="screen-capture">
    <div class="brand">
      <div class="mark">&#945;</div>
      <div><div class="name">Predixion AI</div><div class="sub">Agentic Collections</div></div>
    </div>
    <div class="capture-box">
      <div class="pulse-ring">
        <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.7"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>
      </div>
      <h1>You&#x2019;re about to meet Kollect</h1>
      <p class="lead">Kollect is Predixion AI&#x2019;s voice agent for loan recovery. In a moment, it&#x2019;ll build a live case around <em>you</em> &mdash; enter your details and it&#x2019;ll actually reach out.</p>
      <div class="field">
        <label>Your name</label>
        <input type="text" id="inputName" placeholder="e.g. Vatsal" autocomplete="off" value="Vatsal">
      </div>
      <div class="field">
        <label>Phone number</label>
        <input type="tel" id="inputPhone" placeholder="+91 8879185247" autocomplete="off" value="+918879185247">
      </div>
      <div class="consent">
        <input type="checkbox" id="consentBox" checked>
        <label for="consentBox">I agree to be contacted on WhatsApp / voice by the Kollect demo agent for this live simulation only. No real debt, no real data retained beyond this event.</label>
      </div>
      <button class="btn-primary" id="btnStart">Start the simulation</button>
      <button class="btn-ghost" id="btnBypass" type="button">Skip &mdash; use demo defaults (Vatsal &middot; +91 8879185247)</button>
      <div class="foot-note">Step 1 of 5 &middot; Identity capture</div>
    </div>
  </div>

  <!-- ============ SCREEN 2: SOFT LAUNCH ============ -->
  <div class="screen" id="screen-softlaunch">
    <div class="sl-glow"></div>
    <div class="sl-content">
      <div class="sl-mark" id="slMark">&#945;</div>
      <div class="sl-line" id="slLine1">Welcome.</div>
      <div class="sl-line strong" id="slLine2">This is what it feels like to be our client.</div>
    </div>
    <button class="sl-skip" id="btnSkipIntro" type="button">Skip intro &#x2192;</button>
  </div>

  <!-- ============ SCREEN 3: ORB VOICE CAROUSEL ============ -->
  <div class="screen" id="screen-orbs">
    <div class="brand">
      <div class="mark">&#945;</div>
      <div><div class="name">Predixion AI</div><div class="sub">Agentic Collections</div></div>
    </div>
    <div class="orbs-head">
      <div class="eyebrow">Step 2 of 5 &middot; Voice selection</div>
      <h1>Choose your agent&#x2019;s voice</h1>
      <p>Scroll, drag, or tap either side to browse &mdash; each orb is a different voice, tone and language.</p>
    </div>
    <div class="orb-carousel-wrap">
      <div class="orb-nav" id="orbPrev">&#8249;</div>
      <div class="orb-carousel" id="orbCarousel"></div>
      <div class="orb-nav" id="orbNext">&#8250;</div>
    </div>
    <div class="orbs-actions">
      <button class="btn-primary" id="btnOrbNext" disabled>Confirm agent</button>
    </div>
  </div>

  <!-- ============ SCREEN 4: ARCHETYPE SELECT ============ -->
  <div class="screen" id="screen-archetype">
    <div class="brand">
      <div class="mark">&#945;</div>
      <div><div class="name">Predixion AI</div><div class="sub">Agentic Collections</div></div>
    </div>
    <div class="arch-head">
      <div class="eyebrow">Step 3 of 5 &middot; Choose your role</div>
      <h1>Which borrower are you today?</h1>
      <p>Pick how you&#x2019;ll respond when Kollect reaches out &mdash; this shapes how the demo plays out.</p>
    </div>
    <div class="arch-grid" id="archGrid"></div>
    <div class="arch-actions">
      <button class="btn-primary" id="btnArchNext" disabled>Continue</button>
    </div>
  </div>

  <!-- ============ SCREEN 5: PERSONA TYPEWRITER ============ -->
  <div class="screen" id="screen-persona">
    <div class="persona-box">
      <div class="persona-tag" id="personaTag">YOUR ROLE</div>
      <div class="persona-typewriter" id="personaTypewriter"><span class="cursor"></span></div>
      <div class="persona-numbers" id="personaNumbers">
        <div class="persona-num-box"><div class="k">Debt</div><div class="v" id="numDebt">&#x20b9;0</div></div>
        <div class="persona-num-box"><div class="k">Overdue</div><div class="v" style="color:var(--red)" id="numOverdue">0d</div></div>
        <div class="persona-num-box" id="bucketBox"><div class="k">Bucket</div><div class="v" id="numBucket">&mdash;</div></div>
        <div class="persona-num-box"><div class="k">Risk score</div><div class="v" style="color:var(--amber)" id="numRisk">0</div></div>
      </div>
      <div class="persona-bucket-caption" id="personaBucketCaption"></div>
      <div class="persona-actions" id="personaActions">
        <button class="btn-primary" id="btnPersonaNext">Enter the live dashboard &#x2192;</button>
      </div>
    </div>
  </div>

  <!-- ============ SCREEN 6: DASHBOARD ============ -->
  <div class="screen" id="screen-dash">
    <div class="topbar">
      <div class="tb-item">
        <div class="tb-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg></div>
        <div><div class="tb-title">Predixion AI</div><div class="tb-sub">Agentic Collections</div></div>
      </div>
      <div class="divider"></div>
      <div class="tb-item">
        <div class="tb-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 18h6"/></svg></div>
        <div><div class="tb-title">ABC Bank</div></div>
      </div>
      <div class="divider"></div>
      <div class="borrower-chip">
        <div class="tb-icon" style="background:var(--blue-dim); border:none;"><svg viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="1.8"><path d="M20 7h-3V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a1 1 0 0 0-1-1z"/></svg></div>
        <div><div class="bi" id="dashBorrowerName">Vatsal</div><div class="bs" id="dashBorrowerSub">&#x20b9;45,000 &middot; 1d overdue</div></div>
      </div>
      <div class="status-flex">
        <button class="btn-direct-trigger" id="btnOpenDirectCallModal">&#128222; Direct VOIZ Call</button>
        <div class="sync-pill"><svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.4"><path d="M21 12a9 9 0 1 1-2.6-6.4"/></svg>SYNCING</div>
        <div class="sync-detail" id="syncDetail">LMS: Reading account status</div>
        <div style="display:flex;align-items:center;gap:7px;"><div class="live-dot"></div><span class="live-label">Live</span></div>
        <div class="avatar-round">&#128266;</div>
        <div class="avatar-round" id="hkAvatar">HK</div>
      </div>
    </div>

    <div class="main-grid">
      <!-- LEFT COLUMN -->
      <div class="col">
        <div class="card scroll" id="leftPanelCard">
          <div class="status-badge" id="statusBadge">IN PROGRESS</div>
          <div class="profile-row">
            <div class="profile-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="1.8"><path d="M20 7h-3V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a1 1 0 0 0-1-1z"/></svg></div>
            <div>
              <div class="profile-name" id="leftName">Vatsal</div>
              <div class="profile-loc">&#128205; Pune, MH</div>
            </div>
          </div>
          <div class="class-box">
            <div class="k">Classification</div>
            <div class="v" id="classValue">Analyzing&hellip;</div>
          </div>
          <div class="stat-row">
            <div class="stat-box"><div class="k">Debt</div><div class="v">&#x20b9;45,000</div></div>
            <div class="stat-box"><div class="k">Overdue</div><div class="v" style="color:var(--red)" id="leftOverdue">1d</div></div>
            <div class="stat-box"><div class="k">Risk</div><div class="v risk" id="leftRisk">65</div></div>
          </div>
          <div class="section-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg>Borrower 360&deg;
            <span class="ingest-counter" id="ingestCounter">0/3</span>
          </div>
          <div class="data-group structured">
            <div class="gh">Structured Data &middot; History</div>
            <div class="dot-item" data-ingest="structured">LMS: 18-month clean history</div>
            <div class="dot-item" data-ingest="structured">CRM: Software engineer, &#x20b9;85k/mo</div>
            <div class="dot-item" data-ingest="structured">Bank: Savings &#x20b9;1.2L</div>
          </div>
          <div class="sys-sync">
            <div class="sync-chip"><div class="d"></div>LMS Connected</div>
            <div class="sync-chip"><div class="d"></div>CRM Active</div>
          </div>
        </div>
      </div>

      <!-- CENTER COLUMN -->
      <div class="col">
        <div class="call-status-line" id="realCallStatus" style="display:none;"><span class="dot"></span><span id="realCallStatusText"></span></div>
        <div class="tab-row" id="tabRow"></div>
        <div class="step-card">
          <div class="step-top">
            <div class="step-pill" id="stepPill">Step 1/13 &middot; Borrower 360</div>
            <div class="step-controls">
              <div class="ctrl-btn" id="btnPrev" title="Previous"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></div>
              <div class="ctrl-btn" id="btnPlay" title="Play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
              <div class="ctrl-btn" id="btnNext" title="Next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></div>
              <div class="ctrl-btn" id="btnReset" title="Restart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v6h-6"/></svg></div>
            </div>
          </div>
          <div class="progress-track"><div class="progress-fill" id="progressFill" style="width:7.6%"></div></div>
          <div class="step-title" id="stepTitle">Default Detection</div>
          <div class="step-subtitle" id="stepSubtitle">Payment of &#x20b9;45,000 missed on due date</div>
        </div>
        <div class="action-details">
          <div class="ad-box">
            <div class="ad-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>ACTION</div>
            <div class="ad-body" id="actionText">Initiating Borrower 360 analysis</div>
          </div>
          <div class="ad-box">
            <div class="ad-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>DETAILS</div>
            <div class="ad-body" id="detailsText">System triggers workflow automation</div>
          </div>
        </div>
        <div class="live-card" id="liveCardWrap">
          <div class="live-head" id="liveHead"><span class="live-head-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>LIVE INTERACTION</span></div>
          <div id="liveContent" style="flex:1; display:flex; flex-direction:column; min-height:0;"></div>
        </div>
      </div>

      <!-- RIGHT COLUMN -->
      <div class="col">
        <div id="rightDataPanels" class="right-panels-group">
          <div class="infra-strip">
            <span class="infra-strip-label">INFRA</span>
            <span id="infraStripText"></span>
          </div>
          <div class="card scroll" style="flex:1;">
            <div class="section-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>SIGNALS</div>
            <div class="data-group realtime-group">
              <div class="gh">Real-Time Activity</div>
              <div id="signalsList"></div>
            </div>
            <div class="data-group behavioral">
              <div class="gh">Behavioral Signals<span class="ingest-counter" id="behaviorCounter">0/3</span></div>
              <div class="dot-item" data-ingest="behavioral">App: Daily active user</div>
              <div class="dot-item" data-ingest="behavioral">Prefers WhatsApp</div>
              <div class="dot-item" data-ingest="behavioral">High engagement score</div>
            </div>
            <div class="data-group spending">
              <div class="gh">Spending Patterns</div>
              <div class="spend-stat-row">
                <div class="stat-box"><div class="k">Highest / Day</div><div class="v">&#x20b9;18,400</div></div>
                <div class="stat-box"><div class="k">Avg Daily Spend</div><div class="v">&#x20b9;2,150</div></div>
              </div>
            </div>
          </div>
        </div>
        <div id="rightPhonePanel" class="card right-phone-card" style="display:none;">
          <div class="phone-dock-head">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>
            <span id="phoneDockTitle">Borrower&#x2019;s phone</span>
          </div>
          <div class="phone-dock-body" id="phoneDockBody"></div>
        </div>
        <div class="footer-status">
          <span id="footStep">Step 1 of 13</span>
          <span id="footClass">Technical Defaulter</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ============ DIRECT CALL TRIGGER MODAL ============ -->
  <div class="modal-backdrop" id="directCallModal" style="display:none;">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title">
          <span class="icon">&#128222;</span>
          <div>
            <h3>VOIZ API Direct Call Trigger</h3>
            <p>Captures exact parameters &amp; dispatches directly to VOIZ backend</p>
          </div>
        </div>
        <button class="modal-close" id="btnCloseDirectCallModal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="dc-grid">
          <div class="dc-field">
            <label>Customer Phone Number (E.164)</label>
            <input type="text" id="dcPhone" value="+918879185247" placeholder="+91XXXXXXXXXX">
          </div>
          <div class="dc-field">
            <label>Customer Name</label>
            <input type="text" id="dcName" value="Vatsal" placeholder="Customer Name">
          </div>
          <div class="dc-field">
            <label>Agent ID</label>
            <select id="dcAgentId">
              <option value="agent_2af4da0ae2f6" selected>Priya (agent_2af4da0ae2f6)</option>
              <option value="agent_3fbc55c03700">Smoke Test (agent_3fbc55c03700)</option>
            </select>
          </div>
          <div class="dc-field">
            <label>SIP Trunk ID</label>
            <input type="text" id="dcSipId" value="ST_jtDDZVvDLDxb" placeholder="ST_xxxxxxxxx">
          </div>
          <div class="dc-field">
            <label>Due Amount (&#x20b9;)</label>
            <input type="text" id="dcAmount" value="45000">
          </div>
          <div class="dc-field">
            <label>Due Date</label>
            <input type="text" id="dcDate" value="2026-09-05">
          </div>
        </div>
        <div class="dc-json-preview">
          <div class="jh">POST Payload Preview (Sent to VOIZ API)</div>
          <pre id="dcPayloadPreview"></pre>
        </div>
        <button class="btn-primary btn-call-now" id="btnSendDirectCall">&#9889; Dispatch Call Now via VOIZ API</button>
        <div class="dc-result-box" id="dcResultBox" style="display:none;">
          <div class="rh" id="dcResultStatus">STATUS: PENDING</div>
          <div class="rb" id="dcResultDetails"></div>
        </div>
      </div>
    </div>
  </div>

</div>

<script src="/js/state.js"></script>
<script src="/js/capture.js"></script>
<script src="/js/softlaunch.js"></script>
<script src="/js/orbs.js"></script>
<script src="/js/archetype.js"></script>
<script src="/js/persona.js"></script>
<script src="/js/dashboard.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'public/index.html'), indexHTML, 'utf8');
console.log('✓ public/index.html written');

/* =========================================================
   2. public/js/state.js — add archetype field
========================================================= */
const stateJS = `const state = {
  name: '',
  phone: '',
  voice: null, // { id, name, meta, lang, provider, voiceId, sample, ttsLang, pastel }
  archetype: null, // full archetype object
  callId: null,
};

function goTo(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
`;
fs.writeFileSync(path.join(__dirname, 'public/js/state.js'), stateJS, 'utf8');
console.log('✓ public/js/state.js written');

/* =========================================================
   3. public/js/capture.js — now routes to softlaunch
========================================================= */
const captureJS = `const inputName = document.getElementById('inputName');
const inputPhone = document.getElementById('inputPhone');
const consentBox = document.getElementById('consentBox');
const btnStart = document.getElementById('btnStart');

function validateCapture(){
  const ok = inputName.value.trim().length > 1 && inputPhone.value.trim().length >= 7 && consentBox.checked;
  btnStart.disabled = !ok;
}
[inputName, inputPhone].forEach(el => el.addEventListener('input', validateCapture));
consentBox.addEventListener('change', validateCapture);

btnStart.addEventListener('click', () => {
  state.name = inputName.value.trim() || 'Vatsal';
  state.phone = inputPhone.value.trim() || '+918879185247';
  enterSoftLaunch();
});
document.getElementById('btnBypass').addEventListener('click', () => {
  state.name = 'Vatsal';
  state.phone = '+918879185247';
  enterSoftLaunch();
});
`;
fs.writeFileSync(path.join(__dirname, 'public/js/capture.js'), captureJS, 'utf8');
console.log('✓ public/js/capture.js written');

/* =========================================================
   4. public/js/softlaunch.js — cinematic intro screen
========================================================= */
const softlaunchJS = `let _softLaunchTimer = null;

function enterSoftLaunch(){
  goTo('screen-softlaunch');
  runSoftLaunch();
}

function runSoftLaunch(){
  const firstName = (state.name || '').split(' ')[0] || 'there';
  const mark  = document.getElementById('slMark');
  const line1 = document.getElementById('slLine1');
  const line2 = document.getElementById('slLine2');

  mark.classList.remove('show'); line1.classList.remove('show'); line2.classList.remove('show');
  line1.textContent = 'Welcome, ' + firstName + '.';
  line2.textContent = 'This is what it feels like to be our client.';

  try {
    if('speechSynthesis' in window){
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(
        'Welcome, ' + firstName + '. This is Predixion AI. What you\'re about to see is what it feels like to be a client of ours.'
      );
      utter.rate = 0.95; utter.pitch = 1; utter.volume = 1;
      window.speechSynthesis.speak(utter);
    }
  } catch(e) {}

  clearTimeout(_softLaunchTimer);
  setTimeout(() => mark.classList.add('show'), 150);
  setTimeout(() => line1.classList.add('show'), 750);
  setTimeout(() => line2.classList.add('show'), 2300);
  _softLaunchTimer = setTimeout(() => { goTo('screen-orbs'); renderOrbCarousel(); }, 6200);
}

document.getElementById('btnSkipIntro').addEventListener('click', () => {
  clearTimeout(_softLaunchTimer);
  try { if('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch(e) {}
  goTo('screen-orbs');
  renderOrbCarousel();
});
`;
fs.writeFileSync(path.join(__dirname, 'public/js/softlaunch.js'), softlaunchJS, 'utf8');
console.log('✓ public/js/softlaunch.js written');

/* =========================================================
   5. public/js/orbs.js — voice orb carousel
   Tries /api/voices first; falls back to built-in orb list.
========================================================= */
const orbsJS = `// Built-in fallback voices (shown when /api/voices returns nothing useful)
const BUILTIN_ORBS = [
  { id:'priya',   name:'Priya',   lang:'Hinglish', meta:'Hinglish · Female', active:true,  pastel:'#ff9eb5', ttsLang:'hi-IN', sample:'Namaste! Main Priya bol rahi hoon, ABC Bank ki taraf se.' },
  { id:'arjun',   name:'Arjun',   lang:'Hindi',    meta:'Hindi · Male',    active:true,  pastel:'#8ecbff', ttsLang:'hi-IN', sample:'Namaste, main Arjun bol raha hoon, ABC Bank ki or se.' },
  { id:'aditi',   name:'Aditi',   lang:'Marathi',  meta:'Marathi · Female',active:true,  pastel:'#8ef0c4', ttsLang:'mr-IN', sample:'Namaskar, mi Aditi boltey, ABC Bank kadun.' },
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
        lang: v.meta || 'Hinglish',
        meta: v.meta || 'Voice Agent',
        active: true,
        pastel: BUILTIN_ORBS[i % BUILTIN_ORBS.length].pastel,
        ttsLang: BUILTIN_ORBS[i % BUILTIN_ORBS.length].ttsLang || 'hi-IN',
        sample: v.sample || BUILTIN_ORBS[i % BUILTIN_ORBS.length].sample || '',
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
    const el = document.createElement('div');
    el.className = 'orb' + (o.active ? '' : ' disabled') + (offset === 0 ? ' front' : '');
    el.style.setProperty('--pastel', o.pastel || '#8ecbff');
    el.style.transform = 'translate(-50%,-50%) translate3d(' + x + 'px,0,' + z + 'px) scale(' + scale + ')';
    el.style.opacity = opacity;
    el.style.zIndex = 100 - dist;
    el.innerHTML =
      '<div class="orb-sphere"><div class="orb-glow"></div></div>' +
      '<div class="orb-label">' +
        '<div class="oname">' + o.name + '</div>' +
        '<div class="olang">' + o.lang + '</div>' +
        (o.active
          ? (offset === 0 ? '<button class="orb-play" type="button" data-role="play">&#9654; Replay</button>' : '')
          : '<div class="osoon">Coming soon</div>') +
      '</div>';
    el.addEventListener('click', (e) => {
      if(e.target.closest('[data-role="play"]')){ playOrbSample(o, el); return; }
      if(offset !== 0){ orbIndex = i; renderOrbCarousel(); }
    });
    if(offset === 0){ frontOrb = o; frontEl = el; }
    track.appendChild(el);
  });
  document.getElementById('btnOrbNext').disabled = !orbList[orbIndex].active;
  state.voice = orbList[orbIndex];
  if(autoplay && frontOrb && frontOrb.active && frontOrb.sample){ playOrbSample(frontOrb, frontEl); }
}

function playOrbSample(o, el){
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
  if(next !== orbIndex){ orbIndex = next; renderOrbCarousel(); }
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
  goTo('screen-archetype');
  buildArchetypes();
});

// Initialise orbs (fetch from API, then build DOM silently)
initOrbs().then(() => renderOrbCarousel(false));
`;
fs.writeFileSync(path.join(__dirname, 'public/js/orbs.js'), orbsJS, 'utf8');
console.log('✓ public/js/orbs.js written');

/* =========================================================
   6. public/js/archetype.js
========================================================= */
const archetypeJS = `const ICON_PAYER     = '<circle cx="12" cy="12" r="9"/><path d="M8.5 12l2.5 2.5 4.5-4.5"/>';
const ICON_NEGOTIATOR= '<path d="M12 3v18M6 8l-3 5.5a3 3 0 0 0 6 0zM18 8l-3 5.5a3 3 0 0 0 6 0zM6 8h12"/>';
const ICON_SKEPTIC   = '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 0 1 4.9.6c0 1.6-2.4 2-2.4 3.4"/><circle cx="12" cy="16.7" r=".6" fill="currentColor" stroke="none"/>';
const ICON_GHOST     = '<circle cx="7" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" opacity="0.6"/><circle cx="17" cy="12" r="1.6" fill="currentColor" stroke="none" opacity="0.25"/>';

const archetypes = [
  { id:'technical', title:'Technical Defaulter', desc:'Clean history, single missed payment — likely a genuine slip.', icon:ICON_PAYER,
    overdueDays:3, risk:35,
    persona:(nm) => 'I\\u2019m ' + nm + ', a software engineer in Pune with an eighteen-month clean repayment history. This EMI slipped through during a busy week, nothing more. The moment someone reminds me, I\\u2019ll pay. I just need a nudge, not a lecture. Let\\u2019s see how fast this gets sorted out.' },
  { id:'systemic', title:'Systemic Defaulter', desc:'A pattern of late payments — this isn\\u2019t the first time.', icon:ICON_NEGOTIATOR,
    overdueDays:45, risk:58,
    persona:(nm) => 'I\\u2019m ' + nm + ', and this month has been tight. Rent went up, a few bills landed at once, and my EMI slipped through the cracks. Honestly, this keeps happening — I\\u2019m not avoiding it, I just need a little breathing room.' },
  { id:'disputed', title:'Disputed Case', desc:'Questions the charge and wants a real person, not a bot.', icon:ICON_SKEPTIC,
    overdueDays:75, risk:72,
    persona:(nm) => 'I\\u2019m ' + nm + ', and honestly, I\\u2019m not fully convinced this charge is even correct. I want it explained properly before I pay anything. Automated reminders don\\u2019t reassure me much — I want a real person on the line.' },
  { id:'unreachable', title:'Unreachable', desc:'Short replies, missed calls — hard to pin down.', icon:ICON_GHOST,
    overdueDays:135, risk:88,
    persona:(nm) => 'I\\u2019m ' + nm + '. Between work and everything else going on, this EMI reminder is easy to miss, or easy to ignore. I might not pick up the first call. I might reply with one word, or nothing at all.' },
];

function buildArchetypes(){
  const grid = document.getElementById('archGrid');
  grid.innerHTML = '';
  archetypes.forEach(a => {
    const el = document.createElement('div');
    el.className = 'arch-card';
    el.innerHTML =
      '<div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></div>' +
      '<div class="a-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' + a.icon + '</svg></div>' +
      '<div class="a-title">' + a.title + '</div>' +
      '<div class="a-desc">' + a.desc + '</div>';
    el.addEventListener('click', () => {
      document.querySelectorAll('.arch-card').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      state.archetype = a;
      document.getElementById('btnArchNext').disabled = false;
    });
    grid.appendChild(el);
  });
}

document.getElementById('btnArchNext').addEventListener('click', () => {
  goTo('screen-persona');
  runPersonaScreen();
});
`;
fs.writeFileSync(path.join(__dirname, 'public/js/archetype.js'), archetypeJS, 'utf8');
console.log('✓ public/js/archetype.js written');

/* =========================================================
   7. public/js/persona.js — typewriter + numbers
========================================================= */
const personaJS = `let _personaTypeTimer = null;

function getBucket(days){
  if(days <= 30)  return { cls:'bucket-x',   label:'X',   name:'Bucket X', range:'1\\u201330 days overdue' };
  if(days <= 60)  return { cls:'bucket-1',   label:'1',   name:'Bucket 1', range:'30\\u201360 days overdue' };
  if(days <= 90)  return { cls:'bucket-2',   label:'2',   name:'Bucket 2', range:'60\\u201390 days overdue' };
  if(days <= 120) return { cls:'bucket-3',   label:'3',   name:'Bucket 3', range:'90\\u2013120 days overdue' };
  return               { cls:'bucket-npa', label:'NPA', name:'NPA',      range:'120+ days overdue' };
}

function runPersonaScreen(){
  const tag       = document.getElementById('personaTag');
  const typeEl    = document.getElementById('personaTypewriter');
  const numsEl    = document.getElementById('personaNumbers');
  const actionsEl = document.getElementById('personaActions');
  const bucketBox = document.getElementById('bucketBox');
  const captionEl = document.getElementById('personaBucketCaption');
  numsEl.classList.remove('show');
  actionsEl.classList.remove('show');
  captionEl.classList.remove('show');
  bucketBox.className = 'persona-num-box';

  const a = state.archetype || archetypes[0];
  tag.textContent = a.title.toUpperCase();
  const text = a.persona((state.name || 'Vatsal').split(' ')[0]);
  typeEl.innerHTML = '<span class="cursor"></span>';

  const DURATION = 5200;
  const perChar = DURATION / text.length;
  let i = 0;
  clearTimeout(_personaTypeTimer);
  function typeNext(){
    if(i >= text.length){ setTimeout(revealNumbers, 400); return; }
    i++;
    typeEl.innerHTML = escapeHtml(text.slice(0, i)) + '<span class="cursor"></span>';
    _personaTypeTimer = setTimeout(typeNext, perChar);
  }
  typeNext();

  function revealNumbers(){
    const bucket = getBucket(a.overdueDays);
    numsEl.classList.add('show');
    animateNumber('numDebt',    0, 45000,        900, v => '\\u20b9' + Math.round(v).toLocaleString('en-IN'));
    animateNumber('numOverdue', 0, a.overdueDays, 900, v => Math.round(v) + 'd');
    animateNumber('numRisk',    0, a.risk,         900, v => Math.round(v));
    document.getElementById('numBucket').textContent = bucket.label;
    bucketBox.classList.add(bucket.cls);
    captionEl.innerHTML = '<b>' + bucket.name + '</b> \\u00b7 ' + bucket.range;
    setTimeout(() => captionEl.classList.add('show'), 300);
    setTimeout(() => actionsEl.classList.add('show'), 1100);
  }
}

function escapeHtml(str){
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function animateNumber(id, from, to, duration, formatter){
  const el = document.getElementById(id);
  const start = performance.now();
  function step(now){
    const t = Math.min(1, (now - start) / duration);
    el.textContent = formatter(from + (to - from) * t);
    if(t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

document.getElementById('btnPersonaNext').addEventListener('click', () => {
  const a = state.archetype || archetypes[0];
  document.getElementById('dashBorrowerName').textContent = state.name;
  document.getElementById('leftName').textContent = state.name;
  document.getElementById('dashBorrowerSub').textContent = '\\u20b9' + '45,000 \\u00b7 ' + a.overdueDays + 'd overdue';
  document.getElementById('leftOverdue').textContent = a.overdueDays + 'd';
  document.getElementById('leftRisk').textContent = a.risk;
  goTo('screen-dash');
  startDash();
});
`;
fs.writeFileSync(path.join(__dirname, 'public/js/persona.js'), personaJS, 'utf8');
console.log('✓ public/js/persona.js written');

console.log('\nAll files written successfully. Now run: node build_frontend.js css');
