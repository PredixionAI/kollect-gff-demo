const config = require('../config');
const voizClient = require('./voizClient');
const elevenLabsClient = require('./elevenLabsClient');

// Single seam between "the app wants to make/inspect a call" and whichever
// voice platform is active (VOICE_PROVIDER in .env — this branch defaults to
// elevenlabs, `voiz` switches back with zero code change). Both clients speak
// the same interface and getCallDetails returns the same normalized record
// shape, so callPoller/callOutcome/routes never care which one is live.

function isElevenLabs() {
  return config.voiceProvider === 'elevenlabs';
}

function providerName() {
  return isElevenLabs() ? 'elevenlabs' : 'voiz';
}

function client() {
  return isElevenLabs() ? elevenLabsClient : voizClient;
}

// Orb → agent_id map for whichever provider is active. Same contract as
// before: an orb is "active" (selectable in the carousel) once its agent id
// env var is set — see routes/voices.js.
function agentIdsByVoice() {
  return isElevenLabs() ? config.elevenlabs.agentIdsByVoice : config.voiz.agentIdsByVoice;
}

function defaultAgentId() {
  return isElevenLabs() ? config.elevenlabs.defaultAgentId : config.voiz.defaultAgentId;
}

function agentIdForVoice(voiceId) {
  return (voiceId && agentIdsByVoice()[voiceId]) || defaultAgentId();
}

module.exports = {
  providerName,
  placeCall: (args) => client().placeCall(args),
  getCallDetails: (callId) => client().getCallDetails(callId),
  agentIdsByVoice,
  defaultAgentId,
  agentIdForVoice,
};
