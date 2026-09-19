// Agent Catalog screen (2026-09-16, sidebar reworked 2026-09-17) — library of
// 140+ agents, reachable from the landing page's "Agent Catalog" nav button.
// Filters are exact-match against /api/agent-catalog's facets; the search box
// calls the real semantic-search endpoint (Gemini embeddings, see
// server/lib/agentCatalogIndex.js) and degrades to substring matching if the
// index isn't ready — either way the UI just renders whatever `results`
// comes back, no separate code path.
//
// Sidebar shows the catalog's real use-case categories (Loan Collections,
// Lead Qualification, Technical Support, ...) rather than a made-up brand
// taxonomy — one flat list, no Kollect/LeadX grouping, since the agents
// themselves already carry that distinction via their persona and use case.
// The sidebar IS the use-case filter, so there's no separate "Use case"
// dropdown next to it — that would just be the same filter twice.
const FILTER_KEYS = ['gender', 'language'];
const FILTER_LABELS = { gender: 'Gender', language: 'Language' };
const FACET_FIELD = { gender: 'genders', language: 'languages' };

let catalogFacets = null;
let catalogFilterState = { useCase: '', gender: '', language: '' };
let catalogSearchTimer = null;
let catalogLoaded = false;
let catalogAgentsById = {}; // populated on every render so the detail modal can look an agent up by id

function initialsFor(name){
  return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function formatMinutes(mins){
  if (!mins) return '0 min talked';
  return `${mins.toLocaleString('en-IN')} min talked`;
}

function renderAgentCard(agent){
  const chips = (agent.languages || []).map(l => `<span class="agent-chip">${l}</span>`).join('');
  // Collections/recovery agents carry a DPD-stage + loan-product breakdown
  // (Bucket 1/2/3, Personal Loan, EMI, ...) — shown only here on the card,
  // not as a sidebar filter, since it's a per-agent specialization detail
  // rather than a top-level catalog category.
  const bucketChips = (agent.buckets || []).map(b => `<span class="agent-chip agent-chip-bucket">${b}</span>`).join('');
  const rating = agent.rating != null
    ? `<span class="agent-rating"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z"/></svg>${agent.rating.toFixed(1)}</span>`
    : `<span class="agent-rating" style="color:var(--text-faint)">Unrated</span>`;
  return `
    <div class="agent-card" data-agent-id="${agent.id}">
      <div class="agent-card-top">
        <div class="agent-card-id">
          <div class="agent-avatar">${initialsFor(agent.name)}</div>
          <div>
            <div class="name">${agent.name}</div>
            <div class="usecase">${agent.useCase}</div>
          </div>
        </div>
      </div>
      <div class="agent-card-persona">${agent.persona}</div>
      ${bucketChips ? `<div class="agent-card-chips">${bucketChips}</div>` : ''}
      <div class="agent-card-chips">${chips}</div>
      <div class="agent-card-foot">
        <span>${agent.gender}</span>
        ${rating}
      </div>
      <div class="agent-card-minutes">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
        ${formatMinutes(agent.minutesSpoken)}
      </div>
    </div>`;
}

function renderCatalogGrid(agents){
  const grid = document.getElementById('catalogGrid');
  const empty = document.getElementById('catalogEmpty');
  catalogAgentsById = {};
  agents.forEach(a => { catalogAgentsById[a.id] = a; });
  if (!agents.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = agents.map(renderAgentCard).join('');
  grid.querySelectorAll('.agent-card').forEach(card => {
    card.addEventListener('click', () => openAgentModal(card.dataset.agentId));
  });
}

function renderCatalogFilters(){
  const container = document.getElementById('catalogFilters');
  container.innerHTML = FILTER_KEYS.map(key => {
    const options = (catalogFacets[FACET_FIELD[key]] || []).slice();
    const optHtml = options.map(o => `<option value="${o}" ${catalogFilterState[key] === o ? 'selected' : ''}>${o}</option>`).join('');
    return `<select class="catalog-filter-select" data-filter-key="${key}">
      <option value="">${FILTER_LABELS[key]}: All</option>
      ${optHtml}
    </select>`;
  }).join('');
  container.querySelectorAll('.catalog-filter-select').forEach(sel => {
    sel.addEventListener('change', () => {
      catalogFilterState[sel.dataset.filterKey] = sel.value;
      runCatalogSearch();
    });
  });
}

function renderCatalogSidebar(){
  const container = document.getElementById('catalogSidebar');
  const useCases = catalogFacets.useCases || [];
  const itemsHtml = useCases.map(uc => {
    const active = catalogFilterState.useCase === uc ? 'active' : '';
    return `<button class="catalog-nav-item ${active}" data-usecase="${uc}">${uc}</button>`;
  }).join('');
  const allActive = catalogFilterState.useCase === '' ? 'active' : '';
  container.innerHTML = `
    <div class="catalog-nav-group">
      <button class="catalog-nav-item ${allActive}" data-usecase="">All agents</button>
    </div>
    <div class="catalog-nav-group">
      <div class="catalog-nav-group-label">Use case</div>
      ${itemsHtml}
    </div>`;
  container.querySelectorAll('.catalog-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      catalogFilterState.useCase = btn.dataset.usecase;
      container.querySelectorAll('.catalog-nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      runCatalogSearch();
    });
  });
}

async function runCatalogSearch(){
  const query = document.getElementById('catalogSearchInput').value.trim();
  const body = { query, ...catalogFilterState };
  Object.keys(body).forEach(k => { if (!body[k]) delete body[k]; });
  try {
    const res = await fetch('/api/agent-catalog/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    renderCatalogGrid(data.results || []);
    const modeEl = document.getElementById('catalogSearchMode');
    if (query && data.semantic) { modeEl.textContent = 'Semantic match'; modeEl.classList.add('is-semantic'); }
    else if (query) { modeEl.textContent = 'Text match'; modeEl.classList.remove('is-semantic'); }
    else { modeEl.textContent = ''; modeEl.classList.remove('is-semantic'); }
  } catch (e) {
    console.error('[agentCatalog] search failed', e);
  }
}

async function loadAgentCatalog(){
  if (catalogLoaded) return;
  catalogLoaded = true;
  try {
    const res = await fetch('/api/agent-catalog');
    const data = await res.json();
    catalogFacets = data.facets;
    renderCatalogSidebar();
    renderCatalogFilters();
    renderCatalogGrid(data.agents || []);
  } catch (e) {
    console.error('[agentCatalog] failed to load catalog', e);
    document.getElementById('catalogEmpty').textContent = 'Could not load the agent catalog.';
    document.getElementById('catalogEmpty').style.display = 'block';
  }
}

// Detail modal — opened on card click. Version History / Tune Parameters /
// Clone are demo-only mock panels (no backend, nothing persisted): this is a
// catalog of 140 mostly-placeholder agents, so there's no real version or
// tuning data to show — the panels demonstrate what the real product surface
// would look like without pretending to be wired to anything live.
const VERSION_HISTORY_TEMPLATE = [
  { version: 'v3.2', tag: 'Current', note: 'Retrained on the last 30 days of call transcripts, improved tone calibration.' },
  { version: 'v3.1', tag: '', note: 'Added regional-language code-switching mid-call.' },
  { version: 'v3.0', tag: '', note: 'Initial production release.' },
];

function seedFromString(str){
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function renderAgentModalBody(agent){
  const seed = seedFromString(agent.id);
  const chips = (agent.languages || []).map(l => `<span class="agent-chip">${l}</span>`).join('');
  const bucketChips = (agent.buckets || []).map(b => `<span class="agent-chip agent-chip-bucket">${b}</span>`).join('');
  const rating = agent.rating != null ? `${agent.rating.toFixed(1)} rating` : 'Unrated';
  return `
    <div class="agent-modal-head">
      <div class="agent-avatar agent-avatar-lg">${initialsFor(agent.name)}</div>
      <div>
        <div class="agent-modal-name">${agent.name}</div>
        <div class="agent-modal-usecase">${agent.useCase}</div>
      </div>
    </div>
    <p class="agent-modal-persona">${agent.persona}</p>
    ${bucketChips ? `<div class="agent-card-chips">${bucketChips}</div>` : ''}
    <div class="agent-card-chips">${chips}</div>
    <div class="agent-modal-stats">
      <span>${agent.gender}</span>
      <span>${rating}</span>
      <span>${formatMinutes(agent.minutesSpoken)}</span>
    </div>

    <div class="agent-modal-actions">
      <button class="catalog-filter-select agent-modal-action" data-panel="history">Version history</button>
      <button class="catalog-filter-select agent-modal-action" data-panel="tune">Tune parameters</button>
      <button class="catalog-filter-select agent-modal-action" data-panel="clone">Clone</button>
    </div>
    <div class="agent-modal-panel" id="agentModalPanel"></div>`;
}

function renderModalPanel(kind, agent, seed){
  const panel = document.getElementById('agentModalPanel');
  if (kind === 'history') {
    panel.innerHTML = `<div class="modal-panel-list">${VERSION_HISTORY_TEMPLATE.map(v => `
      <div class="modal-panel-row">
        <div class="modal-panel-row-top"><strong>${v.version}</strong>${v.tag ? `<span class="modal-panel-tag">${v.tag}</span>` : ''}</div>
        <div class="modal-panel-row-note">${v.note}</div>
      </div>`).join('')}</div>`;
    return;
  }
  if (kind === 'tune') {
    const params = [
      { key: 'empathy', label: 'Empathetic ↔ Firm', value: 20 + (seed % 60) },
      { key: 'pace', label: 'Speaking pace', value: 30 + ((seed >> 3) % 50) },
      { key: 'escalation', label: 'Escalation threshold', value: 10 + ((seed >> 6) % 70) },
    ];
    panel.innerHTML = `<div class="modal-panel-tune">
      ${params.map(p => `
        <label class="modal-tune-row">
          <span>${p.label}</span>
          <input type="range" min="0" max="100" value="${p.value}" data-tune-key="${p.key}">
        </label>`).join('')}
      <button class="btn-pill-primary modal-tune-save" id="agentModalTuneSave">Save changes</button>
      <div class="modal-tune-note" id="agentModalTuneNote"></div>
    </div>`;
    document.getElementById('agentModalTuneSave').addEventListener('click', () => {
      document.getElementById('agentModalTuneNote').textContent = 'Parameters updated for this session (demo only — not persisted).';
    });
    return;
  }
  if (kind === 'clone') {
    panel.innerHTML = `<div class="modal-panel-clone">
      <p>Create an editable copy of <strong>${agent.name}</strong> to customize without affecting the live agent.</p>
      <button class="btn-pill-primary" id="agentModalCloneBtn">Clone this agent</button>
      <div class="modal-tune-note" id="agentModalCloneNote"></div>
    </div>`;
    document.getElementById('agentModalCloneBtn').addEventListener('click', (e) => {
      const cloneId = `${agent.id}-copy-${(seed % 9000 + 1000)}`;
      document.getElementById('agentModalCloneNote').textContent = `Cloned as "${agent.name} Copy" • Draft • ${cloneId}`;
      e.target.disabled = true;
    });
  }
}

function openAgentModal(agentId){
  const agent = catalogAgentsById[agentId];
  if (!agent) return;
  document.getElementById('agentModalBody').innerHTML = renderAgentModalBody(agent);
  document.getElementById('agentModalOverlay').style.display = 'flex';
  const seed = seedFromString(agent.id);
  document.querySelectorAll('.agent-modal-action').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.agent-modal-action').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderModalPanel(btn.dataset.panel, agent, seed);
    });
  });
  // Default open panel — version history is the least destructive, most
  // informative first view.
  document.querySelector('.agent-modal-action[data-panel="history"]').click();
}

function closeAgentModal(){
  document.getElementById('agentModalOverlay').style.display = 'none';
}

document.getElementById('agentModalClose').addEventListener('click', closeAgentModal);
document.getElementById('agentModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'agentModalOverlay') closeAgentModal();
});

function enterAgentCatalog(){
  if (window.track) track('agent_catalog_open', {});
  loadAgentCatalog();
  goTo('screen-agent-catalog');
}

document.getElementById('navPlatform').addEventListener('click', (e) => {
  e.preventDefault();
  enterAgentCatalog();
});
document.getElementById('btnCatalogBack').addEventListener('click', () => goTo('screen-landing'));
document.getElementById('catalogSearchInput').addEventListener('input', () => {
  clearTimeout(catalogSearchTimer);
  catalogSearchTimer = setTimeout(runCatalogSearch, 350);
});
