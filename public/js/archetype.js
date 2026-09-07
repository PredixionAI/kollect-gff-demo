const ICON_PAYER     = '<circle cx="12" cy="12" r="9"/><path d="M8.5 12l2.5 2.5 4.5-4.5"/>';
const ICON_NEGOTIATOR= '<path d="M12 3v18M6 8l-3 5.5a3 3 0 0 0 6 0zM18 8l-3 5.5a3 3 0 0 0 6 0zM6 8h12"/>';
const ICON_SKEPTIC   = '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 0 1 4.9.6c0 1.6-2.4 2-2.4 3.4"/><circle cx="12" cy="16.7" r=".6" fill="currentColor" stroke="none"/>';
const ICON_GHOST     = '<circle cx="7" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" opacity="0.6"/><circle cx="17" cy="12" r="1.6" fill="currentColor" stroke="none" opacity="0.25"/>';

const archetypes = [
  { id:'technical', title:'Technical Defaulter', desc:'Clean history, single missed payment, likely a genuine slip.', icon:ICON_PAYER,
    overdueDays:3, risk:35,
    persona:(nm) => 'I\u2019m ' + nm + ', a software engineer in Pune with an eighteen-month clean repayment history. This EMI slipped through during a busy week, nothing more. The moment someone reminds me, I\u2019ll pay. I just need a nudge, not a lecture. Let\u2019s see how fast this gets sorted out.' },
  { id:'systemic', title:'Systemic Defaulter', desc:'A pattern of late payments. This isn\u2019t the first time.', icon:ICON_NEGOTIATOR,
    overdueDays:45, risk:58,
    persona:(nm) => 'I\u2019m ' + nm + ', and this month has been tight. Rent went up, a few bills landed at once, and my EMI slipped through the cracks. Honestly, this keeps happening. I\u2019m not avoiding it, I just need a little breathing room.' },
  { id:'disputed', title:'Disputed Case', desc:'Questions the charge and wants a real person, not a bot.', icon:ICON_SKEPTIC,
    overdueDays:75, risk:72,
    persona:(nm) => 'I\u2019m ' + nm + ', and honestly, I\u2019m not fully convinced this charge is even correct. I want it explained properly before I pay anything. Automated reminders don\u2019t reassure me much. I want a real person on the line.' },
  { id:'unreachable', title:'Unreachable', desc:'Short replies, missed calls, hard to pin down.', icon:ICON_GHOST,
    overdueDays:135, risk:88,
    persona:(nm) => 'I\u2019m ' + nm + '. Between work and everything else going on, this EMI reminder is easy to miss, or easy to ignore. I might not pick up the first call. I might reply with one word, or nothing at all.' },
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
      if (window.track) track('archetype_selected', { archetypeId: a.id, archetypeTitle: a.title });
      document.getElementById('btnArchNext').disabled = false;
    });
    grid.appendChild(el);
  });
}

document.getElementById('btnArchNext').addEventListener('click', () => {
  const a = state.archetype || archetypes[0];
  if (window.track) track('archetype_confirmed', { archetypeId: a.id, archetypeTitle: a.title });
  if (window.track) track('persona_screen_entered', {});
  goTo('screen-persona');
  runPersonaScreen();
});
