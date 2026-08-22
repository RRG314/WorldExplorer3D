import { ctx as appCtx } from '../shared-context.js?v=55';
import {
  LIVE_GPS_POLICY,
  createLiveGpsModel,
  ingestLiveGpsFix,
  liveGpsModelSnapshot,
  normalizeBrowserPosition,
  resetLiveGpsAtOrigin
} from './model.js?v=1';

const LIVE_GPS_WATCH_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 5_000
});
const LIVE_GPS_LOW_POWER_WATCH_OPTIONS = Object.freeze({
  enableHighAccuracy: false,
  timeout: 25_000,
  maximumAge: 20_000
});

let preparedStart = null;
let activeSession = null;
let consentPromise = null;
let uiBound = false;

function geolocationErrorMessage(error) {
  const code = Number(error?.code);
  if (code === 1) return 'Location access is off. Enable it in browser settings, or use a selected location.';
  if (code === 2) return 'This device cannot provide a location right now. Try outdoors or use a selected location.';
  if (code === 3) return 'A location fix took too long. Try outdoors or use a selected location.';
  return error?.message || 'Live location is unavailable right now.';
}

function geolocationAvailable() {
  return !!globalThis.navigator?.geolocation &&
    typeof globalThis.navigator.geolocation.getCurrentPosition === 'function' &&
    typeof globalThis.navigator.geolocation.watchPosition === 'function';
}

function secureContextAvailable() {
  if (globalThis.isSecureContext === true) return true;
  const hostname = String(globalThis.location?.hostname || '').toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function setConsentStatus(message = '', error = false) {
  const element = document.getElementById('liveGpsPermissionStatus');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', error);
}

function closeConsent(result = false) {
  document.getElementById('liveGpsPermissionPanel')?.classList.remove('show');
  document.body?.classList.remove('live-gps-consent-open');
  if (!consentPromise) return;
  const pending = consentPromise;
  consentPromise = null;
  pending.resolve(result);
}

function acceptConsent() {
  if (!consentPromise) {
    closeConsent(false);
    return;
  }
  const pending = consentPromise;
  consentPromise = null;
  pending.resolve(true);
}

function requestConsent() {
  ensureUiBound();
  if (consentPromise) return consentPromise.promise;
  const panel = document.getElementById('liveGpsPermissionPanel');
  if (!panel) return Promise.resolve(false);
  setConsentStatus('');
  const continueButton = document.getElementById('liveGpsPermissionContinue');
  if (continueButton) continueButton.textContent = 'Continue & Allow Location';
  panel.classList.add('show');
  document.body?.classList.add('live-gps-consent-open');
  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  consentPromise = { promise, resolve: resolvePromise };
  return promise;
}

function requestFreshPosition(options = LIVE_GPS_WATCH_OPTIONS) {
  return new Promise((resolve, reject) => {
    if (!secureContextAvailable()) {
      reject(new Error('Live GPS requires HTTPS on a phone. Open the secure phone-test link.'));
      return;
    }
    if (!geolocationAvailable()) {
      reject(new Error('Geolocation is not supported in this browser.'));
      return;
    }
    globalThis.navigator.geolocation.getCurrentPosition(resolve, reject, {
      ...options,
      maximumAge: 0
    });
  });
}

async function prepareLiveGpsStart(options = {}) {
  const source = String(options.source || 'title');
  const setWorldLocation = options.setWorldLocation !== false;
  const consented = await requestConsent();
  if (!consented) return false;
  setConsentStatus('Getting a fresh GPS fix…');
  const continueButton = document.getElementById('liveGpsPermissionContinue');
  if (continueButton) continueButton.disabled = true;
  try {
    const browserPosition = await requestFreshPosition();
    const fix = normalizeBrowserPosition(browserPosition);
    if (!(fix.accuracy <= LIVE_GPS_POLICY.poorAccuracyMeters)) {
      throw new Error(`GPS accuracy is currently about ${Math.round(fix.accuracy)} m. Move near a window or outdoors and retry.`);
    }
    preparedStart = { fix, source, setWorldLocation, preparedAt: Date.now() };
    if (setWorldLocation) {
      appCtx.setCustomLocation?.({
        lat: fix.latitude,
        lon: fix.longitude,
        name: 'Live GPS Location',
        arrivalMode: 'walk'
      }, { transient: true });
      appCtx.setCustomLocationTransient?.(true);
      appCtx.pendingCustomLaunchBypass = true;
    }
    closeConsent(true);
    return { ...preparedStart, fix: { ...fix } };
  } catch (error) {
    setConsentStatus(geolocationErrorMessage(error), true);
    if (continueButton) continueButton.textContent = 'Close & Retry';
    return false;
  } finally {
    if (continueButton) continueButton.disabled = false;
  }
}

function stopWatch(session = activeSession) {
  if (!session || session.watchId === null) return;
  try {
    globalThis.navigator?.geolocation?.clearWatch?.(session.watchId);
  } catch {}
  session.watchId = null;
}

function ingestSessionPosition(session, position, source = 'watch') {
  if (!session || session !== activeSession) return null;
  const result = ingestLiveGpsFix(session.model, position, Date.now());
  session.lastFixResult = result.reason;
  session.lastSource = source;
  if (result.accepted) {
    session.signalLost = false;
    session.lastAcceptedAt = Date.now();
    const speedMps = Number(result.speedMps || 0);
    if (speedMps >= 4.8) {
      session.fastFixCount += 1;
      session.slowFixCount = 0;
    } else if (speedMps < 2.4) {
      session.slowFixCount += 1;
      session.fastFixCount = 0;
    } else {
      session.fastFixCount = 0;
      session.slowFixCount = 0;
    }
    if (session.travelMode !== 'drive' && session.fastFixCount >= 3) {
      session.travelMode = 'drive';
      session.notice = 'Vehicle-speed travel detected. GPS-follow is using the road vehicle.';
      appCtx.setTravelMode?.('drive', { source: 'live_gps_speed_detection', emitTutorial: false });
    } else if (session.travelMode === 'drive' && session.slowFixCount >= 4) {
      session.travelMode = 'walk';
      session.notice = 'Walking-speed travel detected. GPS-follow is using the explorer.';
      appCtx.setTravelMode?.('walk', { source: 'live_gps_speed_detection', emitTutorial: false });
    }
  } else if (result.reason === 'poor-accuracy') {
    session.notice = `Poor GPS accuracy (${Math.round(result.fix.accuracy)} m). Position held.`;
  } else if (result.reason === 'jump-quarantined') {
    session.notice = 'Large GPS jump held while waiting for a confirming fix.';
  }
  updateLiveGpsHud(true);
  return result;
}

function watchOptionsForSession(session) {
  return session?.lowPower ? LIVE_GPS_LOW_POWER_WATCH_OPTIONS : LIVE_GPS_WATCH_OPTIONS;
}

function startWatch(session = activeSession) {
  if (!session || session !== activeSession || session.watchId !== null || !geolocationAvailable()) return false;
  const generation = ++session.watchGeneration;
  session.watchId = globalThis.navigator.geolocation.watchPosition(
    (position) => {
      if (session !== activeSession || generation !== session.watchGeneration) return;
      ingestSessionPosition(session, position, 'watch');
    },
    (error) => {
      if (session !== activeSession || generation !== session.watchGeneration) return;
      session.notice = geolocationErrorMessage(error);
      if (Number(error?.code) === 1) {
        stopWatch(session);
        session.permissionDenied = true;
        session.following = false;
      }
      updateLiveGpsHud(true);
    },
    watchOptionsForSession(session)
  );
  return true;
}

async function recoverAfterVisibility(session) {
  if (!session || session !== activeSession) return;
  session.visibilityPaused = false;
  session.notice = 'Refreshing GPS after returning to World Explorer…';
  updateLiveGpsHud(true);
  try {
    const position = await requestFreshPosition(watchOptionsForSession(session));
    if (session !== activeSession) return;
    ingestSessionPosition(session, position, 'visibility-recovery');
    startWatch(session);
  } catch (error) {
    if (session !== activeSession) return;
    session.notice = geolocationErrorMessage(error);
    session.signalLost = true;
    updateLiveGpsHud(true);
  }
}

function handleVisibilityChange() {
  const session = activeSession;
  if (!session) return;
  if (document.visibilityState === 'hidden') {
    session.visibilityPaused = true;
    session.notice = 'GPS movement paused while World Explorer is not visible.';
    stopWatch(session);
    updateLiveGpsHud(true);
    return;
  }
  void recoverAfterVisibility(session);
}

function forceWalkingMode(source = 'live_gps') {
  if (appCtx.boatMode?.active) appCtx.stopBoatMode?.({ targetMode: 'walk', source });
  if (appCtx.planeMode?.active) appCtx.stopPlaneMode?.();
  if (appCtx.Walk?.state?.mode !== 'walk') {
    if (typeof appCtx.setTravelMode === 'function') appCtx.setTravelMode('walk', { source, emitTutorial: false });
    else appCtx.Walk?.setModeWalk?.();
  }
}

function startLiveGpsMode() {
  stopLiveGpsMode({ preservePrepared: true });
  ensureUiBound();
  const prepared = preparedStart;
  const origin = {
    latitude: Number(appCtx.LOC?.lat),
    longitude: Number(appCtx.LOC?.lon)
  };
  const model = createLiveGpsModel({ origin });
  activeSession = {
    active: true,
    source: prepared?.source || 'unknown',
    model,
    following: true,
    visibilityPaused: document.visibilityState === 'hidden',
    permissionDenied: false,
    signalLost: false,
    recentering: false,
    lowPower: false,
    previousQuality: null,
    watchId: null,
    watchGeneration: 0,
    lastAcceptedAt: 0,
    lastFixResult: 'waiting',
    lastSource: prepared?.source || 'plugin',
    notice: prepared ? 'GPS connected. Keep this screen open while exploring.' : 'Waiting for a GPS fix…',
    hudUpdatedAt: 0,
    statusTimer: null,
    targetWorld: null,
    snap: null,
    travelMode: 'walk',
    fastFixCount: 0,
    slowFixCount: 0
  };
  preparedStart = null;
  if (prepared?.fix) {
    const activatedAt = Date.now();
    ingestSessionPosition(activeSession, {
      ...prepared.fix,
      timestamp: activatedAt,
      receivedAt: activatedAt
    }, 'initial');
  }
  forceWalkingMode('live_gps_start');
  document.body?.classList.add('live-gps-active');
  document.getElementById('liveGpsHud')?.classList.add('show');
  document.getElementById('fLiveGps')?.classList.add('on');
  const item = document.getElementById('fLiveGps');
  if (item) item.textContent = '📍 Live GPS Explore Active';
  document.addEventListener('visibilitychange', handleVisibilityChange);
  if (!activeSession.visibilityPaused) startWatch(activeSession);
  activeSession.statusTimer = globalThis.setInterval(() => updateLiveGpsMode(), 1_000);
  updateLiveGpsHud(true);
  return activeSession;
}

function activeBoundaryMessage(session, snapshot) {
  if (session.recentering) return 'Recentering the fixed world…';
  if (session.visibilityPaused) return 'Paused while this screen is hidden.';
  if (session.permissionDenied) return 'Location permission is off.';
  if (session.signalLost) return 'GPS signal lost. Position held.';
  if (!session.following) return 'GPS-follow paused. Manual walking is available.';
  if (snapshot.boundaryState === 'hard-pause') return 'Outside the safe world area. Recenter to continue.';
  if (snapshot.boundaryState === 'recenter-ready') return 'Near the world edge. Recenter is recommended.';
  if (snapshot.boundaryState === 'warning') return 'Approaching the edge of the loaded world.';
  if (session.lastFixResult === 'poor-accuracy' || session.lastFixResult === 'jump-quarantined') return session.notice;
  return session.notice || 'GPS connected. Keep this screen open.';
}

function updateLiveGpsHud(force = false) {
  const session = activeSession;
  if (!session) return;
  const now = Date.now();
  if (!force && now - session.hudUpdatedAt < 200) return;
  session.hudUpdatedAt = now;
  const snapshot = liveGpsModelSnapshot(session.model, now);
  const status = document.getElementById('liveGpsStatus');
  const accuracy = document.getElementById('liveGpsAccuracy');
  const distance = document.getElementById('liveGpsDistance');
  const motion = document.getElementById('liveGpsMotion');
  const pauseButton = document.getElementById('liveGpsPauseBtn');
  const recenterButton = document.getElementById('liveGpsRecenterBtn');
  const lowPowerButton = document.getElementById('liveGpsLowPowerBtn');
  const boundaryState = snapshot.boundaryState;
  if (status) status.textContent = activeBoundaryMessage(session, snapshot);
  if (accuracy) accuracy.textContent = snapshot.accuracyMeters === null ? 'Accuracy —' : `Accuracy ±${Math.round(snapshot.accuracyMeters)} m`;
  if (distance) distance.textContent = `From center ${(snapshot.boundaryDistanceMeters / 1000).toFixed(2)} km`;
  if (motion) motion.textContent = `${snapshot.movementClass} · ${snapshot.speedMps.toFixed(1)} m/s`;
  if (pauseButton) {
    pauseButton.textContent = session.following ? 'Pause GPS' : 'Resume GPS';
    pauseButton.disabled = session.recentering || session.permissionDenied;
  }
  if (recenterButton) {
    recenterButton.hidden = boundaryState === 'inside' && snapshot.boundaryDistanceMeters < 1_000;
    recenterButton.disabled = session.recentering || !session.model.filtered;
  }
  if (lowPowerButton) lowPowerButton.textContent = session.lowPower ? 'Low Power On' : 'Low Power';
  const hud = document.getElementById('liveGpsHud');
  if (hud) hud.dataset.state = session.recentering ? 'recentering' : boundaryState;
}

function updateLiveGpsMode() {
  const session = activeSession;
  if (!session) return;
  const lastAge = session.model.lastReceivedAt ? Date.now() - session.model.lastReceivedAt : Infinity;
  session.signalLost = !session.visibilityPaused && lastAge > LIVE_GPS_POLICY.signalLostAfterMs;
  if (session.signalLost) session.notice = 'GPS signal lost. Position held until a fresh fix arrives.';
  updateLiveGpsHud(false);
}

function liveGpsTranslationOwned() {
  const session = activeSession;
  return !!(session?.active && session.following && !session.recentering);
}

function resolveSnapTarget(session, target) {
  session.snap = null;
  const accuracy = Number(session.model.lastAccepted?.accuracy);
  if (!(accuracy <= LIVE_GPS_POLICY.snapAccuracyLimitMeters) || typeof appCtx.findNearestTraversalFeature !== 'function') {
    return target;
  }
  const maxDistanceWorld = LIVE_GPS_POLICY.snapDistanceMeters * Number(appCtx.WORLD_UNITS_PER_METER || 1);
  const candidate = appCtx.findNearestTraversalFeature(target.x, target.z, {
    mode: session.travelMode === 'drive' ? 'drive' : 'walk',
    maxDistance: maxDistanceWorld,
    maximumCandidates: 1
  });
  const kind = String(candidate?.feature?.networkKind || candidate?.feature?.kind || 'road').toLowerCase();
  const pathLike = session.travelMode === 'drive'
    ? !/footway|path|pedestrian|steps/i.test(kind)
    : kind === 'footway' || kind === 'path' || kind === 'pedestrian' ||
      kind === 'cycleway' || candidate?.feature?.isStructureConnector === true;
  if (!candidate?.pt || !pathLike || !(candidate.dist <= maxDistanceWorld)) return target;
  session.snap = {
    kind,
    distanceMeters: candidate.dist * Number(appCtx.METERS_PER_WORLD_UNIT || 1)
  };
  return { x: candidate.pt.x, z: candidate.pt.z };
}

function resolveLiveGpsWalkerTarget(dt, current = {}) {
  const session = activeSession;
  if (!liveGpsTranslationOwned() || session.visibilityPaused || session.signalLost ||
      session.model.boundaryState === 'hard-pause' || !session.model.filtered ||
      typeof appCtx.geoToWorld !== 'function') return null;
  const projected = appCtx.geoToWorld(session.model.filtered.latitude, session.model.filtered.longitude);
  if (!Number.isFinite(projected?.x) || !Number.isFinite(projected?.z)) return null;
  const target = resolveSnapTarget(session, projected);
  session.targetWorld = { x: target.x, z: target.z };
  const currentX = Number(current.x) || 0;
  const currentZ = Number(current.z) || 0;
  const dx = target.x - currentX;
  const dz = target.z - currentZ;
  const distanceWorld = Math.hypot(dx, dz);
  if (distanceWorld < 0.002) return {
    x: target.x,
    z: target.z,
    movedWorld: 0,
    speedMps: session.model.speedMps,
    headingDegrees: session.model.headingDegrees,
    movementClass: liveGpsModelSnapshot(session.model).movementClass,
    travelMode: session.travelMode,
    snapped: !!session.snap
  };
  const safeDt = Math.max(0.001, Math.min(0.1, Number(dt) || 0.016));
  const maxMetersPerSecond = Math.min(14, Math.max(2.5, session.model.speedMps * 1.8 + 1.5));
  const maxStepWorld = maxMetersPerSecond * Number(appCtx.WORLD_UNITS_PER_METER || 1) * safeDt;
  const easedStepWorld = distanceWorld * (1 - Math.exp(-safeDt * 5));
  const stepWorld = Math.min(distanceWorld, maxStepWorld, Math.max(0.02, easedStepWorld));
  return {
    x: currentX + dx / distanceWorld * stepWorld,
    z: currentZ + dz / distanceWorld * stepWorld,
    movedWorld: stepWorld,
    speedMps: session.model.speedMps,
    headingDegrees: session.model.headingDegrees,
    movementClass: liveGpsModelSnapshot(session.model).movementClass,
    travelMode: session.travelMode,
    snapped: !!session.snap
  };
}

function pauseOrResumeLiveGps() {
  const session = activeSession;
  if (!session || session.recentering) return false;
  if (!session.following) {
    if (session.model.boundaryState === 'hard-pause') {
      session.notice = 'Recenter the world before resuming GPS-follow.';
      updateLiveGpsHud(true);
      return false;
    }
    session.following = true;
    session.notice = 'GPS-follow resumed.';
  } else {
    session.following = false;
    session.notice = 'GPS-follow paused. You can walk manually.';
  }
  updateLiveGpsHud(true);
  return session.following;
}

async function recenterLiveGpsWorld() {
  const session = activeSession;
  const fix = session?.model?.filtered;
  if (!session || session.recentering || !fix || typeof appCtx.loadRoads !== 'function') return false;
  session.recentering = true;
  session.following = false;
  session.notice = 'Recentering the fixed world. This is the only world reload.';
  updateLiveGpsHud(true);
  try {
    appCtx.setCustomLocation?.({
      lat: fix.latitude,
      lon: fix.longitude,
      name: 'Live GPS Recenter',
      arrivalMode: 'walk'
    }, { transient: true });
    appCtx.setCustomLocationTransient?.(true);
    forceWalkingMode('live_gps_recenter_prepare');
    await appCtx.loadRoads();
    if (session !== activeSession) return false;
    forceWalkingMode('live_gps_recenter_ready');
    if (typeof appCtx.applyCustomLocationSpawn === 'function') {
      appCtx.applyCustomLocationSpawn('walk', { source: 'live_gps_recenter', preferBoatIfWater: false });
    }
    resetLiveGpsAtOrigin(session.model, fix);
    session.targetWorld = null;
    session.recentering = false;
    session.following = true;
    session.notice = 'World recentered. GPS-follow resumed.';
    updateLiveGpsHud(true);
    return true;
  } catch (error) {
    if (session === activeSession) {
      session.recentering = false;
      session.notice = `Could not recenter: ${error?.message || error}`;
      updateLiveGpsHud(true);
    }
    return false;
  }
}

function toggleLiveGpsLowPower() {
  const session = activeSession;
  if (!session) return false;
  session.lowPower = !session.lowPower;
  if (session.lowPower) {
    session.previousQuality = appCtx.getRenderQualityLevel?.() || appCtx.renderQualityLevel || 'med';
    appCtx.setRenderQualityLevel?.('low', { persist: false });
    session.notice = 'Low Power Mode reduces visual quality and GPS precision.';
  } else {
    if (session.previousQuality) appCtx.setRenderQualityLevel?.(session.previousQuality, { persist: false });
    session.notice = 'Low Power Mode off.';
  }
  stopWatch(session);
  startWatch(session);
  updateLiveGpsHud(true);
  return session.lowPower;
}

function stopLiveGpsMode(options = {}, _pluginState = null, pluginReason = '') {
  if (pluginReason === 'replaced' && activeSession) {
    activeSession.notice = 'GPS-follow remains active with the selected game.';
    updateLiveGpsHud(true);
    return false;
  }
  const session = activeSession;
  if (session) {
    stopWatch(session);
    if (session.statusTimer !== null) globalThis.clearInterval(session.statusTimer);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (session.lowPower && session.previousQuality) {
      appCtx.setRenderQualityLevel?.(session.previousQuality, { persist: false });
    }
  }
  activeSession = null;
  if (!options.preservePrepared) preparedStart = null;
  document.body?.classList.remove('live-gps-active');
  document.getElementById('liveGpsHud')?.classList.remove('show');
  document.getElementById('fLiveGps')?.classList.remove('on');
  const item = document.getElementById('fLiveGps');
  if (item) item.textContent = '📍 Start Live GPS Explore';
  return true;
}

function getLiveGpsSnapshot() {
  const session = activeSession;
  if (!session) return { active: false };
  const model = liveGpsModelSnapshot(session.model);
  return {
    active: true,
    following: session.following,
    visibilityPaused: session.visibilityPaused,
    signalLost: session.signalLost,
    permissionDenied: session.permissionDenied,
    recentering: session.recentering,
    lowPower: session.lowPower,
    travelMode: session.travelMode,
    watchActive: session.watchId !== null,
    ...model,
    targetWorld: session.targetWorld ? {
      x: Number(session.targetWorld.x.toFixed(2)),
      z: Number(session.targetWorld.z.toFixed(2))
    } : null,
    snap: session.snap ? {
      kind: session.snap.kind,
      distanceMeters: Number(session.snap.distanceMeters.toFixed(1))
    } : null,
    lastFixResult: session.lastFixResult,
    lastSource: session.lastSource
  };
}

async function startLiveGpsFromWorld() {
  if (activeSession) return true;
  const prepared = await prepareLiveGpsStart({ source: 'in-world', setWorldLocation: false });
  if (!prepared) return false;
  startLiveGpsMode();
  return true;
}

function ensureUiBound() {
  if (uiBound || typeof document === 'undefined') return;
  uiBound = true;
  document.getElementById('liveGpsPermissionContinue')?.addEventListener('click', acceptConsent);
  document.getElementById('liveGpsPermissionCancel')?.addEventListener('click', () => closeConsent(false));
  document.getElementById('liveGpsPauseBtn')?.addEventListener('click', pauseOrResumeLiveGps);
  document.getElementById('liveGpsRecenterBtn')?.addEventListener('click', () => void recenterLiveGpsWorld());
  document.getElementById('liveGpsLowPowerBtn')?.addEventListener('click', toggleLiveGpsLowPower);
  document.getElementById('liveGpsStopBtn')?.addEventListener('click', () => {
    if (appCtx.getGameplayRegistrySnapshot?.().activeId === 'livegps') {
      appCtx.stopGameplayPlugin?.('live-gps-user-stop');
    } else {
      stopLiveGpsMode({ reason: 'live-gps-user-stop' });
    }
  });
}

Object.assign(appCtx, {
  getLiveGpsSnapshot,
  liveGpsTranslationOwned,
  prepareLiveGpsStart,
  recenterLiveGpsWorld,
  resolveLiveGpsWalkerTarget,
  startLiveGpsFromWorld,
  stopLiveGpsMode,
  toggleLiveGpsLowPower
});

export {
  LIVE_GPS_LOW_POWER_WATCH_OPTIONS,
  LIVE_GPS_WATCH_OPTIONS,
  getLiveGpsSnapshot,
  liveGpsTranslationOwned,
  pauseOrResumeLiveGps,
  prepareLiveGpsStart,
  recenterLiveGpsWorld,
  resolveLiveGpsWalkerTarget,
  startLiveGpsFromWorld,
  startLiveGpsMode,
  stopLiveGpsMode,
  toggleLiveGpsLowPower,
  updateLiveGpsMode
};
