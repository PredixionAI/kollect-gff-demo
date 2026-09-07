/* Vanilla adapter for the `thinking-orbs` npm package (no React on this
   page, so the React <ThinkingOrb> wrapper is skipped and its render loop is
   reproduced here against the package's framework-agnostic engine export).

   thinking-orbs-engine.es.js alongside this file is a VERBATIM vendored copy
   of node_modules/thinking-orbs/dist/engine.es.js (v0.3.1, MIT, Jakub
   Antalik). To upgrade:
     npm install thinking-orbs@latest
     cp node_modules/thinking-orbs/dist/engine.es.js public/js/vendor/thinking-orbs-engine.es.js

   Usage from the page's classic scripts (this module is deferred, so touch
   it lazily, never at parse time):
     const orb = window.ThinkingOrb.mount(container, { state:'connecting', size:20, theme:'dark' });
     orb.setState('listening');
     orb.destroy();
*/
import { resolvePreset, MODE_DRAWS } from './thinking-orbs-engine.es.js';

const LABELS = {
  working: 'Working…', searching: 'Searching…', solving: 'Solving…',
  listening: 'Listening…', connecting: 'Connecting…', weaving: 'Weaving…',
  composing: 'Composing…', breathing: 'Thinking…', shaping: 'Shaping…',
};

function prefersDark() {
  return typeof matchMedia === 'undefined' || matchMedia('(prefers-color-scheme: dark)').matches;
}

function mount(container, { state = 'working', size = 20, speed = 1, theme = 'auto', label } = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label || LABELS[state] || 'Working…');
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dark = theme === 'dark' ? true : theme === 'light' ? false : prefersDark();

  let current = state;
  let draw, clockSpeed, opts;
  function configure() {
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    const preset = resolvePreset(current, size);
    draw = MODE_DRAWS[preset.mode];
    clockSpeed = preset.speed * speed;
    opts = preset.opts;
  }

  function paint(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    draw(ctx, size, t, dark, opts);
  }

  let raf = 0;
  let running = false;
  let onscreen = true;
  const loop = () => {
    paint((performance.now() / 1000) * clockSpeed);
    if (running) raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (running || reduced) return;
    running = true;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  configure();
  paint(reduced ? 0.6 : (performance.now() / 1000) * clockSpeed);

  // Same battery manners as the React wrapper: pause offscreen + hidden tab.
  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(([entry]) => {
        onscreen = entry.isIntersecting;
        onscreen && document.visibilityState !== 'hidden' ? start() : stop();
      })
    : null;
  if (io) io.observe(canvas); else start();
  const onVisibility = () => {
    document.visibilityState === 'hidden' ? stop() : (onscreen && start());
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    el: canvas,
    setState(next) {
      if (next === current) return;
      current = next;
      canvas.setAttribute('aria-label', label || LABELS[next] || 'Working…');
      configure();
      if (reduced) paint(0.6);
    },
    destroy() {
      stop();
      if (io) io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.remove();
    },
  };
}

window.ThinkingOrb = { mount };
