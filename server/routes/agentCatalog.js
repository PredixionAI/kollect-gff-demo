const express = require('express');
const agentCatalogIndex = require('../lib/agentCatalogIndex');

const router = express.Router();

// Full listing + filter facets — used to render the catalog grid and build
// the filter dropdowns before any search has happened.
router.get('/agent-catalog', (req, res) => {
  res.json({
    agents: agentCatalogIndex.getAllAgents(),
    facets: agentCatalogIndex.getFacets(),
  });
});

// Real semantic search (Gemini embeddings, see embeddingsClient.js) plus
// exact metadata filters. Body: { query, service, product, stage, objective,
// language, persona } — all optional; an empty body returns the unranked,
// unfiltered catalog.
router.post('/agent-catalog/search', async (req, res) => {
  const { query, service, product, stage, objective, language, persona } = req.body || {};
  try {
    const result = await agentCatalogIndex.search({ query, service, product, stage, objective, language, persona });
    res.json(result);
  } catch (err) {
    console.error('[agentCatalog] search error', err);
    res.status(502).json({ error: 'search_failed', detail: String(err) });
  }
});

module.exports = router;
