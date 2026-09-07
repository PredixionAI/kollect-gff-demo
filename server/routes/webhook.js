const express = require('express');
const { verifyVoizSignature } = require('../lib/verifySignature');
const callOutcome = require('../lib/callOutcome');

const router = express.Router();

// SECONDARY path only — GET /calls/{call_id} polling (server/lib/callPoller.js)
// is the primary way this app learns call outcomes now, confirmed working
// 2026-09-05. This route is kept in case VOIZ ever pushes a webhook, but:
// - No public URL has ever been registered with VOIZ for this.
// - The payload shape below is best-effort, not verified — the platform
//   guide's example (an `event: "call_completed"` wrapper, a `disposition`
//   string) doesn't match the real GET /calls/{call_id} shape we've since
//   confirmed (flat record, `escalation_flag`/`dispute_flag` booleans, no
//   `disposition` field at all). If a real webhook ever arrives, check what
//   shape it's actually in before trusting this parsing.
router.post('/webhooks/voiz', async (req, res) => {
  const signature = req.get('X-Voiz-Signature');
  if (!verifyVoizSignature(req.rawBody, signature)) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  const payload = req.body;
  // Accept either the guide's assumed { event, ...fields } wrapper, or a
  // flat call record matching GET /calls/{call_id}'s real shape.
  if (payload.event && payload.event !== 'call_completed') {
    return res.status(200).json({ ignored: true });
  }

  const callId = payload.call_id;
  if (!callId) {
    return res.status(400).json({ error: 'no call_id in payload' });
  }

  await callOutcome.handleCallOutcome(callId, payload);
  res.status(200).json({ received: true });
});

module.exports = router;
