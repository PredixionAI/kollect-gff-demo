const voiceGrid = document.getElementById('voiceGrid');
let activeSampleAudio = null;

async function loadVoices(){
  const res = await fetch('/api/voices');
  const voices = await res.json();
  renderVoiceCards(voices);
}

function renderVoiceCards(voices){
  voiceGrid.innerHTML = '';
  voices.forEach(v => {
    const card = document.createElement('div');
    card.className = 'voice-card';
    card.dataset.id = v.id;
    card.innerHTML = `
      <div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></div>
      <div class="avatar">${v.name[0]}</div>
      <div class="vname">${v.name}</div>
      <div class="vmeta">${v.meta}</div>
      <button class="play-btn" type="button">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        <span>Play sample</span>
      </button>
    `;
    card.addEventListener('click', (e) => {
      if(e.target.closest('.play-btn')) return;
      document.querySelectorAll('.voice-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.voice = v;
      document.getElementById('btnVoiceNext').disabled = false;
    });
    card.querySelector('.play-btn').addEventListener('click', function(){
      playSample(v, this);
    });
    voiceGrid.appendChild(card);
  });
}

function playSample(voice, btnEl){
  document.querySelectorAll('.play-btn').forEach(b => { b.classList.remove('playing'); b.querySelector('span').textContent = 'Play sample'; });

  if (activeSampleAudio) {
    activeSampleAudio.pause();
    activeSampleAudio = null;
  }

  const audio = new Audio(voice.sample);
  activeSampleAudio = audio;
  btnEl.classList.add('playing');
  btnEl.querySelector('span').textContent = 'Playing…';

  const reset = () => {
    btnEl.classList.remove('playing');
    btnEl.querySelector('span').textContent = 'Play sample';
  };
  audio.addEventListener('ended', reset);
  audio.addEventListener('error', () => {
    reset();
    console.warn(`No sample audio found at ${voice.sample} — drop a 5s clip there.`);
  });
  audio.play().catch(reset);
}

document.getElementById('btnVoiceNext').addEventListener('click', () => {
  document.getElementById('caseName').textContent = state.name;
  document.getElementById('caseNameInline').textContent = state.name;
  document.getElementById('caseLoc').textContent = '📍 Pune, Maharashtra · ABC Bank BNPL customer';
  document.getElementById('dashBorrowerName').textContent = state.name;
  document.getElementById('leftName').textContent = state.name;
  goTo('screen-case');
});

loadVoices();
