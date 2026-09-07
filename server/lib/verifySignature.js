const crypto = require('crypto');
const config = require('../config');

// VOIZ signs webhooks as "sha256=<hmac>" over the raw request body.
function verifyVoizSignature(rawBody, signatureHeader) {
  if (!config.voiz.webhookSecret) return false;
  if (!signatureHeader) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', config.voiz.webhookSecret)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { verifyVoizSignature };
