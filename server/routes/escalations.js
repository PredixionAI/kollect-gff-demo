const express = require('express');
const store = require('../lib/store');

const router = express.Router();

// Second-screen booth staff view (PRD §7.1) — polled or SSE'd from a separate
// screen while attendees use the main dashboard.
router.get('/escalations', (req, res) => {
  res.json(store.listEscalations());
});

module.exports = router;
