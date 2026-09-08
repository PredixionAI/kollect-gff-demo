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

// Vobiz signs webhooks as the bare hex HMAC-SHA256 over the raw request
// body — no "sha256=" prefix, unlike VOIZ above. Confirmed against Vobiz's
// own docs (docs/whatsapp/webhooks — "Verifying the signature").
function verifyVobizSignature(rawBody, signatureHeader, secret) {
  if (!secret) return false;
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { verifyVoizSignature, verifyVobizSignature };
