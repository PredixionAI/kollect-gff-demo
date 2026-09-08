// Demo picker landing screen — precedes the Kollect capture flow. Kollect is
// the one live demo; AgentX has no destination yet, LeadX links out to its
// own standalone deployment (set by the user, not part of this app).
const LEADX_URL = 'https://leadx-predixion-ai.netlify.app/';

function enterKollectDemo(){
  if (window.track) track('landing_start_demo', {});
  goTo('screen-capture');
}

document.getElementById('btnLandingStartDemo').addEventListener('click', enterKollectDemo);
document.getElementById('btnLandingStartKollect').addEventListener('click', enterKollectDemo);

// The "Open LeadX" pill is a real <a target="_blank">, so its own click
// needs no JS — that's also what makes it work as a native link (middle-click,
// long-press, right-click "open in new tab") instead of only a plain click.
// The card-level listener below is just a bigger, more forgiving hit target
// at a booth kiosk; clicking the link itself must not also trigger this one.
document.getElementById('cardLeadX').addEventListener('click', (e) => {
  if(e.target.closest('#btnLandingOpenLeadX')) return;
  if (window.track) track('landing_leadx_click', {});
  window.open(LEADX_URL, '_blank', 'noopener');
});
