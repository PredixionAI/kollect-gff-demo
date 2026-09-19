const fetch = require('node-fetch');
const config = require('../config');

// Agent Catalog semantic search (2026-09-16 user request) — reuses the
// existing GEMINI_API_KEY rather than asking for a separate embeddings
// provider key. Gemini's embedding model is a different model id
// (gemini-embedding-001) from the chat model configured elsewhere
// (config.gemini.model, gemini-2.5-flash) — same API key, different
// endpoint/model. text-embedding-004 (a commonly-referenced model id
// elsewhere) 404'd against this key/API version — confirmed via
// ListModels that gemini-embedding-001 is what's actually available.
const EMBEDDING_MODEL = 'gemini-embedding-001';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
// This model only lists embedContent/asyncBatchEmbedContent as supported
// methods (confirmed via ListModels) — no synchronous batch endpoint, so
// embedTexts below just fans out individual embedContent calls with
// limited concurrency rather than assuming a batch endpoint exists.
const CONCURRENCY = 8;
const TIMEOUT_MS = 15000;

async function postJson(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    }
    return json;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Embeds one string, returns a plain number[] vector.
async function embedText(text) {
  if (!config.gemini.apiKey) throw new Error('no_api_key');
  const url = `${BASE_URL}/models/${EMBEDDING_MODEL}:embedContent?key=${config.gemini.apiKey}`;
  const json = await postJson(url, { content: { parts: [{ text }] } });
  const values = json.embedding && json.embedding.values;
  if (!Array.isArray(values)) throw new Error('invalid_embedding_response');
  return values;
}

// Embeds many strings via individual embedContent calls, CONCURRENCY at a
// time, preserving input order in the output. Only runs once per catalog
// version (agentCatalogIndex.js caches the result to disk), so a few dozen
// seconds of startup latency for ~140 entries is an acceptable trade for
// not needing a batch endpoint this model doesn't actually expose.
async function embedTexts(texts) {
  if (!config.gemini.apiKey) throw new Error('no_api_key');
  const vectors = new Array(texts.length);
  let cursor = 0;
  async function worker() {
    while (cursor < texts.length) {
      const i = cursor++;
      vectors[i] = await embedText(texts[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, texts.length) }, worker));
  return vectors;
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

module.exports = { embedText, embedTexts, cosineSimilarity };
