import { observeAuth } from './auth-ui.js';
import { initFirebaseAnalytics, readFirebaseConfig } from './firebase-init.js';

const ANALYTICS_EVENT_WORLD_START = 'we3d_world_session_start';
const ANALYTICS_EVENT_WORLD_END = 'we3d_world_session_end';
const ANALYTICS_EVENT_MODE_CHANGE = 'we3d_travel_mode_change';
const ANALYTICS_EVENT_ENV_CHANGE = 'we3d_environment_change';
const ANALYTICS_EVENT_RUNTIME_READY = 'we3d_runtime_ready';
const ANALYTICS_POLL_MS = 2000;
const ANALYTICS_MAX_SESSION_SEC = 24 * 60 * 60;

let analyticsToolsPromise = null;
let analyticsTools = null;
let trackingStarted = false;
let trackingInterval = 0;
let unloadBound = false;
let authUnsubscribe = null;

const state = {
  enabled: false,
  ready: false,
  measurementId: '',
  currentUserId: '',
  runtimeStartedAt: 0,
  runtimeReadyLogged: false,
  worldSessionActive: false,
  worldSessionStartedAt: 0,
  worldSessionCount: 0,
  flushCount: 0,
  lastMode: '',
  lastEnvironment: '',
  lastLocationKey: '',
  lastMultiplayer: false,
  lastReason: '',
  errors: []
};

function sanitizeAnalyticsName(value, fallback = 'unknown', max = 40) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max);
  return normalized || fallback;
}

function clampDurationSec(value) {
  const seconds = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(ANALYTICS_MAX_SESSION_SEC, seconds));
}

function locationContext(appCtx) {
  const selected = String(appCtx.selLoc || '').trim();
  if (selected === 'custom') {
    return {
      locationKey: 'custom',
      locationType: 'custom',
      locationName: String(appCtx.customLoc?.name || 'Custom Location').trim() || 'Custom Location'
    };
  }
  const preset = appCtx.LOCS?.[selected] || null;
  return {
    locationKey: sanitizeAnalyticsName(selected || 'unknown', 'unknown', 48),
    locationType: preset ? 'preset' : 'unknown',
    locationName: String(preset?.name || selected || 'Unknown').trim() || 'Unknown'
  };
}

function currentEnvironment(appCtx) {
  if (appCtx.oceanMode?.active || (typeof appCtx.isEnv === 'function' && appCtx.ENV && appCtx.isEnv(appCtx.ENV.OCEAN))) return 'ocean';
  if (appCtx.spaceFlight?.active || (typeof appCtx.isEnv === 'function' && appCtx.ENV && appCtx.isEnv(appCtx.ENV.SPACE_FLIGHT))) return 'space';
  if (appCtx.onMoon) return 'moon';
  return 'earth';
}

function currentTravelMode(appCtx) {
  if (appCtx.spaceFlight?.active || (typeof appCtx.isEnv === 'function' && appCtx.ENV && appCtx.isEnv(appCtx.ENV.SPACE_FLIGHT))) return 'space_flight';
  if (appCtx.boatMode?.active) return 'boat';
  if (appCtx.oceanMode?.active || (typeof appCtx.isEnv === 'function' && appCtx.ENV && appCtx.isEnv(appCtx.ENV.OCEAN))) return 'submarine';
  if (appCtx.Walk?.state?.mode === 'walk') return 'walking';
  if (appCtx.droneMode) return 'drone';
  return 'driving';
}

function worldSessionParams(appCtx, extra = {}) {
  const loc = locationContext(appCtx);
  return {
    environment: currentEnvironment(appCtx),
    travel_mode: currentTravelMode(appCtx),
    location_key: loc.locationKey,
    location_type: loc.locationType,
    multiplayer: !!appCtx.multiplayerMapRooms?.currentRoomCode,
    game_mode: sanitizeAnalyticsName(appCtx.gameMode || 'free', 'free', 24),
    ...extra
  };
}

async function ensureAnalyticsTools() {
  if (analyticsTools) return analyticsTools;
  if (analyticsToolsPromise) return analyticsToolsPromise;
  analyticsToolsPromise = (async () => {
    const measurementId = String(readFirebaseConfig()?.measurementId || '').trim();
    state.measurementId = measurementId;
    const analytics = await initFirebaseAnalytics();
    if (!analytics) {
      state.enabled = false;
      state.ready = false;
      analyticsTools = null;
      return null;
    }
    const analyticsMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js');
    analyticsTools = {
      analytics,
      logEvent: analyticsMod.logEvent,
      setUserId: analyticsMod.setUserId,
      setUserProperties: analyticsMod.setUserProperties
    };
    state.enabled = true;
    state.ready = true;
    return analyticsTools;
  })().catch((error) => {
    state.enabled = false;
    state.ready = false;
    state.errors.push(String(error?.message || error));
    analyticsTools = null;
    return null;
  }).finally(() => {
    analyticsToolsPromise = null;
  });
  return analyticsToolsPromise;
}

async function logAnalyticsEvent(eventName, params = {}) {
  const tools = await ensureAnalyticsTools();
  if (!tools?.analytics || typeof tools.logEvent !== 'function') return false;
  try {
    tools.logEvent(tools.analytics, eventName, params);
    return true;
  } catch (error) {
    state.errors.push(String(error?.message || error));
    return false;
  }
}

async function syncAnalyticsUser(user = null) {
  const tools = await ensureAnalyticsTools();
  if (!tools?.analytics) return;
  try {
    tools.setUserId?.(tools.analytics, user?.uid || null);
    tools.setUserProperties?.(tools.analytics, {
      signed_in: !!user,
      auth_provider: user?.isAnonymous ? 'guest' : (user?.providerData?.[0]?.providerId || (user ? 'password' : 'none'))
    });
    state.currentUserId = user?.uid || '';
  } catch (error) {
    state.errors.push(String(error?.message || error));
  }
}

async function logRuntimeReady(appCtx) {
  if (state.runtimeReadyLogged) return;
  state.runtimeReadyLogged = true;
  await logAnalyticsEvent(ANALYTICS_EVENT_RUNTIME_READY, worldSessionParams(appCtx, {
    ready_source: 'app_boot'
  }));
}

async function startWorldSession(appCtx, reason = 'game_started') {
  if (state.worldSessionActive) return;
  state.worldSessionActive = true;
  state.worldSessionStartedAt = Date.now();
  state.worldSessionCount += 1;
  state.lastReason = reason;
  state.lastMode = currentTravelMode(appCtx);
  state.lastEnvironment = currentEnvironment(appCtx);
  state.lastLocationKey = locationContext(appCtx).locationKey;
  state.lastMultiplayer = !!appCtx.multiplayerMapRooms?.currentRoomCode;
  await logAnalyticsEvent(ANALYTICS_EVENT_WORLD_START, worldSessionParams(appCtx, {
    start_reason: sanitizeAnalyticsName(reason, 'game_started', 32),
    session_index: state.worldSessionCount
  }));
}

async function endWorldSession(appCtx, reason = 'ended') {
  if (!state.worldSessionActive) return;
  const durationSec = clampDurationSec((Date.now() - state.worldSessionStartedAt) / 1000);
  state.worldSessionActive = false;
  state.worldSessionStartedAt = 0;
  state.flushCount += 1;
  state.lastReason = reason;
  await logAnalyticsEvent(ANALYTICS_EVENT_WORLD_END, worldSessionParams(appCtx, {
    end_reason: sanitizeAnalyticsName(reason, 'ended', 32),
    duration_sec: durationSec,
    session_index: state.worldSessionCount
  }));
}

async function maybeLogModeChange(appCtx) {
  const nextMode = currentTravelMode(appCtx);
  if (nextMode === state.lastMode) return;
  const previousMode = state.lastMode || 'unknown';
  state.lastMode = nextMode;
  if (!state.worldSessionActive) return;
  await logAnalyticsEvent(ANALYTICS_EVENT_MODE_CHANGE, {
    previous_mode: previousMode,
    next_mode: nextMode,
    environment: currentEnvironment(appCtx)
  });
}

async function maybeLogEnvironmentChange(appCtx) {
  const nextEnvironment = currentEnvironment(appCtx);
  if (nextEnvironment === state.lastEnvironment) return;
  const previousEnvironment = state.lastEnvironment || 'unknown';
  state.lastEnvironment = nextEnvironment;
  if (!state.worldSessionActive) return;
  await logAnalyticsEvent(ANALYTICS_EVENT_ENV_CHANGE, {
    previous_environment: previousEnvironment,
    next_environment: nextEnvironment,
    travel_mode: currentTravelMode(appCtx)
  });
}

async function tick(appCtx) {
  if (!appCtx) return;
  await logRuntimeReady(appCtx);

  if (appCtx.gameStarted && !state.worldSessionActive) {
    await startWorldSession(appCtx);
  } else if (!appCtx.gameStarted && state.worldSessionActive) {
    await endWorldSession(appCtx, 'returned_to_title');
  }

  await maybeLogModeChange(appCtx);
  await maybeLogEnvironmentChange(appCtx);

  const loc = locationContext(appCtx);
  state.lastLocationKey = loc.locationKey;
  state.lastMultiplayer = !!appCtx.multiplayerMapRooms?.currentRoomCode;
}

function bindLifecycle(appCtx) {
  if (unloadBound || typeof window === 'undefined') return;
  unloadBound = true;

  const flushHidden = () => {
    if (document.visibilityState === 'hidden') {
      void endWorldSession(appCtx, 'tab_hidden');
    }
  };
  const flushUnload = () => {
    void endWorldSession(appCtx, 'page_unload');
  };

  document.addEventListener('visibilitychange', flushHidden);
  window.addEventListener('pagehide', flushUnload);
  window.addEventListener('beforeunload', flushUnload);
}

function startAnalyticsTracking(appCtx) {
  if (trackingStarted) return state;
  trackingStarted = true;
  state.runtimeStartedAt = Date.now();
  state.measurementId = String(readFirebaseConfig()?.measurementId || '').trim();

  void ensureAnalyticsTools();
  bindLifecycle(appCtx);

  authUnsubscribe = observeAuth((user) => {
    void syncAnalyticsUser(user || null);
  });

  void tick(appCtx);
  trackingInterval = window.setInterval(() => {
    void tick(appCtx);
  }, ANALYTICS_POLL_MS);

  return state;
}

function stopAnalyticsTracking() {
  if (!trackingStarted) return;
  trackingStarted = false;
  if (trackingInterval) {
    window.clearInterval(trackingInterval);
    trackingInterval = 0;
  }
  if (typeof authUnsubscribe === 'function') {
    authUnsubscribe();
    authUnsubscribe = null;
  }
}

function getAnalyticsSessionSnapshot(appCtx = null) {
  const ctx = appCtx || globalThis.appCtx || globalThis.__WE3D_APP_CTX__ || null;
  const now = Date.now();
  return {
    enabled: !!state.enabled,
    ready: !!state.ready,
    measurementId: state.measurementId || '',
    currentUserId: state.currentUserId || '',
    trackingStarted,
    runtimeAgeSec: clampDurationSec((now - (state.runtimeStartedAt || now)) / 1000),
    worldSessionActive: !!state.worldSessionActive,
    worldSessionAgeSec: state.worldSessionActive ? clampDurationSec((now - state.worldSessionStartedAt) / 1000) : 0,
    worldSessionCount: state.worldSessionCount,
    flushCount: state.flushCount,
    currentMode: ctx ? currentTravelMode(ctx) : '',
    currentEnvironment: ctx ? currentEnvironment(ctx) : '',
    lastLocationKey: state.lastLocationKey || '',
    multiplayer: !!(ctx?.multiplayerMapRooms?.currentRoomCode),
    errors: state.errors.slice(-4)
  };
}

export {
  getAnalyticsSessionSnapshot,
  startAnalyticsTracking,
  stopAnalyticsTracking
};
