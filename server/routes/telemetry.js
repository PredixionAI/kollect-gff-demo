/**
 * routes/telemetry.js
 *
 * POST /api/telemetry/event  — receive an event patch from the browser
 * GET  /api/telemetry/sessions — admin view of all sessions (JSON)
 * GET  /api/telemetry/export-csv — instant CSV download fallback
 */

const express = require('express');
const store   = require('../lib/telemetryStore');
const router  = express.Router();

// ─── POST /api/telemetry/event ────────────────────────────────────────────────
// The browser posts partial session patches as events occur (login, step change,
// call_triggered, etc.).  We merge each patch into the running session record.
router.post('/telemetry/event', (req, res) => {
  const { sessionId, event, ...rest } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  // Build the patch from the event type + any extra fields
  const patch = buildPatch(event, rest);
  const updated = store.upsertSession(sessionId, patch);

  res.json({ ok: true, sessionId, updated });
});

// ─── Event → patch mapping ────────────────────────────────────────────────────
function buildPatch(event, data) {
  switch (event) {

    case 'login':
      return {
        loginTime:          data.timestamp || new Date().toLocaleString('en-IN'),
        name:               data.name,
        phone:              data.phone,
        loginMethod:        data.method === 'bypass' ? 'Bypass / Demo Defaults' : 'Start Button',
        highestStepReached: 'Login',
      };

    case 'screen_entered':
      return {
        highestStepReached: data.screenName,
      };

    case 'screen_dropoff':
      if (data.screen === 'voice') {
        return { timeOnVoiceScreenS: Math.round((data.timeOnScreenMs || 0) / 1000) };
      }
      if (data.screen === 'archetype') {
        return { timeOnArchetypeScreenS: Math.round((data.timeOnScreenMs || 0) / 1000) };
      }
      if (data.screen === 'persona') {
        return { timeOnPersonaScreenS: Math.round((data.timeOnScreenMs || 0) / 1000) };
      }
      return {};


    case 'intro_beat_tap':
      // Increment beatTapCount — the next event will read the existing value
      // but for now we store the running count the client sends
      return {
        _introBeatTapCount: data.beatTapCount,
      };

    case 'intro_skip':
      return {
        introAction: `Skipped @ ${new Date().toLocaleTimeString('en-IN', { hour12: true })} (after ${(data.elapsedMs / 1000).toFixed(1)}s${data.beatTapCount ? ', ' + data.beatTapCount + ' beat taps' : ''})`,
        uiTapLog:    ['Intro: Skipped'],
      };

    case 'intro_complete':
      return {
        introAction: `Completed naturally (${(data.elapsedMs / 1000).toFixed(1)}s)`,
      };

    case 'voice_browsed':
      return { _voiceBrowseIncrement: 1, uiTapLog: [`Voice: Browsed to ${data.newOrbName}`] };

    case 'voice_sample_played':
      return { _voicePlayIncrement: 1, uiTapLog: [`Voice: Played sample ${data.orbName}${data.isAutoplay ? ' (auto)' : ''}`] };

    case 'voice_confirmed':
      return {
        voiceSelected:        `${data.voiceName} — ${data.voiceLang}`,
        timeOnVoiceScreenS:   Math.round((data.timeOnScreenMs || 0) / 1000),
        uiTapLog:             [`Voice: Confirmed ${data.voiceName}`],
      };

    case 'archetype_selected':
      return {
        uiTapLog: [`Archetype: Selected ${data.archetypeTitle}`],
      };

    case 'archetype_confirmed':
      return {
        archetypeSelected:      data.archetypeTitle,
        timeOnArchetypeScreenS: Math.round((data.timeOnScreenMs || 0) / 1000),
        uiTapLog:               [`Archetype: Confirmed ${data.archetypeTitle}`],
      };

    case 'persona_viewed':
      return {
        timeOnPersonaScreenS: Math.round((data.timeOnScreenMs || 0) / 1000),
      };

    case 'dashboard_entered':
      return {
        dashboardEntryTime: new Date().toLocaleTimeString('en-IN', { hour12: true }),
        _dashEnteredAt:     Date.now(),
      };

    case 'dashboard_tab_time':
      // Map tab key → column name
      const tabMap = { b360: 'timeOnBorrower360S', strategy: 'timeOnStrategyS', execution: 'timeOnExecutionS', fulfilment: 'timeOnFulfilmentS' };
      const col    = tabMap[data.tab];
      if (!col) return {};
      return { [col]: data.durationS };

    case 'dashboard_step':
      return {
        highestStepReached: data.highestStepLabel,
        manualStepsNext:    data.totalNext,
        manualStepsPrev:    data.totalPrev,
        uiTapLog:           [`Step: ${data.action} → ${data.toStepLabel}`],
      };

    case 'dashboard_play_toggled':
      return {
        autoPlayUsed: data.playing ? 'Yes' : undefined,
        uiTapLog:     [`Auto-play: ${data.playing ? 'Started' : 'Paused'}`],
      };

    case 'dashboard_reset':
      return {
        resetCount: data.resetCount,
        uiTapLog:   [`Reset #${data.resetCount}`],
      };

    case 'direct_call_modal_opened':
      return {
        directCallModalOpened: 'Yes',
        uiTapLog:              ['Direct Call Modal: Opened'],
      };

    case 'whatsapp_toggle':
      return {
        whatsappToggleUsed: `Yes — switched to ${data.newMode.toUpperCase()}`,
        uiTapLog:           [`WhatsApp Toggle: → ${data.newMode}`],
      };

    case 'call_triggered':
      return {
        callId:     data.callId,
        callStatus: data.status || 'initiated',
        uiTapLog:   [`Call: Triggered (${data.callId})`],
      };

    case 'whatsapp_sent':
      const roundKey = data.round === 1 ? 'whatsappRound1' : 'whatsappRound2';
      return {
        [roundKey]: data.mode || 'sent',
        uiTapLog:   [`WhatsApp Round ${data.round}: ${data.mode || 'sent'} (${data.templateKey})`],
      };

    case 'call_outcome':
      const outcome = (data.escalation_flag || data.dispute_flag) ? 'escalated'
        : data.call_success === true ? 'resolved'
        : data.call_success === false ? 'not-resolved'
        : 'completed';
      return {
        callStatus:  'completed',
        callOutcome: outcome,
        uiTapLog:    [`Call outcome: ${outcome}${data.customer_sentiment ? ' · ' + data.customer_sentiment : ''}`],
      };

    case 'dashboard_total_time':
      return { dashboardTotalTimeS: data.totalS };

    default:
      return data; // pass-through for any future events
  }
}

// ─── GET /api/telemetry/sessions ─────────────────────────────────────────────
router.get('/telemetry/sessions', (req, res) => {
  res.json(store.getAll());
});

// ─── GET /api/telemetry/export-csv ───────────────────────────────────────────
router.get('/telemetry/export-csv', (req, res) => {
  const csv = store.exportCsv();
  const filename = `kollect-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

module.exports = router;
