/**
 * telemetry.js — Kollect GFF Booth Demo
 *
 * Core client-side telemetry engine.  Loaded FIRST (before state.js) so
 * every other script can call window.track() safely.
 *
 * Design rules:
 *  • Never throw — all calls are fire-and-forget, errors are swallowed.
 *  • Never block the UI — all POSTs are async with no await in call sites.
 *  • Session ID is stored in sessionStorage so a page refresh starts a new row.
 */

(function () {
  'use strict';

  // ── Session ID ──────────────────────────────────────────────────────────────
  function makeId() {
    return 'ses_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }
  let sessionId = sessionStorage.getItem('kl_session_id') || makeId();
  sessionStorage.setItem('kl_session_id', sessionId);

  // ── Cumulative counters (kept in memory, flushed via track()) ────────────────
  let _voiceBrowseCount = 0;
  let _voicePlayCount   = 0;
  let _manualNext       = 0;
  let _manualPrev       = 0;
  let _resetCount       = 0;
  let _beatTapCount     = 0;

  // ── Screen / tab timers ─────────────────────────────────────────────────────
  let _screenEnterTs  = null;   // when the current named screen was entered
  let _currentScreen  = null;   // e.g. 'intro', 'voice', 'archetype', 'persona'

  let _dashTabEnterTs = null;   // when the current dashboard tab became active
  let _currentDashTab = null;   // 'b360' | 'strategy' | 'execution' | 'fulfilment'
  let _tabAccumS      = {};     // accumulated seconds per tab key
  let _dashEnterTs    = null;   // when dashboard was first entered
  let _heartbeat      = null;   // interval for flushing tab time

  // ── Dashboard step tracking ─────────────────────────────────────────────────
  let _highestStep    = 0;
  let _highestLabel   = '';

  // ── POST helper ─────────────────────────────────────────────────────────────
  function post(event, payload) {
    try {
      fetch('/api/telemetry/event', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId, event, ...payload }),
      }).catch(function () {}); // swallow network errors
    } catch (e) { /* ignore */ }
  }

  // sendBeacon for unload safety (best-effort)
  function beacon(event, payload) {
    try {
      const data = JSON.stringify({ sessionId, event, ...payload });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/telemetry/event', new Blob([data], { type: 'application/json' }));
      } else {
        post(event, payload);
      }
    } catch (e) { /* ignore */ }
  }

  // ── Tab & screen time helpers ──────────────────────────────────────────────
  function flushTabTime() {
    if (!_currentDashTab || !_dashTabEnterTs) return;
    const now = Date.now();
    const s   = Math.round((now - _dashTabEnterTs) / 1000);
    if (s <= 0) return;
    _tabAccumS[_currentDashTab] = (_tabAccumS[_currentDashTab] || 0) + s;
    _dashTabEnterTs = now;
    post('dashboard_tab_time', { tab: _currentDashTab, durationS: _tabAccumS[_currentDashTab] });
  }

  function flushDashboardTotal() {
    if (!_dashEnterTs) return;
    const totalS = Math.round((Date.now() - _dashEnterTs) / 1000);
    beacon('dashboard_total_time', { totalS });
  }

  function flushActiveScreen() {
    if (!_screenEnterTs || !_currentScreen || _currentScreen === 'dashboard') return;
    const elapsedMs = Date.now() - _screenEnterTs;
    if (elapsedMs < 1000) return;
    beacon('screen_dropoff', { screen: _currentScreen, timeOnScreenMs: elapsedMs });
  }

  // Heartbeat — flushes the active tab time every 15 s so even if the user
  // sits on one tab for a long time, we capture incremental progress.
  function startHeartbeat() {
    if (_heartbeat) clearInterval(_heartbeat);
    _heartbeat = setInterval(flushTabTime, 15000);
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  /**
   * track(event, payload)
   * Called by capture.js, softlaunch.js, orbs.js, archetype.js, persona.js,
   * dashboard.js to record events.
   */
  function track(event, payload) {
    payload = payload || {};

    switch (event) {

      // ── Login (Always generates a fresh sessionId for each attendee) ───────
      case 'login':
        sessionId = makeId();
        sessionStorage.setItem('kl_session_id', sessionId);
        window._telemetrySessionId = sessionId;

        _voiceBrowseCount = 0;
        _voicePlayCount   = 0;
        _manualNext       = 0;
        _manualPrev       = 0;
        _resetCount       = 0;
        _beatTapCount     = 0;
        _screenEnterTs    = null;
        _currentScreen    = 'login';
        _dashTabEnterTs   = null;
        _currentDashTab   = null;
        _tabAccumS        = {};
        _dashEnterTs      = null;
        _highestStep      = 0;
        _highestLabel     = 'Login';
        if (_heartbeat) { clearInterval(_heartbeat); _heartbeat = null; }

        post('login', {
          name:      payload.name,
          phone:     payload.phone,
          method:    payload.method,
          timestamp: new Date().toLocaleString('en-IN', { hour12: true }),
        });
        break;

      // ── Soft Launch / Intro ────────────────────────────────────────────────
      case 'intro_start':
        _screenEnterTs = Date.now();
        _currentScreen = 'intro';
        _beatTapCount  = 0;
        post('screen_entered', { screenName: 'Intro Cinematic' });
        break;

      case 'intro_beat_tap':
        _beatTapCount++;
        // Debounced — only post on every other tap to avoid flooding
        if (_beatTapCount % 2 === 0) {
          post('intro_beat_tap', { beatTapCount: _beatTapCount });
        }
        break;

      case 'intro_skip':
        post('intro_skip', {
          elapsedMs:    _screenEnterTs ? Date.now() - _screenEnterTs : 0,
          beatTapCount: _beatTapCount,
        });
        break;

      case 'intro_complete':
        post('intro_complete', {
          elapsedMs: _screenEnterTs ? Date.now() - _screenEnterTs : 0,
        });
        break;

      // ── Voice Orb screen ───────────────────────────────────────────────────
      case 'voice_screen_entered':
        _screenEnterTs = Date.now();
        _currentScreen = 'voice';
        post('screen_entered', { screenName: 'Voice Selection' });
        break;

      case 'voice_browsed':
        _voiceBrowseCount++;
        post('voice_browsed', { newOrbName: payload.newOrbName, direction: payload.direction });
        break;

      case 'voice_sample_played':
        _voicePlayCount++;
        post('voice_sample_played', { orbName: payload.orbName, isAutoplay: !!payload.isAutoplay });
        break;

      case 'voice_confirmed':
        post('voice_confirmed', {
          voiceName:      payload.voiceName,
          voiceLang:      payload.voiceLang,
          timeOnScreenMs: _screenEnterTs ? Date.now() - _screenEnterTs : 0,
          browseCount:    _voiceBrowseCount,
          playCount:      _voicePlayCount,
        });
        break;

      // ── Archetype screen ───────────────────────────────────────────────────
      case 'archetype_screen_entered':
        _screenEnterTs = Date.now();
        _currentScreen = 'archetype';
        post('screen_entered', { screenName: 'Archetype Selection' });
        break;

      case 'archetype_selected':
        post('archetype_selected', {
          archetypeId:    payload.archetypeId,
          archetypeTitle: payload.archetypeTitle,
        });
        break;

      case 'archetype_confirmed':
        post('archetype_confirmed', {
          archetypeId:    payload.archetypeId,
          archetypeTitle: payload.archetypeTitle,
          timeOnScreenMs: _screenEnterTs ? Date.now() - _screenEnterTs : 0,
        });
        break;

      // ── Persona screen ─────────────────────────────────────────────────────
      case 'persona_screen_entered':
        _screenEnterTs = Date.now();
        _currentScreen = 'persona';
        post('screen_entered', { screenName: 'Persona Reveal' });
        break;

      case 'dashboard_entered':
        // Flush persona screen time first
        if (_screenEnterTs && _currentScreen === 'persona') {
          post('persona_viewed', { timeOnScreenMs: Date.now() - _screenEnterTs });
        }
        _currentScreen  = 'dashboard';
        _dashEnterTs    = Date.now();
        _dashTabEnterTs = Date.now();
        _currentDashTab = 'b360';
        _tabAccumS      = {};
        startHeartbeat();
        post('dashboard_entered', {});
        break;

      // ── Dashboard tab & step tracking ──────────────────────────────────────
      case 'dashboard_tab_changed':
        flushTabTime();
        _currentDashTab = payload.tab;
        _dashTabEnterTs = Date.now();
        break;

      case 'dashboard_step':
        // Track highest step reached
        if (payload.toStep > _highestStep) {
          _highestStep  = payload.toStep;
          _highestLabel = payload.toStepLabel || ('Step ' + (payload.toStep + 1) + '/13');
        }
        if (payload.action === 'next') _manualNext++;
        if (payload.action === 'prev') _manualPrev++;
        post('dashboard_step', {
          action:          payload.action,
          fromStep:        payload.fromStep,
          toStep:          payload.toStep,
          toStepLabel:     payload.toStepLabel,
          highestStepLabel: _highestLabel,
          totalNext:       _manualNext,
          totalPrev:       _manualPrev,
        });
        break;

      case 'dashboard_play_toggled':
        post('dashboard_play_toggled', { playing: payload.playing });
        break;

      case 'dashboard_reset':
        _resetCount++;
        _highestStep  = 0;
        _highestLabel = '';
        _manualNext   = 0;
        _manualPrev   = 0;
        post('dashboard_reset', { resetCount: _resetCount });
        break;

      // ── Modals & toggles ───────────────────────────────────────────────────
      case 'direct_call_modal_opened':
        post('direct_call_modal_opened', {});
        break;

      case 'whatsapp_toggle':
        post('whatsapp_toggle', { newMode: payload.newMode });
        break;

      // ── Call & WhatsApp ────────────────────────────────────────────────────
      case 'call_triggered':
        post('call_triggered', {
          callId:  payload.callId,
          status:  payload.status,
          voiceId: payload.voiceId,
        });
        break;

      case 'whatsapp_sent':
        post('whatsapp_sent', {
          round:       payload.round,
          templateKey: payload.templateKey,
          mode:        payload.mode,
        });
        break;

      case 'call_outcome':
        post('call_outcome', {
          callId:             payload.callId,
          call_success:       payload.call_success,
          customer_sentiment: payload.customer_sentiment,
          escalation_flag:    payload.escalation_flag,
          dispute_flag:       payload.dispute_flag,
          ptp_flag:           payload.ptp_flag,
          next_best_action:   payload.next_best_action,
        });
        break;

      default:
        post(event, payload);
    }
  }

  // ── Flush on page unload ────────────────────────────────────────────────────
  window.addEventListener('pagehide', function () {
    flushActiveScreen();
    flushTabTime();
    flushDashboardTotal();
  });
  window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      flushActiveScreen();
      flushTabTime();
      flushDashboardTotal();
    }
  });

  // ── Expose globally ─────────────────────────────────────────────────────────
  window.track = track;
  window._telemetrySessionId = sessionId;

})();

