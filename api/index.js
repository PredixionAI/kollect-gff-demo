// Vercel serverless entry: every /api/* request is rewritten here (see
// vercel.json) and handled by the same Express app that runs locally.
// Static files in public/ are served by Vercel's CDN directly.
module.exports = require('../server/index.js');
