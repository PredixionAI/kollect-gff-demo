const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const embeddingsClient = require('./embeddingsClient');

const CATALOG_PATH = path.join(__dirname, '..', 'agentCatalog.json');
const CACHE_PATH = path.join(__dirname, '..', 'data', 'agentCatalogEmbeddings.json');

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

// One combined string per agent is what actually gets embedded — name,
// persona, use case, and languages all feed the same vector so a query
// like "someone who handles refund disputes" can match on meaning across
// any of those fields, not just an exact keyword in one of them.
function searchTextFor(agent) {
  return [agent.name, agent.persona, agent.useCase, agent.languages.join(', '), agent.status, (agent.buckets || []).join(', ')]
    .filter(Boolean).join(' — ');
}

// Cheap content hash so a changed catalog invalidates the cache instead of
// silently searching against stale embeddings for entries that no longer
// exist (or serving wrong vectors for edited personas).
function catalogHash() {
  return crypto.createHash('sha1').update(JSON.stringify(catalog)).digest('hex');
}

let vectors = null; // number[][], same order/length as catalog
let ready = false;
let readyError = null;

async function buildIndex() {
  const hash = catalogHash();
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      if (cached.hash === hash && Array.isArray(cached.vectors) && cached.vectors.length === catalog.length) {
        vectors = cached.vectors;
        ready = true;
        console.log(`[agentCatalogIndex] loaded ${vectors.length} cached embeddings`);
        return;
      }
    } catch (e) { /* fall through to recompute */ }
  }

  try {
    console.log(`[agentCatalogIndex] computing embeddings for ${catalog.length} agents (no valid cache found)...`);
    vectors = await embeddingsClient.embedTexts(catalog.map(searchTextFor));
    ready = true;
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ hash, vectors }));
    console.log(`[agentCatalogIndex] embeddings ready and cached`);
  } catch (err) {
    readyError = err.message || String(err);
    console.error('[agentCatalogIndex] failed to build embeddings — semantic search will report unavailable:', readyError);
  }
}

// Fire-and-forget at module load — GET /api/agent-catalog (metadata-only
// listing) works immediately regardless; only the semantic search endpoint
// needs this to have finished.
const indexPromise = buildIndex();

function getAllAgents() {
  return catalog;
}

function getFacets() {
  const statuses = [...new Set(catalog.map(a => a.status))];
  const useCases = [...new Set(catalog.map(a => a.useCase))].sort();
  const genders = [...new Set(catalog.map(a => a.gender))];
  const languages = [...new Set(catalog.flatMap(a => a.languages))].sort();
  return { statuses, useCases, genders, languages };
}

// Combines real semantic similarity (when a query is given and the index is
// ready) with exact metadata filters (status/gender/useCase/language) —
// filters narrow the candidate set first, then similarity ranks what's left.
// With no query, filtered results are returned in catalog order (no
// meaningless "similarity" score to sort by).
async function search({ query, status, gender, useCase, language } = {}) {
  let candidates = catalog.map((agent, i) => ({ agent, index: i }));

  if (status) candidates = candidates.filter(c => c.agent.status === status);
  if (gender) candidates = candidates.filter(c => c.agent.gender === gender);
  if (useCase) candidates = candidates.filter(c => c.agent.useCase === useCase);
  if (language) candidates = candidates.filter(c => c.agent.languages.includes(language));

  const trimmedQuery = (query || '').trim();
  if (!trimmedQuery) {
    return { results: candidates.map(c => ({ ...c.agent, score: null })), semantic: false };
  }

  await indexPromise;
  if (!ready) {
    // Degrade to plain substring matching rather than returning nothing —
    // still useful, just not "semantic". Callers can check `semantic` to
    // know which mode actually ran.
    const q = trimmedQuery.toLowerCase();
    const filtered = candidates.filter(c => searchTextFor(c.agent).toLowerCase().includes(q));
    return { results: filtered.map(c => ({ ...c.agent, score: null })), semantic: false, reason: readyError || 'index_not_ready' };
  }

  const queryVector = await embeddingsClient.embedText(trimmedQuery);
  const scored = candidates.map(c => ({
    ...c.agent,
    score: embeddingsClient.cosineSimilarity(queryVector, vectors[c.index]),
  }));
  scored.sort((a, b) => b.score - a.score);
  return { results: scored, semantic: true };
}

module.exports = { getAllAgents, getFacets, search };
