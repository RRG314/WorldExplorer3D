import { observeAuth } from './auth-ui.js?v=55';
import { initFirebaseAnalytics, readFirebaseConfig } from './firebase-init.js?v=55';
import { readAnalyticsConsent } from './analytics-consent.js?v=1';

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
let productEventsBound = false;
let discoveryEventListener = null;
let tutorialEventListener = null;
let productEventListener = null;
let consentEventListener = null;
let lastAuthUser = null;

const ALLOWED_PRODUCT_EVENTS = new Set([
  'tutorial_begin',
  'tutorial_complete',
  'we3d_tutorial_step',
  'we3d_discovery_action',
  'leaderboard_view',
  'leaderboard_refresh',
  'score_submit',
  'room_create',
  'room_join',
  'room_leave',
  'room_artifact_share',
  'friend_add',
  'explorer_progress'
]);

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
  productEventCount: 0,
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
  if (readAnalyticsConsent() !== 'granted') return false;
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

function sanitizeEventParams(params = {}) {
  const safe = {};
  Object.entries(params && typeof params === 'object' ? params : {}).slice(0, 20).forEach(([rawKey, rawValue]) => {
    const key = sanitizeAnalyticsName(rawKey, '', 40);
    if (!key || rawValue == null) return;
    if (typeof rawValue === 'boolean') safe[key] = rawValue;
    else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) safe[key] = rawValue;
    else if (Array.isArray(rawValue)) safe[key] = rawValue.map((value) => sanitizeAnalyticsName(value, '', 32)).filter(Boolean).slice(0, 4).join('|');
    else safe[key] = sanitizeAnalyticsName(rawValue, 'unknown', 80);
  });
  return safe;
}

async function trackProductEvent(eventName, params = {}) {
  const name = String(eventName || '').trim();
  if (!ALLOWED_PRODUCT_EVENTS.has(name)) return false;
  const logged = await logAnalyticsEvent(name, sanitizeEventParams(params));
  if (logged) state.productEventCount += 1;
  return logged;
}

function bindProductEvents() {
  if (productEventsBound || typeof globalThis.addEventListener !== 'function') return;
  productEventsBound = true;
  discoveryEventListener = (event) => {
    const detail = event?.detail || {};
    void trackProductEvent('we3d_discovery_action', {
      action: detail.type,
      activity_id: detail.activityId,
      catalog_family: detail.catalogFamily,
      discipline: detail.discipline,
      context_bands: detail.contextBands,
      result: detail.result,
      multiplayer: detail.multiplayer,
      live_gps: detail.liveGps,
      schema_version: detail.schemaVersion
    });
  };
  tutorialEventListener = (event) => {
    const detail = event?.detail || {};
    void trackProductEvent(detail.name, detail.params || {});
  };
  productEventListener = (event) => {
    const detail = event?.detail || {};
    void trackProductEvent(detail.name, detail.params || {});
  };
  globalThis.addEventListener('we3d:discovery-telemetry', discoveryEventListener);
  globalThis.addEventListener('we3d:tutorial-telemetry', tutorialEventListener);
  globalThis.addEventListener('we3d:product-telemetry', productEventListener);
  globalThis.__WE3D_ANALYTICS_PRODUCT_EVENTS_BOUND__ = true;
  const queuedTutorialEvents = Array.isArray(globalThis.__WE3D_TUTORIAL_ANALYTICS_QUEUE__)
    ? globalThis.__WE3D_TUTORIAL_ANALYTICS_QUEUE__.splice(0)
    : [];
  queuedTutorialEvents.forEach((detail) => tutorialEventListener({ detail }));
  const queuedProductEvents = Array.isArray(globalThis.__WE3D_PRODUCT_TELEMETRY_QUEUE__)
    ? globalThis.__WE3D_PRODUCT_TELEMETRY_QUEUE__.splice(0)
    : [];
  queuedProductEvents.forEach((detail) => productEventListener({ detail }));
}

function unbindProductEvents() {
  if (!productEventsBound || typeof globalThis.removeEventListener !== 'function') return;
  productEventsBound = false;
  globalThis.__WE3D_ANALYTICS_PRODUCT_EVENTS_BOUND__ = false;
  if (discoveryEventListener) globalThis.removeEventListener('we3d:discovery-telemetry', discoveryEventListener);
  if (tutorialEventListener) globalThis.removeEventListener('we3d:tutorial-telemetry', tutorialEventListener);
  if (productEventListener) globalThis.removeEventListener('we3d:product-telemetry', productEventListener);
  discoveryEventListener = null;
  tutorialEventListener = null;
  productEventListener = null;
}

async function syncAnalyticsUser(user = null) {
  if (readAnalyticsConsent() !== 'granted') {
    state.currentUserId = '';
    return;
  }
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

  consentEventListener = async (event) => {
    const analyticsMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js').catch(() => null);
    const granted = event?.detail?.value === 'granted';
    analyticsMod?.setConsent?.({
      analytics_storage: granted ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    if (granted) {
      void syncAnalyticsUser(lastAuthUser);
    } else {
      state.currentUserId = '';
      const tools = await ensureAnalyticsTools();
      tools?.setUserId?.(tools.analytics, null);
    }
  };
  globalThis.addEventListener?.('we3d:analytics-consent', consentEventListener, { passive: true });

  void ensureAnalyticsTools();
  bindLifecycle(appCtx);
  bindProductEvents();

  authUnsubscribe = observeAuth((user) => {
    lastAuthUser = user || null;
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
  if (consentEventListener) {
    globalThis.removeEventListener?.('we3d:analytics-consent', consentEventListener);
    consentEventListener = null;
  }
  lastAuthUser = null;
  unbindProductEvents();
}

function getAnalyticsSessionSnapshot(appCtx = null) {
  const ctx = appCtx || globalThis.appCtx || globalThis.__WE3D_APP_CTX__ || null;
  const now = Date.now();
  return {
    enabled: !!state.enabled,
    ready: !!state.ready,
    measurementId: state.measurementId || '',
    consent: readAnalyticsConsent(),
    currentUserId: state.currentUserId || '',
    trackingStarted,
    runtimeAgeSec: clampDurationSec((now - (state.runtimeStartedAt || now)) / 1000),
    worldSessionActive: !!state.worldSessionActive,
    worldSessionAgeSec: state.worldSessionActive ? clampDurationSec((now - state.worldSessionStartedAt) / 1000) : 0,
    worldSessionCount: state.worldSessionCount,
    flushCount: state.flushCount,
    productEventCount: state.productEventCount,
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
  stopAnalyticsTracking,
  trackProductEvent
};
