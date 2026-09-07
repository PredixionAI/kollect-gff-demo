const config = require('../config');

// Runtime-only override so mode can be flipped from the dashboard without a
// server restart. Deliberately NOT persisted to .env or disk — a restart
// (crash, redeploy, forgot it was left on) always falls back to whatever
// .env says, which should stay 'mock' as the safe default. This is the
// point: the risky state (live) can never silently survive a restart.
let overrideMode = null;

function getMode() {
  return overrideMode || config.whatsapp.mode;
}

function setMode(mode) {
  if (mode !== 'mock' && mode !== 'live') {
    throw new Error(`mode must be "mock" or "live", got "${mode}"`);
  }
  overrideMode = mode;
  console.log(`[whatsapp] mode switched to ${mode} (runtime override, resets to .env's "${config.whatsapp.mode}" on restart)`);
  return getMode();
}

module.exports = { getMode, setMode };
