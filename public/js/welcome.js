/* Screens 0a/0b — Predixion welcome + demo picker (AgentX / Kollect / LeadX).
   Kollect hands off to the existing capture screen; the other two cards are
   deliberately disabled until their demos exist. */

// The thinking-orb vendor file is a deferred ES module, so it lands after
// this classic script runs — retry briefly instead of assuming it's there.
(function mountWelcomeOrb(attempt){
  const holder = document.getElementById('pwOrb');
  if(!holder) return;
  if(window.ThinkingOrb){
    window.ThinkingOrb.mount(holder, { state: 'breathing', size: 64, theme: 'dark', label: 'Predixion AI' });
  } else if((attempt || 0) < 20){
    setTimeout(() => mountWelcomeOrb((attempt || 0) + 1), 150);
  }
})();

document.getElementById('btnExploreDemos').addEventListener('click', () => {
  if (window.track) track('welcome_explore', {});
  goTo('screen-products');
});

document.getElementById('btnBackToWelcome').addEventListener('click', () => {
  goTo('screen-welcome');
});

const cardKollect = document.getElementById('cardKollect');
function startKollect(){
  if (window.track) track('demo_selected', { product: 'kollect' });
  goTo('screen-capture');
}
cardKollect.addEventListener('click', startKollect);
cardKollect.addEventListener('keydown', (e) => {
  if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); startKollect(); }
});

// Disabled cards: a small "not yet" nudge instead of dead silence.
document.querySelectorAll('.pp-card-disabled').forEach(card => {
  card.addEventListener('click', () => {
    card.classList.remove('pp-shake');
    void card.offsetWidth; // restart the animation
    card.classList.add('pp-shake');
  });
});
