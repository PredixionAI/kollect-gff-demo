// Sales vs Collection use-case picker (2026-09-30) — sits between voice
// selection and the archetype picker. Collection continues into the
// existing archetype flow unchanged. Sales skips archetype selection
// entirely: state.archetype is left unset, which every downstream reader
// (persona.js, dashboard.js) already defaults to archetypes[0] when absent
// — the explicit "reuse the full dashboard as-is" decision, rather than
// building a separate Sales-specific dashboard.
let _selectedUsecase = null;

document.querySelectorAll('#usecaseGrid .arch-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('#usecaseGrid .arch-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    _selectedUsecase = card.dataset.usecase;
    if (window.track) track('usecase_selected', { useCase: _selectedUsecase });
    document.getElementById('btnUsecaseNext').disabled = false;
  });
});

document.getElementById('btnUsecaseNext').addEventListener('click', () => {
  state.useCase = _selectedUsecase || 'collections';
  if (window.track) track('usecase_confirmed', { useCase: state.useCase });

  if (state.useCase === 'sales') {
    // No archetype screen for Sales — state.archetype stays unset and
    // downstream code (persona.js, dashboard.js) already falls back to
    // archetypes[0] wherever it reads state.archetype.
    if (window.track) track('persona_screen_entered', {});
    goTo('screen-persona');
    runPersonaScreen();
  } else {
    if (window.track) track('archetype_screen_entered', {});
    goTo('screen-archetype');
  }
});
