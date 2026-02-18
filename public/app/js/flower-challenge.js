import { ctx as appCtx } from "./shared-context.js?v=54";

const LOCAL_LEADERBOARD_KEY = 'worldExplorer3D.flowerChallenge.localLeaderboard.v1';
const LOCAL_PAINT_LEADERBOARD_KEY = 'worldExplorer3D.paintTown.localLeaderboard.v1';
const PLAYER_NAME_KEY = 'worldExplorer3D.flowerChallenge.playerName';
const FIREBASE_CONFIG_KEY = 'worldExplorer3D.firebaseConfig';
const FIREBASE_COLLECTION = 'flowerLeaderboard';
const FIREBASE_PAINT_COLLECTION = 'paintTownLeaderboard';
const LEADERBOARD_LIMIT = 10;
const FLOWER_MIN_DISTANCE = 120;
const FLOWER_MAX_DISTANCE = 2600;

const FIREBASE_APP_MODULE = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
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
  return raw === 'painttown' ? 'painttown' : 'flower';
}

function getLeaderboardStorageKey(challengeType) {
  return normalizeChallengeType(challengeType) === 'painttown' ?
  LOCAL_PAINT_LEADERBOARD_KEY :
  LOCAL_LEADERBOARD_KEY;
}

function getLeaderboardCollection(challengeType) {
  return normalizeChallengeType(challengeType) === 'painttown' ?
  FIREBASE_PAINT_COLLECTION :
  FIREBASE_COLLECTION;
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

function readFirebaseConfig() {
  const fromWindow = globalThis.WORLD_EXPLORER_FIREBASE && typeof globalThis.WORLD_EXPLORER_FIREBASE === 'object' ?
  globalThis.WORLD_EXPLORER_FIREBASE :
  null;

  let fromStorage = null;
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') fromStorage = parsed;
    }
  } catch (_) {
    fromStorage = null;
  }

  const cfg = fromWindow || fromStorage;
  if (!cfg || typeof cfg !== 'object') return null;

  const normalized = {
    apiKey: String(cfg.apiKey || ''),
    authDomain: String(cfg.authDomain || ''),
    projectId: String(cfg.projectId || ''),
    storageBucket: String(cfg.storageBucket || ''),
    messagingSenderId: String(cfg.messagingSenderId || ''),
    appId: String(cfg.appId || '')
  };

  if (!normalized.apiKey || !normalized.projectId || !normalized.appId) return null;
  return normalized;
}

function canUseCloudSync() {
  const entitlementState = globalThis.__WE3D_ENTITLEMENTS__;
  if (!entitlementState || typeof entitlementState !== 'object') return false;
  const entitlements = entitlementState.entitlements;
  return !!(entitlements && entitlements.cloudSync);
}

function resetFirebaseInitState() {
  challengeState.firebaseInitPromise = null;
  challengeState.firebaseReady = false;
  challengeState.firebase = null;
  challengeState.leaderboardBackend = 'local';
}

async function ensureFirebase() {
  if (!canUseCloudSync()) {
    resetFirebaseInitState();
    return false;
  }
  if (challengeState.firebaseInitPromise) return challengeState.firebaseInitPromise;

  challengeState.firebaseInitPromise = (async () => {
    const cfg = readFirebaseConfig();
    if (!cfg) {
      challengeState.firebaseReady = false;
      challengeState.firebase = null;
      challengeState.leaderboardBackend = 'local';
      return false;
    }

    try {
      const [appMod, firestoreMod] = await Promise.all([
        import(FIREBASE_APP_MODULE),
        import(FIREBASE_STORE_MODULE)
      ]);

      const appName = 'worldexplorer3d-flower';
      const existingApp = appMod.getApps().find((candidate) => candidate.name === appName);
      const firebaseApp = existingApp || appMod.initializeApp(cfg, appName);
      const db = firestoreMod.getFirestore(firebaseApp);

      challengeState.firebaseReady = true;
      challengeState.firebase = {
        db,
        firestoreMod
      };
      challengeState.leaderboardBackend = 'firebase';
      return true;
    } catch (err) {
      console.warn('[flower-challenge] Firebase unavailable, using local leaderboard fallback.', err);
      challengeState.firebaseReady = false;
      challengeState.firebase = null;
      challengeState.leaderboardBackend = 'local';
      return false;
    }
  })();

  return challengeState.firebaseInitPromise;
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('we3d-entitlements-changed', () => {
    resetFirebaseInitState();
    refreshFlowerLeaderboard(challengeState.leaderboardView);
  });
}

function normalizeLeaderboardEntry(raw, forcedChallengeType = null) {
  if (!raw || typeof raw !== 'object') return null;
  const challenge = normalizeChallengeType(forcedChallengeType || raw.challenge || raw.challengeType);
  const player = sanitizePlayerName(raw.player || raw.name || 'Explorer');
  const location = String(raw.location || 'Unknown Location').slice(0, 80);
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  const mode = String(raw.mode || 'driving').slice(0, 24);
  const foundAt = raw.foundAt || raw.createdAtIso || new Date().toISOString();
  const timeMs = Number(raw.timeMs);
  const paintedPct = Number(raw.paintedPct);
  const paintedBuildings = Number(raw.paintedBuildings);
  const totalBuildings = Number(raw.totalBuildings);

  if (challenge === 'flower') {
    if (!Number.isFinite(timeMs) || timeMs <= 0) return null;
  } else {
    const hasCount = Number.isFinite(paintedBuildings) && paintedBuildings >= 0;
    const hasPct = Number.isFinite(paintedPct) && paintedPct >= 0;
    if (!hasCount && !hasPct) return null;
  }

  return {
    id: String(raw.id || raw.docId || `entry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`),
    challenge,
    player,
    timeMs: Number.isFinite(timeMs) && timeMs > 0 ? timeMs : null,
    paintedPct: Number.isFinite(paintedPct) ? Math.max(0, Math.min(100, paintedPct)) : null,
    paintedBuildings: Number.isFinite(paintedBuildings) ? Math.max(0, Math.round(paintedBuildings)) : 0,
    totalBuildings: Number.isFinite(totalBuildings) ? Math.max(0, Math.round(totalBuildings)) : 0,
    location,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    mode,
    foundAt: new Date(foundAt).toISOString()
  };
}

function sortLeaderboardEntries(entries, challengeType = 'flower') {
  const normalizedType = normalizeChallengeType(challengeType);
  if (normalizedType === 'painttown') {
    return entries.slice().sort((a, b) => compareLeaderboardEntries(a, b, normalizedType));
  }
  return entries.slice().sort((a, b) => compareLeaderboardEntries(a, b, normalizedType));
}

function compareLeaderboardEntries(a, b, challengeType = 'flower') {
  const normalizedType = normalizeChallengeType(challengeType);
  if (normalizedType === 'painttown') {
    const countDelta = (Number(b.paintedBuildings) || 0) - (Number(a.paintedBuildings) || 0);
    if (countDelta !== 0) return countDelta;
    const pctDelta = (Number(b.paintedPct) || 0) - (Number(a.paintedPct) || 0);
    if (Math.abs(pctDelta) > 0.0001) return pctDelta;
    return String(b.foundAt || '').localeCompare(String(a.foundAt || ''));
  }
  return (Number(a.timeMs) || Infinity) - (Number(b.timeMs) || Infinity);
}

function readLocalLeaderboard(challengeType = 'flower') {
  const normalizedType = normalizeChallengeType(challengeType);
  try {
    const raw = localStorage.getItem(getLeaderboardStorageKey(normalizedType));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortLeaderboardEntries(
      parsed.map((entry) => normalizeLeaderboardEntry(entry, normalizedType)).filter(Boolean),
      normalizedType
    ).slice(0, LEADERBOARD_LIMIT);
  } catch (_) {
    return [];
  }
}

function writeLocalLeaderboard(challengeType, entries) {
  const normalizedType = normalizeChallengeType(challengeType);
  try {
    localStorage.setItem(
      getLeaderboardStorageKey(normalizedType),
      JSON.stringify(sortLeaderboardEntries(entries, normalizedType).slice(0, LEADERBOARD_LIMIT))
    );
    return true;
  } catch (_) {
    return false;
  }
}

async function readRemoteLeaderboard(challengeType = 'flower') {
  const normalizedType = normalizeChallengeType(challengeType);
  const ready = await ensureFirebase();
  if (!ready || !challengeState.firebase) return null;

  try {
    const { db, firestoreMod } = challengeState.firebase;
    const leaderboardRef = firestoreMod.collection(db, getLeaderboardCollection(normalizedType));
    const q = normalizedType === 'painttown' ?
    firestoreMod.query(
      leaderboardRef,
      firestoreMod.orderBy('paintedBuildings', 'desc'),
      firestoreMod.limit(LEADERBOARD_LIMIT)
    ) :
    firestoreMod.query(
      leaderboardRef,
      firestoreMod.orderBy('timeMs', 'asc'),
      firestoreMod.limit(LEADERBOARD_LIMIT)
    );

    const snap = await firestoreMod.getDocs(q);
    const entries = snap.docs.
    map((doc) => normalizeLeaderboardEntry({ ...doc.data(), id: doc.id }, normalizedType)).
    filter(Boolean).
    sort((a, b) => compareLeaderboardEntries(a, b, normalizedType)).
    slice(0, LEADERBOARD_LIMIT);

    return entries;
  } catch (err) {
    console.warn('[flower-challenge] Failed to read remote leaderboard, falling back to local.', err);
    challengeState.leaderboardBackend = 'local';
    return null;
  }
}

async function writeRemoteLeaderboard(challengeType, entry) {
  const normalizedType = normalizeChallengeType(challengeType);
  const ready = await ensureFirebase();
  if (!ready || !challengeState.firebase) return false;

  try {
    const { db, firestoreMod } = challengeState.firebase;
    const payload = {
      challenge: normalizedType,
      player: entry.player,
      timeMs: entry.timeMs,
      paintedPct: entry.paintedPct,
      paintedBuildings: entry.paintedBuildings,
      totalBuildings: entry.totalBuildings,
      location: entry.location,
      lat: entry.lat,
      lon: entry.lon,
      mode: entry.mode,
      createdAtIso: entry.foundAt,
      createdAt: firestoreMod.serverTimestamp()
    };
    await firestoreMod.addDoc(firestoreMod.collection(db, getLeaderboardCollection(normalizedType)), payload);
    challengeState.leaderboardBackend = 'firebase';
    return true;
  } catch (err) {
    console.warn('[flower-challenge] Failed to write remote leaderboard, storing locally.', err);
    challengeState.leaderboardBackend = 'local';
    return false;
  }
}

function renderLeaderboard(entries) {
  if (!ui.titleList) return;
  const challengeType = normalizeChallengeType(challengeState.leaderboardView);

  if (!entries || entries.length === 0) {
    ui.titleList.innerHTML = challengeType === 'painttown' ?
    '<li class="flowerLeaderboardEmpty">No paint runs yet. Reach rooftops to paint and post a score.</li>' :
    '<li class="flowerLeaderboardEmpty">No flower runs yet. Be the first.</li>';
    return;
  }

  ui.titleList.innerHTML = entries.map((entry, idx) => {
    const metric = challengeType === 'painttown' ?
    `${Math.max(0, Math.round(Number(entry.paintedBuildings) || 0))} bldgs` :
    `${((Number(entry.timeMs) || 0) / 1000).toFixed(2)}s`;
    const locationLine = challengeType === 'painttown' ?
    `${safeText(entry.location)} • ${safeText((entry.paintedBuildings || 0) + '/' + (entry.totalBuildings || 0))}` :
    safeText(entry.location);
    return `<li class="flowerLeaderboardItem">
      <span class="flowerLeaderboardRank">#${idx + 1}</span>
      <span class="flowerLeaderboardPlayer">${safeText(entry.player)}</span>
      <span class="flowerLeaderboardTime">${safeText(metric)}</span>
      <span class="flowerLeaderboardLoc">${locationLine}</span>
    </li>`;
  }).join('');
}

async function refreshFlowerLeaderboard(challengeType = challengeState.leaderboardView || 'flower') {
  const normalizedType = normalizeChallengeType(challengeType);
  challengeState.leaderboardView = normalizedType;
  if (ui.titleFlowerTabBtn) ui.titleFlowerTabBtn.classList.toggle('active', normalizedType === 'flower');
  if (ui.titlePaintTabBtn) ui.titlePaintTabBtn.classList.toggle('active', normalizedType === 'painttown');
  if (ui.titleStartBtn) {
    const flowerView = normalizedType === 'flower';
    ui.titleStartBtn.style.display = flowerView ? '' : 'none';
    ui.titleStartBtn.disabled = !flowerView;
  }
  const remoteEntries = await readRemoteLeaderboard(normalizedType);
  const entries = remoteEntries || readLocalLeaderboard(normalizedType);
  renderLeaderboard(entries);

  if (ui.status) {
    const prefix = normalizedType === 'painttown' ? 'Paint leaderboard' : 'Flower leaderboard';
    const backendLabel = challengeState.leaderboardBackend === 'firebase' ?
    `${prefix}: Firebase live` :
    `${prefix}: Local fallback`;
    ui.status.dataset.backend = backendLabel;
  }

  return entries;
}

function storeLocalResult(challengeType, entry) {
  const normalizedType = normalizeChallengeType(challengeType);
  const current = readLocalLeaderboard(normalizedType);
  current.push(entry);
  const sorted = sortLeaderboardEntries(current, normalizedType).slice(0, LEADERBOARD_LIMIT);
  writeLocalLeaderboard(normalizedType, sorted);
}

function worldToLatLon(x, z) {
  const baseLat = Number(appCtx.LOC?.lat);
  const baseLon = Number(appCtx.LOC?.lon);
  const scale = Number(appCtx.SCALE || 100000);
  const cosLat = Math.cos((baseLat || 0) * Math.PI / 180) || 1;

  return {
    lat: Number((baseLat - z / scale).toFixed(6)),
    lon: Number((baseLon + x / (scale * cosLat)).toFixed(6))
  };
}

function capturePaintTownEntry(payload = {}) {
  const player = resolvePlayerName();
  const loc = getRuntimeLocationLabel();
  const actor = getActiveActorPosition() || { x: appCtx.car?.x || 0, z: appCtx.car?.z || 0 };
  const ll = worldToLatLon(actor.x || 0, actor.z || 0);
  const paintedPct = Number(payload.paintedPct);
  const paintedBuildings = Number(payload.paintedBuildings);
  const totalBuildings = Number(payload.totalBuildings);
  const durationMs = Number(payload.durationMs);

  return normalizeLeaderboardEntry({
    id: `paint_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    challenge: 'painttown',
    player,
    paintedPct: Number.isFinite(paintedPct) ? paintedPct : 0,
    paintedBuildings: Number.isFinite(paintedBuildings) ? paintedBuildings : 0,
    totalBuildings: Number.isFinite(totalBuildings) ? totalBuildings : 0,
    timeMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 120000,
    location: loc,
    lat: ll.lat,
    lon: ll.lon,
    mode: String(payload.mode || inferTravelMode()),
    foundAt: new Date().toISOString()
  }, 'painttown');
}

async function submitPaintTownScore(payload = {}) {
  const entry = capturePaintTownEntry(payload);
  if (!entry) return null;

  const remoteSaved = await writeRemoteLeaderboard('painttown', entry);
  if (!remoteSaved) {
    storeLocalResult('painttown', entry);
  }
  await refreshFlowerLeaderboard(challengeState.leaderboardView);
  setTitleStatus(
    `${entry.player} painted ${entry.paintedBuildings || 0} buildings in 2:00 at ${entry.location}.`,
    'ok'
  );
  return entry;
}

function setChallengeLeaderboardView(challengeType = 'flower') {
  challengeState.leaderboardView = normalizeChallengeType(challengeType);
  return refreshFlowerLeaderboard(challengeState.leaderboardView);
}

function isInsidePolygon(x, z, pts) {
  if (!Array.isArray(pts) || pts.length < 3) return false;
  if (typeof appCtx.pointInPolygon === 'function') return !!appCtx.pointInPolygon(x, z, pts);

  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const zi = pts[i].z;
    const xj = pts[j].x;
    const zj = pts[j].z;
    const intersects = zi > z !== zj > z && x < (xj - xi) * (z - zi) / (zj - zi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function getTerrainY(x, z) {
  if (typeof appCtx.terrainMeshHeightAt === 'function') {
    const h = appCtx.terrainMeshHeightAt(x, z);
    if (Number.isFinite(h)) return h;
  }
  if (typeof appCtx.elevationWorldYAtWorldXZ === 'function') {
    const h = appCtx.elevationWorldYAtWorldXZ(x, z);
    if (Number.isFinite(h)) return h;
  }
  return 0;
}

function getBuildingRoofY(x, z, groundY) {
  if (!Array.isArray(appCtx.buildings) || appCtx.buildings.length === 0) return null;

  const candidates = typeof appCtx.getNearbyBuildings === 'function' ?
  appCtx.getNearbyBuildings(x, z, 30) || [] :
  appCtx.buildings;

  let roof = null;
  for (let i = 0; i < candidates.length; i++) {
    const b = candidates[i];
    if (!b) continue;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (!isInsidePolygon(x, z, b.pts)) continue;
    const h = Number(b.height);
    if (!Number.isFinite(h) || h <= 0) continue;
    const top = groundY + h;
    if (!Number.isFinite(roof) || top > roof) roof = top;
  }

  return roof;
}

function getTopSurfaceY(x, z) {
  const groundY = getTerrainY(x, z);
  let topY = groundY;

  const roofY = getBuildingRoofY(x, z, groundY);
  if (Number.isFinite(roofY) && roofY > topY) topY = roofY;

  if (typeof appCtx.getBuildTopSurfaceAtWorldXZ === 'function') {
    const blockTop = appCtx.getBuildTopSurfaceAtWorldXZ(x, z, Infinity);
    if (Number.isFinite(blockTop) && blockTop > topY) topY = blockTop;
  }

  return topY;
}

function pickFlowerSpawn() {
  const actor = getActiveActorPosition();
  const baseX = Number(actor?.x || appCtx.car?.x || 0);
  const baseZ = Number(actor?.z || appCtx.car?.z || 0);

  const roads = Array.isArray(appCtx.roads) ? appCtx.roads : [];
  if (roads.length > 0) {
    for (let attempt = 0; attempt < 220; attempt++) {
      const road = roads[Math.floor(Math.random() * roads.length)];
      if (!road || !Array.isArray(road.pts) || road.pts.length === 0) continue;
      const pt = road.pts[Math.floor(Math.random() * road.pts.length)];
      if (!pt) continue;

      const roadWidth = Number(road.width) > 0 ? Number(road.width) : 10;
      const jitter = roadWidth * 0.75;
      const x = pt.x + (Math.random() - 0.5) * jitter;
      const z = pt.z + (Math.random() - 0.5) * jitter;
      const dist = Math.hypot(x - baseX, z - baseZ);
      if (dist < FLOWER_MIN_DISTANCE || dist > FLOWER_MAX_DISTANCE) continue;

      const y = getTopSurfaceY(x, z);
      if (!Number.isFinite(y)) continue;

      return { x, y, z };
    }
  }

  for (let attempt = 0; attempt < 160; attempt++) {
    const radius = FLOWER_MIN_DISTANCE + Math.random() * (FLOWER_MAX_DISTANCE - FLOWER_MIN_DISTANCE);
    const theta = Math.random() * Math.PI * 2;
    const x = baseX + Math.cos(theta) * radius;
    const z = baseZ + Math.sin(theta) * radius;
    const y = getTopSurfaceY(x, z);
    if (!Number.isFinite(y)) continue;
    return { x, y, z };
  }

  return null;
}

function buildFlowerMarkerMesh() {
  if (typeof THREE === 'undefined') return null;

  const root = new THREE.Group();
  root.name = 'redFlowerChallenge';

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.06, 1.5, 10),
    new THREE.MeshStandardMaterial({ color: 0x047857, roughness: 0.45, metalness: 0.05 })
  );
  stem.position.y = 0.8;
  root.add(stem);

  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.35, metalness: 0.1 })
  );
  center.position.y = 1.64;
  root.add(center);

  for (let i = 0; i < 8; i++) {
    const ang = i / 8 * Math.PI * 2;
    const petal = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.05 })
    );
    petal.scale.set(1.4, 0.8, 0.8);
    petal.position.set(Math.cos(ang) * 0.29, 1.64, Math.sin(ang) * 0.29);
    root.add(petal);
  }

  const beacon = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.03, 10, 40),
    new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.85 })
  );
  beacon.rotation.x = Math.PI * 0.5;
  beacon.position.y = 0.08;
  beacon.userData.isBeacon = true;
  root.add(beacon);

  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = false;
    }
  });

  return root;
}

function removeFlowerMarker() {
  if (!challengeState.marker) return;
  const marker = challengeState.marker;
  challengeState.marker = null;
  challengeState.markerPos = null;
  if (marker.parent) marker.parent.remove(marker);
  marker.traverse((child) => {
    if (child.geometry && typeof child.geometry.dispose === 'function') child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m?.dispose?.());
      else child.material.dispose?.();
    }
  });
}

function placeFlowerMarker(spawnPoint) {
  if (!appCtx.scene) return false;
  const marker = buildFlowerMarkerMesh();
  if (!marker) return false;

  marker.position.set(spawnPoint.x, spawnPoint.y + 0.02, spawnPoint.z);
  appCtx.scene.add(marker);

  challengeState.marker = marker;
  challengeState.markerBaseY = spawnPoint.y + 0.02;
  challengeState.markerPos = { x: spawnPoint.x, y: spawnPoint.y + 0.02, z: spawnPoint.z };
  return true;
}

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
  submitPaintTownScore,
  stopFlowerChallenge,
  toggleFlowerActionMenu,
  updateFlowerChallenge
};
