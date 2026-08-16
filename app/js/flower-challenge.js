import { ctx as appCtx } from "./shared-context.js?v=55";
import { createFlowerChallengeLeaderboardApi } from "./flower-challenge/leaderboard.js?v=2";
import { createFlowerLeaderboardView } from "./flower-challenge/leaderboard-view.js?v=1";
import { createFlowerMarkerRuntime } from "./flower-challenge/marker-runtime.js?v=1";
import { getCurrentUser } from "../../js/auth-ui.js";
import { initFirebase } from "../../js/firebase-init.js";

const LOCAL_LEADERBOARD_KEY = 'worldExplorer3D.flowerChallenge.localLeaderboard.v1';
const LOCAL_PAINT_LEADERBOARD_KEY = 'worldExplorer3D.paintTown.localLeaderboard.v1';
const LOCAL_FISHING_LEADERBOARD_KEY = 'worldExplorer3D.fishing.localLeaderboard.v1';
const LOCAL_EXPLORER_LEADERBOARD_KEY = 'worldExplorer3D.explorer.localLeaderboard.v1';
const LOCAL_DEFLOCK_LEADERBOARD_KEY = 'worldExplorer3D.deflock.localLeaderboard.v1';
const PLAYER_NAME_KEY = 'worldExplorer3D.flowerChallenge.playerName';
const FIREBASE_CONFIG_KEY = 'worldExplorer3D.firebaseConfig';
const FIREBASE_COLLECTION = 'flowerLeaderboard';
const FIREBASE_PAINT_COLLECTION = 'paintTownLeaderboard';
const FIREBASE_FISHING_COLLECTION = 'fishingLeaderboard';
const FIREBASE_EXPLORER_COLLECTION = 'explorerLeaderboard';
const FIREBASE_DEFLOCK_COLLECTION = 'deflockLeaderboard';
const LEADERBOARD_LIMIT = 10;
const FLOWER_MIN_DISTANCE = 120;
const FLOWER_MAX_DISTANCE = 2600;

const FIREBASE_STORE_MODULE = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const challengeState = {
  active: false,
  pendingTitleStart: false,
  startedAtMs: 0,
  marker: null,
  markerBaseY: 0,
  markerPos: null,
  locationLabel: '',
  startSource: 'manual',
  firebaseInitPromise: null,
  firebaseReady: false,
  firebase: null,
  leaderboardBackend: 'local',
  leaderboardView: 'flower',
  statusTimer: null,
  lastHudRenderMs: 0
};

const ui = {
  titlePanel: null,
  titleToggleBtn: null,
  status: null,
  titleNameInput: null,
  titleLocation: null,
  titleStartBtn: null,
  titleRefreshBtn: null,
  titleFlowerTabBtn: null,
  titlePaintTabBtn: null,
  titleFishingTabBtn: null,
  titleExplorerTabBtn: null,
  titleDeFlockTabBtn: null,
  titleHint: null,
  titleList: null,
  hud: null,
  gameStatus: null,
  gameTimer: null,
  flowerActionMenu: null,
  flowerActionMemory: null,
  flowerActionChallenge: null,
  flowerActionClose: null
};

let challengeUiBound = false;
let lastTitleToggleTouchMs = 0;

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function sanitizePlayerName(raw) {
  const cleaned = String(raw || '').
  replace(/[\u0000-\u001F\u007F]/g, '').
  trim().
  slice(0, 24);
  return cleaned || 'Explorer';
}

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

function normalizeChallengeType(raw) {
  const value = String(raw || '').toLowerCase();
  return ['flower', 'painttown', 'fishing', 'explorer', 'deflock'].includes(value) ? value : 'flower';
}

function getLeaderboardStorageKey(challengeType) {
  const type = normalizeChallengeType(challengeType);
  if (type === 'painttown') return LOCAL_PAINT_LEADERBOARD_KEY;
  if (type === 'fishing') return LOCAL_FISHING_LEADERBOARD_KEY;
  if (type === 'explorer') return LOCAL_EXPLORER_LEADERBOARD_KEY;
  if (type === 'deflock') return LOCAL_DEFLOCK_LEADERBOARD_KEY;
  return LOCAL_LEADERBOARD_KEY;
}

function getLeaderboardCollection(challengeType) {
  const type = normalizeChallengeType(challengeType);
  if (type === 'painttown') return FIREBASE_PAINT_COLLECTION;
  if (type === 'fishing') return FIREBASE_FISHING_COLLECTION;
  if (type === 'explorer') return FIREBASE_EXPLORER_COLLECTION;
  if (type === 'deflock') return FIREBASE_DEFLOCK_COLLECTION;
  return FIREBASE_COLLECTION;
}

function getSelectedTitleLocationLabel() {
  if (appCtx.selLoc === 'custom') return appCtx.customLoc?.name || 'Custom Location';
  if (appCtx.LOCS && appCtx.selLoc && appCtx.LOCS[appCtx.selLoc]) return appCtx.LOCS[appCtx.selLoc].name;
  return 'Current Location';
}

function getRuntimeLocationLabel() {
  if (appCtx.selLoc === 'custom') return appCtx.customLoc?.name || 'Custom Location';
  if (appCtx.LOCS && appCtx.selLoc && appCtx.LOCS[appCtx.selLoc]) return appCtx.LOCS[appCtx.selLoc].name;
  return 'Unknown Location';
}

function inferTravelMode() {
  if (appCtx.droneMode) return 'drone';
  if (appCtx.Walk?.state?.mode === 'walk') return 'walking';
  return 'driving';
}

function getActiveActorPosition() {
  if (appCtx.droneMode && appCtx.drone) {
    return { x: appCtx.drone.x, y: appCtx.drone.y, z: appCtx.drone.z, mode: 'drone' };
  }
  if (appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk?.state?.walker) {
    const walker = appCtx.Walk.state.walker;
    return { x: walker.x, y: walker.y, z: walker.z, mode: 'walking' };
  }
  if (appCtx.car) {
    return { x: appCtx.car.x, y: appCtx.car.y, z: appCtx.car.z, mode: 'driving' };
  }
  return null;
}

function resolvePlayerName() {
  const fromInput = sanitizePlayerName(ui.titleNameInput?.value || '');
  if (ui.titleNameInput) ui.titleNameInput.value = fromInput;
  try {
    localStorage.setItem(PLAYER_NAME_KEY, fromInput);
  } catch (_) {
    // no-op
  }
  return fromInput;
}

function hydratePlayerName() {
  if (!ui.titleNameInput) return;
  let stored = '';
  try {
    stored = sanitizePlayerName(localStorage.getItem(PLAYER_NAME_KEY) || '');
  } catch (_) {
    stored = 'Explorer';
  }
  ui.titleNameInput.value = stored || 'Explorer';
}

function setTitleStatus(message, tone = 'info') {
  if (!ui.status) return;
  ui.status.textContent = message || '';
  ui.status.classList.remove('error', 'ok');
  if (tone === 'error') ui.status.classList.add('error');
  if (tone === 'ok') ui.status.classList.add('ok');
}

function setTitlePanelOpen(open) {
  if (!ui.titlePanel) return;
  const shouldOpen = !!open;
  ui.titlePanel.classList.toggle('open', shouldOpen);
  if (ui.titleToggleBtn) {
    ui.titleToggleBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }
  const titleScreen = document.getElementById('titleScreen');
  if (titleScreen) titleScreen.classList.toggle('title-screen-leaderboard-open', shouldOpen);
}

function toggleTitlePanel() {
  if (!ui.titlePanel) return;
  const shouldOpen = !ui.titlePanel.classList.contains('open');
  setTitlePanelOpen(shouldOpen);
  if (shouldOpen) refreshFlowerLeaderboard();
}

function closeTitlePanel() {
  setTitlePanelOpen(false);
}

function setGameHud(message, elapsedMs = null) {
  if (!ui.hud) return;
  if (!message) {
    ui.hud.classList.remove('show');
    ui.hud.dataset.state = '';
    if (ui.gameStatus) ui.gameStatus.textContent = '';
    if (ui.gameTimer) ui.gameTimer.textContent = '';
    return;
  }

  ui.hud.classList.add('show');
  if (ui.gameStatus) ui.gameStatus.textContent = message;
  if (ui.gameTimer) {
    if (isFiniteNumber(elapsedMs)) {
      const seconds = (elapsedMs / 1000).toFixed(2);
      ui.gameTimer.textContent = `${seconds}s`;
    } else {
      ui.gameTimer.textContent = '';
    }
  }
}

function closeFlowerActionMenu() {
  if (!ui.flowerActionMenu) return;
  ui.flowerActionMenu.classList.remove('open');
}

function toggleFlowerActionMenu() {
  if (!ui.flowerActionMenu) return;
  const shouldOpen = !ui.flowerActionMenu.classList.contains('open');
  if (shouldOpen) {
    ui.flowerActionMenu.classList.add('open');
  } else {
    ui.flowerActionMenu.classList.remove('open');
  }
}

const leaderboardView = createFlowerLeaderboardView({
  challengeState,
  getLeaderboardStorageKey,
  getSortLeaderboardEntries: () => sortLeaderboardEntries,
  leaderboardLimit: LEADERBOARD_LIMIT,
  normalizeChallengeType,
  safeText,
  sanitizePlayerName,
  ui
});
const { normalizeLeaderboardEntry, readLocalLeaderboard, renderLeaderboard, writeLocalLeaderboard } = leaderboardView;

const leaderboardApi = createFlowerChallengeLeaderboardApi({
  FIREBASE_CONFIG_KEY,
  FIREBASE_STORE_MODULE,
  LEADERBOARD_LIMIT,
  appCtx,
  challengeState,
  constants: {
    FIREBASE_COLLECTION,
    FIREBASE_EXPLORER_COLLECTION,
    FIREBASE_DEFLOCK_COLLECTION,
    FIREBASE_FISHING_COLLECTION,
    FIREBASE_PAINT_COLLECTION,
    LOCAL_LEADERBOARD_KEY,
    LOCAL_EXPLORER_LEADERBOARD_KEY,
    LOCAL_DEFLOCK_LEADERBOARD_KEY,
    LOCAL_FISHING_LEADERBOARD_KEY,
    LOCAL_PAINT_LEADERBOARD_KEY
  },
  getFirebaseServices: initFirebase,
  getSignedInUser: getCurrentUser,
  getActiveActorPosition,
  getRuntimeLocationLabel,
  inferTravelMode,
  normalizeChallengeType,
  normalizeLeaderboardEntry,
  readLocalLeaderboard,
  renderLeaderboard,
  resolvePlayerName,
  setTitleStatus,
  ui,
  writeLocalLeaderboard
});

const {
  canUseRemoteLeaderboard,
  compareLeaderboardEntries,
  readFirebaseConfig,
  refreshFlowerLeaderboard,
  resetFirebaseInitState,
  setChallengeLeaderboardView,
  sortLeaderboardEntries,
  storeLocalResult,
  submitDeFlockScore,
  submitFishingScore,
  submitPaintTownScore,
  writeRemoteLeaderboard
} = leaderboardApi;

const flowerMarkerRuntime = createFlowerMarkerRuntime({
  appCtx,
  challengeState,
  getActiveActorPosition,
  minDistance: FLOWER_MIN_DISTANCE,
  maxDistance: FLOWER_MAX_DISTANCE
});
const { pickFlowerSpawn, placeFlowerMarker, removeFlowerMarker } = flowerMarkerRuntime;

function captureRunEntry(elapsedMs, actor) {
  const player = resolvePlayerName();
  const loc = getRuntimeLocationLabel();
  const ll = worldToLatLon(actor.x, actor.z);

  return {
    id: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    player,
    timeMs: Math.max(1, Math.round(elapsedMs)),
    location: loc,
    lat: ll.lat,
    lon: ll.lon,
    mode: inferTravelMode(),
    foundAt: new Date().toISOString()
  };
}

async function completeChallenge() {
  if (!challengeState.active) return;

  const actor = getActiveActorPosition() || { x: appCtx.car?.x || 0, z: appCtx.car?.z || 0, y: appCtx.car?.y || 0 };
  const elapsedMs = Math.max(0, performance.now() - challengeState.startedAtMs);
  const entry = captureRunEntry(elapsedMs, actor);

  challengeState.active = false;
  removeFlowerMarker();

  const remoteSaved = await writeRemoteLeaderboard('flower', entry);
  if (!remoteSaved) {
    storeLocalResult('flower', entry);
  }

  await refreshFlowerLeaderboard(challengeState.leaderboardView);

  setTitleStatus(
    `${entry.player} found the red flower in ${(entry.timeMs / 1000).toFixed(2)}s at ${entry.location}.`,
    'ok'
  );

  setGameHud(`Flower found by ${entry.player}!`, entry.timeMs);
  clearTimeout(challengeState.statusTimer);
  challengeState.statusTimer = setTimeout(() => {
    if (!challengeState.active) setGameHud('');
  }, 5000);
}

function startFlowerChallenge(source = 'manual') {
  closeFlowerActionMenu();

  if (!appCtx.gameStarted) {
    setTitleStatus('Start Explore first, then begin the challenge.', 'error');
    return false;
  }

  if (!appCtx.isEnv || !appCtx.ENV || !appCtx.isEnv(appCtx.ENV.EARTH)) {
    setTitleStatus('Red flower challenge is only available on Earth mode.', 'error');
    return false;
  }

  if (appCtx.worldLoading) {
    setTitleStatus('World is still loading. Try again in a moment.', 'error');
    return false;
  }

  const spawn = pickFlowerSpawn();
  if (!spawn) {
    setTitleStatus('Could not place a visible flower yet. Move a bit and try again.', 'error');
    return false;
  }

  removeFlowerMarker();
  const placed = placeFlowerMarker(spawn);
  if (!placed) {
    setTitleStatus('Could not render challenge marker.', 'error');
    return false;
  }

  challengeState.active = true;
  challengeState.startedAtMs = performance.now();
  challengeState.locationLabel = getRuntimeLocationLabel();
  challengeState.startSource = source;
  challengeState.lastHudRenderMs = 0;

  setTitleStatus(`Challenge started in ${challengeState.locationLabel}. Find the red flower!`, 'ok');
  setGameHud('Find the red flower', 0);
  return true;
}

function stopFlowerChallenge(options = {}) {
  challengeState.active = false;
  removeFlowerMarker();
  if (!options.keepHud) setGameHud('');
  closeFlowerActionMenu();
}

function consumePendingFlowerChallengeStart() {
  const pending = !!challengeState.pendingTitleStart;
  challengeState.pendingTitleStart = false;
  return pending;
}

function requestFlowerChallengeFromTitle() {
  setTitlePanelOpen(true);
  const selectedLocation = getSelectedTitleLocationLabel();
  if (!selectedLocation) {
    setTitleStatus('Pick a location first.', 'error');
    return false;
  }

  resolvePlayerName();

  const earthBtn = document.querySelector('.launch-switch-btn[data-target="earth"]');
  if (earthBtn && !earthBtn.classList.contains('active')) {
    earthBtn.click();
  }

  challengeState.pendingTitleStart = true;
  setTitleStatus('Starting challenge world load...', 'ok');

  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.click();
    return true;
  }

  return false;
}

function updateChallengeHud(nowMs) {
  if (!challengeState.active) return;
  const elapsedMs = Math.max(0, nowMs - challengeState.startedAtMs);
  setGameHud('Find the red flower', elapsedMs);
}

function updateFlowerChallenge(dt) {
  if (!challengeState.marker && !challengeState.active) return;

  if (!appCtx.gameStarted || !appCtx.isEnv?.(appCtx.ENV.EARTH)) {
    stopFlowerChallenge();
    return;
  }

  if (challengeState.marker) {
    const marker = challengeState.marker;
    marker.rotation.y += dt * 1.2;
    const bob = Math.sin(performance.now() * 0.004) * 0.08;
    marker.position.y = challengeState.markerBaseY + bob;

    marker.children.forEach((child) => {
      if (child?.userData?.isBeacon) {
        child.rotation.z += dt * 1.6;
        child.material.opacity = 0.55 + (Math.sin(performance.now() * 0.006) * 0.25 + 0.25);
      }
    });
  }

  if (!challengeState.active || !challengeState.markerPos) return;

  const actor = getActiveActorPosition();
  if (!actor) return;

  const dx = actor.x - challengeState.markerPos.x;
  const dz = actor.z - challengeState.markerPos.z;
  const dy = (actor.y || 0) - challengeState.markerPos.y;
  const horizontalDist = Math.hypot(dx, dz);
  const verticalAllowance = actor.mode === 'drone' ? 20 : 8;
  const reachRadius = actor.mode === 'drone' ? 10 : 5.5;

  const now = performance.now();
  if (now - challengeState.lastHudRenderMs > 70) {
    challengeState.lastHudRenderMs = now;
    updateChallengeHud(now);
  }

  if (horizontalDist <= reachRadius && Math.abs(dy) <= verticalAllowance) {
    completeChallenge();
  }
}

function updateTitleSelectedLocation() {
  if (!ui.titleLocation) return;
  ui.titleLocation.textContent = getSelectedTitleLocationLabel();
}

function bindTitleLocationWatchers() {
  const titleScreen = document.getElementById('titleScreen');
  if (!titleScreen) return;

  titleScreen.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('.loc')) return;
    requestAnimationFrame(updateTitleSelectedLocation);
  });
}

function bindFlowerActionMenu() {
  if (!ui.flowerActionMemory || !ui.flowerActionChallenge || !ui.flowerActionClose) return;

  ui.flowerActionMemory.addEventListener('click', () => {
    closeFlowerActionMenu();
    if (typeof appCtx.openMemoryComposer === 'function') appCtx.openMemoryComposer('flower');
  });

  ui.flowerActionChallenge.addEventListener('click', () => {
    startFlowerChallenge('flower-float');
  });

  ui.flowerActionClose.addEventListener('click', () => {
    closeFlowerActionMenu();
  });

  document.addEventListener('click', (event) => {
    if (!ui.flowerActionMenu || !ui.flowerActionMenu.classList.contains('open')) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('#flowerActionMenu') || event.target.closest('#memoryFlowerFloatBtn')) return;
    closeFlowerActionMenu();
  });
}

function setupFlowerChallenge() {
  if (challengeUiBound) return;

  ui.titlePanel = document.getElementById('flowerChallengePanel');
  ui.titleToggleBtn = document.getElementById('flowerChallengeToggleBtn');
  ui.status = document.getElementById('flowerChallengeStatus');
  ui.titleNameInput = document.getElementById('flowerPlayerName');
  ui.titleLocation = document.getElementById('flowerChallengeLocation');
  ui.titleStartBtn = document.getElementById('titleFindFlowerBtn');
  ui.titleRefreshBtn = document.getElementById('titleFlowerRefreshBtn');
  ui.titleFlowerTabBtn = document.getElementById('leaderboardTabFlower');
  ui.titlePaintTabBtn = document.getElementById('leaderboardTabPaintTown');
  ui.titleFishingTabBtn = document.getElementById('leaderboardTabFishing');
  ui.titleExplorerTabBtn = document.getElementById('leaderboardTabExplorer');
  ui.titleDeFlockTabBtn = document.getElementById('leaderboardTabDeFlock');
  ui.titleHint = document.getElementById('gameLeaderboardHint');
  ui.titleList = document.getElementById('flowerLeaderboardList');
  ui.hud = document.getElementById('flowerChallengeHud');
  ui.gameStatus = document.getElementById('flowerChallengeHudStatus');
  ui.gameTimer = document.getElementById('flowerChallengeHudTimer');
  ui.flowerActionMenu = document.getElementById('flowerActionMenu');
  ui.flowerActionMemory = document.getElementById('flowerActionMemoryBtn');
  ui.flowerActionChallenge = document.getElementById('flowerActionChallengeBtn');
  ui.flowerActionClose = document.getElementById('flowerActionCloseBtn');

  hydratePlayerName();
  updateTitleSelectedLocation();
  bindTitleLocationWatchers();
  bindFlowerActionMenu();

  if (ui.titleNameInput) {
    ui.titleNameInput.addEventListener('change', () => {
      resolvePlayerName();
    });
  }

  if (ui.titleToggleBtn) {
    ui.titleToggleBtn.addEventListener('click', (event) => {
      if (Date.now() - lastTitleToggleTouchMs < 420) return;
      event.stopPropagation();
      toggleTitlePanel();
    });
    ui.titleToggleBtn.addEventListener('touchend', (event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      lastTitleToggleTouchMs = Date.now();
      toggleTitlePanel();
    }, { passive: false });
  }

  if (ui.titleStartBtn) {
    ui.titleStartBtn.addEventListener('click', () => {
      requestFlowerChallengeFromTitle();
    });
  }

  if (ui.titleRefreshBtn) {
    ui.titleRefreshBtn.addEventListener('click', () => {
      refreshFlowerLeaderboard(challengeState.leaderboardView);
    });
  }

  if (ui.titleFlowerTabBtn) {
    ui.titleFlowerTabBtn.addEventListener('click', () => {
      setChallengeLeaderboardView('flower');
    });
  }

  if (ui.titlePaintTabBtn) {
    ui.titlePaintTabBtn.addEventListener('click', () => {
      setChallengeLeaderboardView('painttown');
    });
  }

  if (ui.titleFishingTabBtn) {
    ui.titleFishingTabBtn.addEventListener('click', () => {
      setChallengeLeaderboardView('fishing');
    });
  }

  if (ui.titleExplorerTabBtn) {
    ui.titleExplorerTabBtn.addEventListener('click', () => {
      setChallengeLeaderboardView('explorer');
    });
  }

  if (ui.titleDeFlockTabBtn) {
    ui.titleDeFlockTabBtn.addEventListener('click', () => {
      setChallengeLeaderboardView('deflock');
    });
  }

  document.addEventListener('click', (event) => {
    if (!ui.titlePanel || !ui.titlePanel.classList.contains('open')) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('#flowerChallengePanel') || event.target.closest('#flowerChallengeToggleBtn')) return;
    closeTitlePanel();
  });

  challengeUiBound = true;
  setTitlePanelOpen(false);
  refreshFlowerLeaderboard(challengeState.leaderboardView);
}

function getFlowerChallengeBackendStatus() {
  return {
    configPresent: !!readFirebaseConfig(),
    firebaseReady: !!challengeState.firebaseReady,
    backend: challengeState.leaderboardBackend,
    challengeActive: !!challengeState.active
  };
}

Object.assign(appCtx, {
  closeFlowerChallengeTitlePanel: closeTitlePanel,
  consumePendingFlowerChallengeStart,
  getFlowerChallengeBackendStatus,
  refreshFlowerLeaderboard,
  requestFlowerChallengeFromTitle,
  setChallengeLeaderboardView,
  setupFlowerChallenge,
  startFlowerChallenge,
  submitDeFlockScore,
  submitFishingScore,
  submitPaintTownScore,
  stopFlowerChallenge,
  toggleFlowerActionMenu,
  updateFlowerChallenge
});

if (typeof globalThis !== 'undefined') {
  globalThis.getFlowerChallengeBackendStatus = getFlowerChallengeBackendStatus;
}

export {
  closeTitlePanel,
  consumePendingFlowerChallengeStart,
  getFlowerChallengeBackendStatus,
  refreshFlowerLeaderboard,
  requestFlowerChallengeFromTitle,
  setChallengeLeaderboardView,
  setupFlowerChallenge,
  startFlowerChallenge,
  submitFishingScore,
  submitPaintTownScore,
  stopFlowerChallenge,
  toggleFlowerActionMenu,
  updateFlowerChallenge
};
