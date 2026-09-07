/* Workflow graph for the dashboard canvas.
   Paints the case journey as a node graph: Start → the four phases (each a
   glass node listing its own steps) → the terminal node. Reads the step
   engine's globals (TABS, stepData, idx) and repaints after every
   renderStep, so the graph is always the engine's state, never its own. */

(function(){
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6L9 17l-5-5"/></svg>';
  const FLAG  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 22V4a1 1 0 0 1 1-1h11l-1 4h5l-2 6H9l-1 3"/></svg>';
  const END   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>';
  const HAND  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>';

  function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function renderWorkflow(){
    const root = document.getElementById('workflowGraph');
    if(!root || typeof stepData === 'undefined' || !stepData.length) return;
    const cur = stepData[idx];
    const last = stepData[stepData.length - 1];
    const finished = idx === stepData.length - 1;
    const escalated = last.status === 'escalated';

    const nodes = [];
    nodes.push(`<div class="wf-node wf-node--terminal is-done"><span class="wf-node__icon">${FLAG}</span><span class="wf-node__label">Default detected</span></div>`);

    TABS.forEach((t) => {
      const steps = stepData.map((s, i) => ({ s, i })).filter(o => o.s.tab === t.key);
      const done = steps.filter(o => o.i < idx).length;
      const isActive = cur.tab === t.key;
      const isDone = !isActive && steps.length && steps.every(o => o.i < idx);
      const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
      nodes.push(`<div class="wf-edge"><i style="width:${isDone ? 100 : isActive ? Math.max(pct, 12) : 0}%"></i></div>`);
      nodes.push(`
        <div class="wf-node wf-node--phase${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}">
          <div class="wf-node__head">
            <span class="wf-node__icon">${isDone ? CHECK : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${t.icon}</svg>`}</span>
            <div class="wf-node__titles"><div class="wf-node__title">${esc(t.label)}</div><div class="wf-node__sub">${esc(t.sub)}</div></div>
            <span class="wf-node__count">${Math.min(done + (isActive ? 1 : 0), steps.length)}/${steps.length}</span>
          </div>
          <ol class="wf-node__steps">
            ${steps.map(o => `<li class="${o.i < idx ? 'is-done' : o.i === idx ? 'is-active' : ''}"><i></i><span>${esc(o.s.title)}</span></li>`).join('')}
          </ol>
        </div>`);
    });

    nodes.push(`<div class="wf-edge"><i style="width:${finished ? 100 : 0}%"></i></div>`);
    nodes.push(`<div class="wf-node wf-node--terminal${finished ? (escalated ? ' is-handoff' : ' is-done') : ''}"><span class="wf-node__icon">${escalated ? HAND : END}</span><span class="wf-node__label">${escalated ? 'Handed to a human' : 'Resolved'}</span></div>`);

    root.innerHTML = nodes.join('');
  }

  // Wrap the engine's renderer. renderStep is a top-level function
  // declaration in dashboard.js, so every internal call resolves to this.
  if(typeof renderStep === 'function'){
    const engineRender = renderStep;
    renderStep = function(instant){ engineRender(instant); renderWorkflow(); };
  }
  window.renderWorkflow = renderWorkflow;
})();

/* Fit the phone mockup to whatever room its panel has. The mockup was drawn
   at a fixed size for a full-height column; on the console it lives in a
   glass panel, so scale it uniformly instead of letting it clip. */
(function(){
  function fitPhone(){
    const body = document.getElementById('phoneDockBody');
    const wrap = body && body.querySelector('.phone-wrap');
    if(!body || !wrap) return;
    wrap.style.transform = 'none';
    const bw = body.clientWidth - 24, bh = body.clientHeight - 24;
    const pw = wrap.offsetWidth, ph = wrap.offsetHeight;
    if(!pw || !ph) return;
    const s = Math.min(1, bw / pw, bh / ph);
    wrap.style.transform = `scale(${s.toFixed(3)})`;
    // the wrapper keeps its unscaled box in the layout; pull the extra room back in
    wrap.style.marginBlock = `${-((ph - ph * s) / 2).toFixed(1)}px`;
  }
  const body = document.getElementById('phoneDockBody');
  if(body){
    new MutationObserver(() => requestAnimationFrame(fitPhone)).observe(body, { childList: true });
    if(typeof ResizeObserver !== 'undefined') new ResizeObserver(() => fitPhone()).observe(body);
  }
  window.addEventListener('resize', fitPhone);
  window.fitPhone = fitPhone;
})();
