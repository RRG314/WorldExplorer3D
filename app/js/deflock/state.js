const DEFLOCK_PROGRESS_VERSION = 1;
const DEFLOCK_STORAGE_PREFIX = "worldExplorer3D.deflock.progress.v1";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function locationKey(location = {}, sourceVersion = "osm-surveillance-v1") {
  const lat = finite(location.lat).toFixed(5);
  const lon = finite(location.lon).toFixed(5);
  return `${sourceVersion}:${lat}:${lon}`;
}

function storageKey(location, sourceVersion) {
  return `${DEFLOCK_STORAGE_PREFIX}:${locationKey(location, sourceVersion)}`;
}

function sanitizeIdList(value, allowedIds) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  for (const raw of value) {
    const id = String(raw || "").slice(0, 120);
    if (!id || seen.has(id) || (allowedIds && !allowedIds.has(id))) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function readLocalProgress(location, sourceVersion, storage = globalThis.localStorage) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(location, sourceVersion)) || "null");
    return parsed?.version === DEFLOCK_PROGRESS_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function createDeFlockState(features = [], options = {}) {
  const sourceVersion = String(options.sourceVersion || "osm-surveillance-v1");
  const featureById = new Map();
  features.forEach((feature) => {
    const id = String(feature?.sourceId || "").slice(0, 120);
    if (id && !featureById.has(id)) featureById.set(id, feature);
  });
  const allowedIds = new Set(featureById.keys());
  const persisted = options.persisted || null;
  const state = {
    version: DEFLOCK_PROGRESS_VERSION,
    sourceVersion,
    location: {
      lat: finite(options.location?.lat),
      lon: finite(options.location?.lon),
      name: String(options.location?.name || "Earth location").slice(0, 80)
    },
    features: [...featureById.values()],
    featureById,
    discovered: new Set(sanitizeIdList(persisted?.discovered, allowedIds)),
    disabled: new Set(sanitizeIdList(persisted?.disabled, allowedIds)),
    disabledBy: new Map(),
    startedAt: finite(options.startedAt, Date.now()),
    elapsedMs: Math.max(0, finite(persisted?.elapsedMs, 0)),
    distance: 0,
    detections: 0,
    lastDetectionAt: 0,
    lastActorPosition: null,
    bestTimeMs: Math.max(0, finite(persisted?.bestTimeMs, 0)),
    bestScore: Math.max(0, finite(persisted?.bestScore, 0)),
    status: features.length > 0 ? "ready" : "empty",
    completedAt: null,
    loading: false,
    error: ""
  };
  if (state.features.length > 0 && state.disabled.size >= state.features.length) {
    state.status = "complete";
    state.completedAt = state.startedAt + state.elapsedMs;
  }
  return state;
}

function markDiscovered(state, sourceId) {
  const id = String(sourceId || "");
  if (!state?.featureById?.has(id) || state.discovered.has(id)) return false;
  state.discovered.add(id);
  return true;
}

function markVirtuallyDisabled(state, sourceId, metadata = {}) {
  const id = String(sourceId || "");
  if (!state?.featureById?.has(id) || state.disabled.has(id)) return false;
  state.discovered.add(id);
  state.disabled.add(id);
  state.disabledBy.set(id, {
    uid: String(metadata.uid || "").slice(0, 160),
    displayName: String(metadata.displayName || "Explorer").slice(0, 48),
    at: finite(metadata.at, Date.now())
  });
  if (state.disabled.size >= state.features.length && state.features.length > 0 && !state.completedAt) {
    state.completedAt = Date.now();
    state.status = "complete";
    const elapsed = getElapsedMs(state);
    if (!state.bestTimeMs || elapsed < state.bestTimeMs) state.bestTimeMs = elapsed;
    state.bestScore = Math.max(state.bestScore, scoreForState(state));
  }
  return true;
}

function applySharedDisabled(state, entries = []) {
  let changed = false;
  for (const entry of entries) {
    changed = markVirtuallyDisabled(state, entry?.sourceId, entry) || changed;
  }
  return changed;
}

function getElapsedMs(state, now = Date.now()) {
  if (!state) return 0;
  const activeDuration = state.completedAt ? state.completedAt - state.startedAt : now - state.startedAt;
  return Math.max(0, finite(state.elapsedMs) + Math.max(0, activeDuration));
}

function scoreForState(state) {
  if (!state) return 0;
  const completionBonus = state.features.length > 0 && state.disabled.size >= state.features.length ? 1000 : 0;
  return Math.max(0, state.disabled.size * 100 + state.discovered.size * 10 + completionBonus - state.detections * 25);
}

function progressSnapshot(state) {
  if (!state) return null;
  const total = state.features.length;
  return {
    status: state.status,
    total,
    discovered: state.discovered.size,
    disabled: state.disabled.size,
    completionPercent: total ? Math.round((state.disabled.size / total) * 100) : 0,
    elapsedMs: getElapsedMs(state),
    distance: Number(finite(state.distance).toFixed(1)),
    detections: state.detections,
    score: scoreForState(state),
    bestTimeMs: state.bestTimeMs,
    bestScore: state.bestScore,
    location: { ...state.location },
    sourceVersion: state.sourceVersion
  };
}

function serializeProgress(state) {
  const snapshot = progressSnapshot(state);
  return {
    version: DEFLOCK_PROGRESS_VERSION,
    sourceVersion: state.sourceVersion,
    discovered: [...state.discovered],
    disabled: [...state.disabled],
    elapsedMs: snapshot.elapsedMs,
    bestTimeMs: state.bestTimeMs,
    bestScore: state.bestScore,
    updatedAt: Date.now()
  };
}

function writeLocalProgress(state, storage = globalThis.localStorage) {
  if (!state || !storage) return false;
  try {
    storage.setItem(storageKey(state.location, state.sourceVersion), JSON.stringify(serializeProgress(state)));
    return true;
  } catch {
    return false;
  }
}

export {
  DEFLOCK_PROGRESS_VERSION,
  DEFLOCK_STORAGE_PREFIX,
  applySharedDisabled,
  createDeFlockState,
  getElapsedMs,
  locationKey,
  markDiscovered,
  markVirtuallyDisabled,
  progressSnapshot,
  readLocalProgress,
  scoreForState,
  serializeProgress,
  storageKey,
  writeLocalProgress
};
