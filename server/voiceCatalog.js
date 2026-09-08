// Up to 5 personas for the booth voice picker (the orb carousel). Whether an
// orb is selectable ("active") is computed in routes/voices.js from whether
// a real VOIZ agent_id is configured for it (server/config.js
// agentIdsByVoice) — not stored here. `provider`/`voiceId` record which real
// VOIZ catalog voice each persona maps to (VOIZ_MASTER_API_SETUP_AND_VOICE_
// CATALOG_GUIDE.docx §5), for whoever registers that persona's agent next.
//
// `sampleText` is spoken client-side via the Web Speech API — used only
// when there's no real recording yet. `sampleAudio` (when present) is a
// real clip of that agent's own voice, extracted from an actual VOIZ call's
// introduction line (public/audio/) — takes priority over sampleText in
// orbs.js. Neha's and Ritu's are real; the rest are still TTS-only until
// their agents are registered and a real call is captured the same way
// (place a real call, pull the recording via GET /calls/{id}, confirm the
// introduction's exact timestamp by ear, trim with ffmpeg + a soft
// fade-out — see chat history 2026-09-05 for the exact process).
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
  { id: 'meera', name: 'Meera', lang: 'English', ttsLang: 'en-US',
    meta: 'Global English · Support & friendly · Female',
    provider: 'cartesia', voiceId: '694f9389-aac1-45b6-b726-9d9369183238',
    sampleText: 'Hi, this is Meera calling on behalf of Predixion Fincorp.' },
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
  // sampleAudio removed 2026-09-08 — the recording that had been sitting at
  // ritu.mp3 was actually Swara's Hindi voice (see above), and the ORIGINAL
  // ritu.mp3 (recovered from git as swara.mp3, then moved to Vikram above)
  // doesn't match Ritu's own profile (Marathi/Hindi, Female) either. Back to
  // TTS-only until a real, correctly-matched Ritu recording is captured.
  { id: 'ritu', name: 'Ritu', lang: 'Marathi/Hindi', ttsLang: 'mr-IN',
    meta: 'Marathi/Hindi/Bengali · Energetic, support · Female',
    provider: 'sarvam', voiceId: 'ritu',
    sampleText: 'Namaskar, main Ritu bol rahi hoon, Predixion Fincorp ki taraf se.' },
];
