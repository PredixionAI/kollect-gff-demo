// Personas for the booth voice picker (the orb carousel). Whether an orb is
// selectable ("active") is computed in routes/voices.js from whether a real
// VOIZ agent_id is configured for it (server/config.js agentIdsByVoice) —
// not stored here. `provider`/`voiceId` record which real VOIZ catalog voice
// each persona maps to (VOIZ_MASTER_API_SETUP_AND_VOICE_CATALOG_GUIDE.docx
// §5), for whoever registers that persona's agent next.
//
// `sampleText` is spoken client-side via the Web Speech API — used only
// when there's no real recording yet. `sampleAudio` (when present) is a
// real clip of that agent's own voice, extracted from an actual VOIZ call's
// introduction line (public/audio/) — takes priority over sampleText in
// orbs.js.
//
// Meera and Ritu removed 2026-09-08 (user request) — Meera never had a real
// recording or a registered agent; Ritu's slot never got a correctly-matched
// recording either (see git history for the mismatch saga). Down to the 3
// personas with real recordings.
module.exports = [
  // Display name only — id/filename stay 'priya' (this is the one persona
  // with a real registered VOIZ agent, VOIZ_DEFAULT_AGENT_ID, so the id is
  // load-bearing; renamed 2026-09-08 per user, "Priya" was wrong, real name
  // is Neha).
  { id: 'priya', name: 'Neha', lang: 'Hinglish', ttsLang: 'hi-IN',
    meta: 'Hindi/Gujarati/Punjabi · Warm, empathetic · Female',
    provider: 'sarvam', voiceId: 'meera',
    sampleText: 'Namaste! Main Neha bol rahi hoon, Predixion Fincorp ki taraf se.',
    sampleAudio: '/audio/priya.mp3' },
  // Renamed from Arjun 2026-09-08. Cross-match corrected same day: the
  // recording set as "ritu.mp3" on 2026-09-07 is actually THIS persona's own
  // voice (Hindi-speaking, real name Swara) — moved to swara.mp3 where it
  // belongs. Swara is Hindi, not Marathi (corrected per user 2026-09-08).
  // provider/voiceId still Arjun's leftover (sarvam/shubh, unverified
  // against the real Sarvam catalog) — confirm once this persona's agent
  // is actually registered (VOIZ_AGENT_ID_SWARA still blank).
  { id: 'swara', name: 'Swara', lang: 'Hindi', ttsLang: 'hi-IN',
    meta: 'Hindi/English · Warm, assertive · Female',
    provider: 'sarvam', voiceId: 'shubh',
    sampleText: 'Namaste, main Swara bol rahi hoon, Predixion Fincorp ki taraf se.',
    sampleAudio: '/audio/swara.mp3' },
  // Repurposed 2026-09-08 from "US English, Authoritative" — at the time
  // this slot's real VOIZ agent wasn't registered, so nothing functional
  // depended on the old language/voice. Now registered as agent_6ded70c012ae
  // (VOIZ_AGENT_ID_VIKRAM in .env). sampleAudio is the male Marathi/Hindi
  // recording that came from the original ritu.mp3 (git commit 7ee943d) —
  // didn't match Ritu (Female) or Swara (Hindi), and this is where it
  // actually belongs. provider/voiceId still the old Cartesia English id,
  // unverified against a real Marathi/Hindi male voice.
  { id: 'vikram', name: 'Vikram', lang: 'Marathi/Hindi', ttsLang: 'mr-IN',
    meta: 'Marathi/Hindi · Authoritative, clear · Male',
    provider: 'cartesia', voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    sampleText: 'Namaskar, main Vikram bol raha hoon, Predixion Fincorp ki taraf se.',
    sampleAudio: '/audio/vikram.mp3' },
];
