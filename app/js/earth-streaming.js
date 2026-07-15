import { ctx as appCtx } from "./shared-context.js?v=55";
import { currentActorWorldPosition } from "./earth-location.js?v=2";

const STREAM_TILE_ZOOM = 14;
const UPDATE_INTERVAL_SECONDS = 0.25;
const MAX_CONCURRENT_LOADS = 2;
const MAX_QUEUE_SIZE = 96;
const MIN_RESUME_GRACE_MS = 4200;
const WEB_MERCATOR_LAT_LIMIT = 85.05112878;

const layerRegistry = new Map();
const state = {
  anchorSignature: '',
  centerKey: '',
  predictedKey: '',
  generation: 0,
  updateElapsed: 0,
  lastSampleAt: 0,
  lastActorX: 0,
  lastActorZ: 0,
  velocityX: 0,
  velocityZ: 0,
  speedMps: 0,
  mode: 'walk',
  actorSource: 'none',
  center: null,
  predictedCenter: null,
  activeLoads: 0,
  queue: [],
  queuedIds: new Set(),
  loadsStarted: 0,
  loadsCompleted: 0,
  loadsCancelled: 0,
  loadsFailed: 0,
  lastError: '',
  resumeNotBeforeMs: 0
};

function releaseActiveLoad(pending) {
  if (!pending?.counted) return;
  pending.counted = false;
  state.activeLoads = Math.max(0, state.activeLoads - 1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function currentTravelMode() {
  if (typeof appCtx.getCurrentTravelMode === 'function') {
    return String(appCtx.getCurrentTravelMode() || 'walk');
  }
  if (appCtx.boatMode?.active) return 'boat';
  if (appCtx.droneMode) return 'drone';
  return appCtx.Walk?.state?.mode === 'walk' ? 'walk' : 'drive';
}

function isEarthRuntimeActive() {
  if (performance.now() < state.resumeNotBeforeMs) return false;
  if (!appCtx.gameStarted || appCtx.worldLoading || appCtx.onMoon || appCtx.onMars) return false;
  if (appCtx.oceanMode?.active || appCtx.spaceFlight?.active) return false;
  if (appCtx.ENV?.EARTH && typeof appCtx.getEnv === 'function') {
    return appCtx.getEnv() === appCtx.ENV.EARTH;
  }
  return true;
}

function latLonToTile(lat, lon, zoom = STREAM_TILE_ZOOM) {
  const safeLat = clamp(Number(lat) || 0, -WEB_MERCATOR_LAT_LIMIT, WEB_MERCATOR_LAT_LIMIT);
  const safeLon = ((Number(lon) || 0) + 540) % 360 - 180;
  const n = 2 ** zoom;
  const x = clamp(Math.floor((safeLon + 180) / 360 * n), 0, n - 1);
  const latRad = safeLat * Math.PI / 180;
  const y = clamp(Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) * 0.5 * n), 0, n - 1);
  return { x, y, z: zoom };
}

function tileKey(tile) {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

function tileBounds(tile) {
  const n = 2 ** tile.z;
  const lonW = tile.x / n * 360 - 180;
  const lonE = (tile.x + 1) / n * 360 - 180;
  const latN = 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * tile.y / n)));
  const latS = 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * (tile.y + 1) / n)));
  return { latN, latS, lonW, lonE };
}

function normalizeTile(tile) {
  const n = 2 ** tile.z;
  return {
    z: tile.z,
    x: ((tile.x % n) + n) % n,
    y: clamp(tile.y, 0, n - 1)
  };
}

function tileDistanceSq(a, b) {
  if (!a || !b) return Infinity;
  const n = 2 ** a.z;
  const rawDx = Math.abs(a.x - b.x);
  const dx = Math.min(rawDx, n - rawDx);
  const dy = Math.abs(a.y - b.y);
  return dx * dx + dy * dy;
}

function collectDesiredTiles(center, predicted, radius) {
  const desired = new Map();
  const addRing = (origin, ring, lookahead = false) => {
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        const tile = normalizeTile({ z: origin.z, x: origin.x + dx, y: origin.y + dy });
        const key = tileKey(tile);
        const distance = tileDistanceSq(tile, origin);
        const priority = distance + (lookahead ? 0.35 : 0);
        const previous = desired.get(key);
        if (!previous || priority < previous.priority) {
          desired.set(key, { ...tile, key, priority });
        }
      }
    }
  };
  addRing(center, radius, false);
  if (predicted && tileKey(predicted) !== tileKey(center)) addRing(predicted, Math.max(1, radius - 1), true);
  return desired;
}

function lookaheadSeconds(mode, speedMps) {
  const base = mode === 'plane' ? 18 : mode === 'drone' ? 12 : mode === 'boat' ? 10 : mode === 'drive' ? 14 : 2.5;
  return base + clamp(speedMps / 20, 0, mode === 'plane' ? 8 : 4);
}

function updateMotionSample(actor, nowMs, mode) {
  if (state.actorSource !== 'none' && actor.source !== state.actorSource) {
    state.lastSampleAt = nowMs;
    state.lastActorX = actor.x;
    state.lastActorZ = actor.z;
    state.velocityX = 0;
    state.velocityZ = 0;
    state.speedMps = 0;
    return;
  }
  const elapsed = state.lastSampleAt > 0 ? Math.max(0.016, (nowMs - state.lastSampleAt) / 1000) : 0;
  if (elapsed > 0 && elapsed < 2.5) {
    let measuredX = (actor.x - state.lastActorX) / elapsed;
    let measuredZ = (actor.z - state.lastActorZ) / elapsed;
    const metersPerUnit = Math.max(0.001, Number(appCtx.METERS_PER_WORLD_UNIT) || 1);
    const maxMps = mode === 'plane' ? 95 : mode === 'drone' ? 65 : mode === 'drive' ? 80 : mode === 'boat' ? 45 : 15;
    const maxWorldSpeed = maxMps / metersPerUnit;
    const measuredSpeed = Math.hypot(measuredX, measuredZ);
    if (measuredSpeed > maxWorldSpeed) {
      const scale = maxWorldSpeed / measuredSpeed;
      measuredX *= scale;
      measuredZ *= scale;
    }
    const blend = 0.35;
    state.velocityX += (measuredX - state.velocityX) * blend;
    state.velocityZ += (measuredZ - state.velocityZ) * blend;
  } else {
    state.velocityX = 0;
    state.velocityZ = 0;
  }
  state.lastSampleAt = nowMs;
  state.lastActorX = actor.x;
  state.lastActorZ = actor.z;
  state.speedMps = Math.hypot(state.velocityX, state.velocityZ) * (appCtx.METERS_PER_WORLD_UNIT || 1);
}

function abortObsoleteLayerWork(layer, desiredKeys) {
  layer.pending.forEach((entry, key) => {
    if (desiredKeys.has(key)) return;
    if (entry.cancelled) return;
    entry.cancelled = true;
    entry.controller.abort();
    state.loadsCancelled += 1;
  });
  state.queue = state.queue.filter((entry) => {
    if (entry.layer !== layer || desiredKeys.has(entry.key)) return true;
    state.queuedIds.delete(entry.id);
    return false;
  });
}

function unloadObsoleteChunks(layer, desiredKeys, centerTile, maxUnloads = 1) {
  const forceAll = !centerTile && desiredKeys.size === 0;
  const overflow = forceAll ? layer.loaded.size : Math.max(0, layer.loaded.size - layer.maxActive);
  const retentionDistanceSq = (layer.radius + 1) ** 2;
  const staleOutsideRetention = forceAll ? layer.loaded.size : [...layer.loaded.entries()].reduce((count, [key, entry]) => {
    if (desiredKeys.has(key)) return count;
    return count + (tileDistanceSq(entry.tile, centerTile) > retentionDistanceSq ? 1 : 0);
  }, 0);
  const unloadLimit = Math.min(maxUnloads, Math.max(overflow, staleOutsideRetention));
  if (!(unloadLimit > 0)) return;
  const candidates = [...layer.loaded.entries()]
    .filter(([key, entry]) =>
      forceAll || (!desiredKeys.has(key) && (
        layer.loaded.size > layer.maxActive || tileDistanceSq(entry.tile, centerTile) > retentionDistanceSq
      ))
    )
    .sort((a, b) => tileDistanceSq(b[1].tile, centerTile) - tileDistanceSq(a[1].tile, centerTile));
  let unloaded = 0;
  for (let i = 0; i < candidates.length && unloaded < unloadLimit; i += 1) {
    const [key, entry] = candidates[i];
    try {
      if (typeof layer.unloadChunk === 'function') layer.unloadChunk(entry.value, entry.tile);
      else entry.value?.dispose?.();
    } catch (error) {
      console.warn(`[EarthStreaming] ${layer.name} chunk disposal failed`, error);
    }
    layer.loaded.delete(key);
    unloaded += 1;
  }
}

function enqueueLayerLoads(layer, desired) {
  desired.forEach((tile, key) => {
    if (layer.loaded.has(key) || layer.pending.has(key)) return;
    const id = `${layer.name}:${key}`;
    if (state.queuedIds.has(id)) return;
    state.queuedIds.add(id);
    state.queue.push({ id, key, layer, tile, priority: tile.priority + layer.priorityBias });
  });
  state.queue.sort((a, b) => a.priority - b.priority);
  if (state.queue.length > MAX_QUEUE_SIZE) {
    const removed = state.queue.splice(MAX_QUEUE_SIZE);
    removed.forEach((entry) => state.queuedIds.delete(entry.id));
  }
}

function drainQueue() {
  while (state.activeLoads < MAX_CONCURRENT_LOADS && state.queue.length > 0) {
    const queued = state.queue.shift();
    state.queuedIds.delete(queued.id);
    const { layer, key, tile } = queued;
    if (layer.loaded.has(key) || layer.pending.has(key)) continue;
    const controller = new AbortController();
    const generation = state.generation;
    const pending = { controller, generation, cancelled: false, counted: true };
    layer.pending.set(key, pending);
    state.activeLoads += 1;
    state.loadsStarted += 1;
    Promise.resolve(layer.loadChunk({
      ...tile,
      bounds: tileBounds(tile),
      signal: controller.signal,
      generation
    })).then((value) => {
      if (controller.signal.aborted || generation !== state.generation) {
        if (typeof layer.unloadChunk === 'function') layer.unloadChunk(value, tile);
        else value?.dispose?.();
        return;
      }
      layer.loaded.set(key, { tile, value, loadedAt: performance.now() });
      state.loadsCompleted += 1;
    }).catch((error) => {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      state.loadsFailed += 1;
      state.lastError = String(error?.message || error || 'chunk load failed').slice(0, 180);
      console.warn(`[EarthStreaming] ${layer.name} chunk ${key} failed`, error);
    }).finally(() => {
      if (layer.pending.get(key) === pending) layer.pending.delete(key);
      releaseActiveLoad(pending);
      drainQueue();
    });
  }
}

function anchorSignature() {
  const lat = Number(appCtx.LOC?.lat);
  const lon = Number(appCtx.LOC?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(7)}:${lon.toFixed(7)}` : '';
}

function resetEarthStreaming(reason = 'reset') {
  state.generation += 1;
  state.queue.length = 0;
  state.queuedIds.clear();
  state.centerKey = '';
  state.predictedKey = '';
  state.lastSampleAt = 0;
  state.velocityX = 0;
  state.velocityZ = 0;
  state.speedMps = 0;
  state.lastError = '';
  state.resumeNotBeforeMs = 0;
  layerRegistry.forEach((layer) => {
    layer.pending.forEach((entry) => {
      entry.cancelled = true;
      entry.controller.abort();
      releaseActiveLoad(entry);
    });
    layer.pending.clear();
    unloadObsoleteChunks(layer, new Set(), null, Infinity);
  });
  state.activeLoads = 0;
  state.anchorSignature = anchorSignature();
  state.resetReason = reason;
}

function pauseEarthStreaming(reason = 'earth_inactive') {
  state.generation += 1;
  state.queue.length = 0;
  state.queuedIds.clear();
  state.resumeNotBeforeMs = Number.POSITIVE_INFINITY;
  state.lastSampleAt = 0;
  state.velocityX = 0;
  state.velocityZ = 0;
  state.speedMps = 0;
  state.actorSource = 'none';
  layerRegistry.forEach((layer) => {
    layer.pending.forEach((entry) => {
      if (!entry.cancelled) {
        entry.cancelled = true;
        entry.controller.abort();
        state.loadsCancelled += 1;
      }
      releaseActiveLoad(entry);
    });
    layer.pending.clear();
  });
  state.pauseReason = reason;
}

function resumeEarthStreaming(graceMs = 1200) {
  const requestedGraceMs = Math.max(0, Number(graceMs) || 0);
  state.resumeNotBeforeMs = performance.now() + Math.max(MIN_RESUME_GRACE_MS, requestedGraceMs);
  state.updateElapsed = 0;
  state.lastSampleAt = 0;
  state.actorSource = 'none';
  state.pauseReason = '';
}

function acceptEarthStreamingAnchorRebase() {
  state.anchorSignature = anchorSignature();
  state.lastSampleAt = 0;
  state.lastActorX = 0;
  state.lastActorZ = 0;
  state.velocityX = 0;
  state.velocityZ = 0;
  state.speedMps = 0;
}

function registerEarthStreamLayer(name, options = {}) {
  if (!name || typeof options.loadChunk !== 'function') {
    throw new TypeError('Earth stream layers require a name and loadChunk handler.');
  }
  if (layerRegistry.has(name)) throw new Error(`Earth stream layer already registered: ${name}`);
  const layer = {
    name,
    loadChunk: options.loadChunk,
    unloadChunk: options.unloadChunk,
    radius: clamp(Math.round(Number(options.radius) || 2), 1, 4),
    maxActive: clamp(Math.round(Number(options.maxActive) || 36), 9, 81),
    zoom: clamp(Math.round(Number(options.zoom) || STREAM_TILE_ZOOM), 8, STREAM_TILE_ZOOM),
    activeWhen: typeof options.activeWhen === 'function' ? options.activeWhen : null,
    priorityBias: Number(options.priorityBias) || 0,
    loaded: new Map(),
    pending: new Map()
  };
  layerRegistry.set(name, layer);
  return () => {
    layer.pending.forEach((entry) => {
      entry.cancelled = true;
      entry.controller.abort();
      releaseActiveLoad(entry);
    });
    unloadObsoleteChunks(layer, new Set(), null, Infinity);
    layerRegistry.delete(name);
  };
}

function streamingSnapshot() {
  const layers = {};
  layerRegistry.forEach((layer, name) => {
    layers[name] = {
      loaded: layer.loaded.size,
      pending: layer.pending.size,
      maxActive: layer.maxActive,
      zoom: layer.zoom
    };
  });
  return {
    generation: state.generation,
    mode: state.mode,
    actorSource: state.actorSource,
    centerKey: state.centerKey,
    predictedKey: state.predictedKey,
    speedMps: Math.round(state.speedMps * 10) / 10,
    queue: state.queue.length,
    activeLoads: state.activeLoads,
    loadsStarted: state.loadsStarted,
    loadsCompleted: state.loadsCompleted,
    loadsCancelled: state.loadsCancelled,
    loadsFailed: state.loadsFailed,
    lastError: state.lastError,
    layers
  };
}

function updateEarthWorldStreaming(dt = 0) {
  if (!isEarthRuntimeActive()) return false;
  state.updateElapsed += Math.max(0, Number(dt) || 0);
  if (state.updateElapsed < UPDATE_INTERVAL_SECONDS) return false;
  state.updateElapsed = 0;

  const nextAnchorSignature = anchorSignature();
  if (state.anchorSignature && state.anchorSignature !== nextAnchorSignature) resetEarthStreaming('world_anchor_changed');
  else if (!state.anchorSignature) state.anchorSignature = nextAnchorSignature;

  const actor = currentActorWorldPosition();
  if (!actor || typeof appCtx.worldToLatLon !== 'function') return false;
  const nowMs = performance.now();
  state.mode = currentTravelMode();
  updateMotionSample(actor, nowMs, state.mode);
  state.actorSource = actor.source || state.mode;

  const center = appCtx.worldToLatLon(actor.x, actor.z);
  const secondsAhead = lookaheadSeconds(state.mode, state.speedMps);
  const predictedWorld = {
    x: actor.x + state.velocityX * secondsAhead,
    z: actor.z + state.velocityZ * secondsAhead
  };
  const predictedCenter = appCtx.worldToLatLon(predictedWorld.x, predictedWorld.z);
  const centerTile = latLonToTile(center.lat, center.lon);
  const predictedTile = latLonToTile(predictedCenter.lat, predictedCenter.lon);
  state.center = center;
  state.predictedCenter = predictedCenter;
  state.centerKey = tileKey(centerTile);
  state.predictedKey = tileKey(predictedTile);

  if (typeof appCtx.updateTerrainAround === 'function') appCtx.updateTerrainAround(actor.x, actor.z);
  layerRegistry.forEach((layer) => {
    if (layer.activeWhen && !layer.activeWhen({ actor, mode: state.mode, speedMps: state.speedMps })) {
      abortObsoleteLayerWork(layer, new Set());
      unloadObsoleteChunks(layer, new Set(), null, Infinity);
      return;
    }
    const layerCenterTile = layer.zoom === STREAM_TILE_ZOOM
      ? centerTile
      : latLonToTile(center.lat, center.lon, layer.zoom);
    const layerPredictedTile = layer.zoom === STREAM_TILE_ZOOM
      ? predictedTile
      : latLonToTile(predictedCenter.lat, predictedCenter.lon, layer.zoom);
    const desired = collectDesiredTiles(layerCenterTile, layerPredictedTile, layer.radius);
    const desiredKeys = new Set(desired.keys());
    abortObsoleteLayerWork(layer, desiredKeys);
    unloadObsoleteChunks(layer, desiredKeys, layerCenterTile);
    enqueueLayerLoads(layer, desired);
  });
  drainQueue();

  if (typeof appCtx.maybeRetireInitialEarthWorld === 'function') {
    appCtx.maybeRetireInitialEarthWorld(actor, streamingSnapshot());
  }
  if (typeof appCtx.maybeRebaseEarthOrigin === 'function') {
    appCtx.maybeRebaseEarthOrigin(actor, streamingSnapshot());
  }

  const snapshot = streamingSnapshot();
  if (typeof appCtx.setPerfLiveStat === 'function') appCtx.setPerfLiveStat('earthStreaming', snapshot);
  return true;
}

Object.assign(appCtx, {
  acceptEarthStreamingAnchorRebase,
  earthStreamingState: state,
  getEarthStreamingSnapshot: streamingSnapshot,
  pauseEarthStreaming,
  registerEarthStreamLayer,
  resetEarthStreaming,
  resumeEarthStreaming,
  updateEarthWorldStreaming
});

export {
  acceptEarthStreamingAnchorRebase,
  latLonToTile,
  pauseEarthStreaming,
  registerEarthStreamLayer,
  resetEarthStreaming,
  resumeEarthStreaming,
  streamingSnapshot as getEarthStreamingSnapshot,
  updateEarthWorldStreaming
};
