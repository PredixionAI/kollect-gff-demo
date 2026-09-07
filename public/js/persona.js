let _personaTypeTimer = null;

function getBucket(days){
  if(days <= 30)  return { cls:'bucket-x',   label:'X',   name:'Bucket X', range:'1\u201330 days overdue' };
  if(days <= 60)  return { cls:'bucket-1',   label:'1',   name:'Bucket 1', range:'30\u201360 days overdue' };
  if(days <= 90)  return { cls:'bucket-2',   label:'2',   name:'Bucket 2', range:'60\u201390 days overdue' };
  if(days <= 120) return { cls:'bucket-3',   label:'3',   name:'Bucket 3', range:'90\u2013120 days overdue' };
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
    animateNumber('numDebt',    0, 45000,        900, v => '\u20b9' + Math.round(v).toLocaleString('en-IN'));
    animateNumber('numOverdue', 0, a.overdueDays, 900, v => Math.round(v) + 'd');
    animateNumber('numRisk',    0, a.risk,         900, v => Math.round(v));
    document.getElementById('numBucket').textContent = bucket.label;
    bucketBox.classList.add(bucket.cls);
    captionEl.innerHTML = '<b>' + bucket.name + '</b> \u00b7 ' + bucket.range;
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
  document.getElementById('leftName').textContent = state.name;
  document.getElementById('leftOverdue').textContent = a.overdueDays + 'd';
  document.getElementById('leftRisk').textContent = a.risk;
  if (window.track) track('dashboard_entered', {});
  goTo('screen-dash');
  startDash();
});

