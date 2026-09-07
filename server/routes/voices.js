const express = require('express');
const voiceCatalog = require('../voiceCatalog');
const callProvider = require('../lib/callProvider');

const router = express.Router();

// agent_id is resolved server-side and never sent to the client — the orb
// carousel only needs to know whether a persona is callable yet.
router.get('/voices', (req, res) => {
  const voices = voiceCatalog.map(v => ({
    id: v.id,
    name: v.name,
    meta: v.meta,
    lang: v.lang,
    ttsLang: v.ttsLang,
    sample: v.sampleText,
    sampleAudio: v.sampleAudio || null,
    active: Boolean(callProvider.agentIdsByVoice()[v.id]),
  }));
  res.json(voices);
});

module.exports = router;
