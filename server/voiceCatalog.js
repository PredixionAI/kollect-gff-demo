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
// orbs.js. Priya's and Ritu's are real; the rest are still TTS-only until
// their agents are registered and a real call is captured the same way
// (place a real call, pull the recording via GET /calls/{id}, confirm the
// introduction's exact timestamp by ear, trim with ffmpeg + a soft
// fade-out — see chat history 2026-09-05 for the exact process).
module.exports = [
  { id: 'priya', name: 'Priya', lang: 'Hinglish', ttsLang: 'hi-IN',
    meta: 'Hindi/Gujarati/Punjabi · Warm, empathetic · Female',
    provider: 'sarvam', voiceId: 'meera',
    sampleText: 'Namaste! Main Priya bol rahi hoon, ABC Bank ki taraf se.',
    sampleAudio: '/audio/priya.mp3' },
  { id: 'arjun', name: 'Arjun', lang: 'Hindi', ttsLang: 'hi-IN',
    meta: 'Hindi/Marathi/English · Formal, assertive · Male',
    provider: 'sarvam', voiceId: 'shubh',
    sampleText: 'Namaste, main Arjun bol raha hoon, ABC Bank ki taraf se.' },
  { id: 'meera', name: 'Meera', lang: 'English', ttsLang: 'en-US',
    meta: 'Global English · Support & friendly · Female',
    provider: 'cartesia', voiceId: '694f9389-aac1-45b6-b726-9d9369183238',
    sampleText: 'Hi, this is Meera calling on behalf of ABC Bank.' },
  { id: 'vikram', name: 'Vikram', lang: 'English', ttsLang: 'en-US',
    meta: 'US English · Authoritative, clear · Male',
    provider: 'cartesia', voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    sampleText: 'Hello, this is Vikram calling from ABC Bank.' },
  { id: 'ritu', name: 'Ritu', lang: 'Marathi/Hindi', ttsLang: 'mr-IN',
    meta: 'Marathi/Hindi/Bengali · Energetic, support · Female',
    provider: 'sarvam', voiceId: 'ritu',
    sampleText: 'Namaskar, main Ritu bol rahi hoon, ABC Bank ki taraf se.',
    sampleAudio: '/audio/ritu.mp3' },
];
