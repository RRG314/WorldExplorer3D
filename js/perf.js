import { ctx as appCtx } from "./shared-context.js?v=54"; // ============================================================================
// perf.js - Runtime performance mode + benchmark telemetry for RDT comparisons
// ============================================================================

const PERF_MODE_RDT = 'rdt';
const PERF_MODE_BASELINE = 'baseline';
const PERF_STORAGE_MODE_KEY = 'worldExplorerPerfMode';
const PERF_STORAGE_OVERLAY_KEY = 'worldExplorerPerfOverlay';
const PERF_STORAGE_AUTO_QUALITY_KEY = 'worldExplorerPerfAutoQuality';
const PERF_QUALITY_TIER_PERFORMANCE = 'performance';
const PERF_QUALITY_TIER_BALANCED = 'balanced';
const PERF_QUALITY_TIER_QUALITY = 'quality';
const PERF_SPIKE_WINDOW_SIZE = 1800;
const PERF_SPIKE_16_7_MS = 16.7;
const PERF_SPIKE_33_3_MS = 33.3;
const PERF_SPIKE_50_MS = 50;
const PERF_SPIKE_100_MS = 100;
const AUTO_QUALITY_EVAL_INTERVAL_S = 2.0;
const AUTO_QUALITY_DEGRADE_FPS = 50;
const AUTO_QUALITY_RECOVER_FPS = 57;
const AUTO_QUALITY_DEGRADE_FRAME_MS = 23.0;
const AUTO_QUALITY_RECOVER_FRAME_MS = 18.2;
const AUTO_QUALITY_DEGRADE_STREAK = 3;
const AUTO_QUALITY_RECOVER_STREAK = 6;
const AUTO_QUALITY_COOLDOWN_S = 12;

let perfMode = PERF_MODE_RDT;
let perfOverlayEnabled = false;
let perfAutoQualityEnabled = true;
let perfAutoQualityTier = PERF_QUALITY_TIER_BALANCED;

let _perfFps = 0;
let _perfFrameMs = 0;
let _perfFrameAccum = 0;
let _perfFrameCount = 0;
let _perfLoadStart = null;
let _perfLoadSpikeState = null;
let _perfSessionMaxFrameMs = 0;
let _perfSessionSpikeOver16_7 = 0;
let _perfSessionSpikeOver33_3 = 0;
let _perfSessionSpikeOver50 = 0;
let _perfSessionSpikeOver100 = 0;
let _perfSessionSpikeSamples = 0;

const _perfFrameSpikeWindow = new Float32Array(PERF_SPIKE_WINDOW_SIZE);
let _perfFrameSpikeWriteIdx = 0;
let _perfFrameSpikeCount = 0;
let _perfWindowSpikeOver16_7 = 0;
let _perfWindowSpikeOver33_3 = 0;
let _perfWindowSpikeOver50 = 0;
let _perfWindowSpikeOver100 = 0;
let _perfWindowMaxFrameMs = 0;
let _perfAutoQualityEvalClock = 0;
let _perfAutoQualityCooldown = 0;
let _perfAutoQualityLowStreak = 0;
let _perfAutoQualityHighStreak = 0;
let _perfAutoQualityLastChangeAt = 0;
let _perfAutoQualityLastReason = 'init';

const perfStats = {
  mode: PERF_MODE_RDT,
  lastLoad: null,
  renderer: {
    calls: 0,
    triangles: 0,
    points: 0,
    lines: 0,
    geometries: 0,
    textures: 0,
    programs: 0
  },
  live: {
    speedMph: 0,
    terrainRing: typeof appCtx.TERRAIN_RING === 'number' ? appCtx.TERRAIN_RING : 0,
    lodVisible: { near: 0, mid: 0 },
    worldCounts: { roads: 0, buildings: 0, poiMeshes: 0, landuseMeshes: 0 },
    quality: {
      auto: true,
      tier: PERF_QUALITY_TIER_BALANCED,
      budgetScale: 1,
      lodScale: 1,
      changedAt: 0,
      reason: 'init'
    },
    spikes: {
      windowFrames: 0,
      over16_7: 0,
      over33_3: 0,
      over50: 0,
      over100: 0,
      maxFrameMs: 0
    }
  },
  updatedAt: Date.now()
};

function _isFrameOverThreshold(frameMs, thresholdMs) {
  return Number.isFinite(frameMs) && frameMs >= thresholdMs;
}

function _recomputeWindowMaxFrameMs() {
  if (_perfFrameSpikeCount <= 0) {
    _perfWindowMaxFrameMs = 0;
    return;
  }
  let max = 0;
  for (let i = 0; i < _perfFrameSpikeCount; i++) {
    const value = _perfFrameSpikeWindow[i];
    if (value > max) max = value;
  }
  _perfWindowMaxFrameMs = max;
}

function _recordPerfSpikeFrame(frameMs) {
  if (!Number.isFinite(frameMs) || frameMs <= 0) return;

  _perfSessionSpikeSamples += 1;
  if (_isFrameOverThreshold(frameMs, PERF_SPIKE_16_7_MS)) _perfSessionSpikeOver16_7 += 1;
  if (_isFrameOverThreshold(frameMs, PERF_SPIKE_33_3_MS)) _perfSessionSpikeOver33_3 += 1;
  if (_isFrameOverThreshold(frameMs, PERF_SPIKE_50_MS)) _perfSessionSpikeOver50 += 1;
  if (_isFrameOverThreshold(frameMs, PERF_SPIKE_100_MS)) _perfSessionSpikeOver100 += 1;
  if (frameMs > _perfSessionMaxFrameMs) _perfSessionMaxFrameMs = frameMs;

  if (_perfLoadSpikeState) {
    _perfLoadSpikeState.samples += 1;
    if (_isFrameOverThreshold(frameMs, PERF_SPIKE_16_7_MS)) _perfLoadSpikeState.over16_7 += 1;
    if (_isFrameOverThreshold(frameMs, PERF_SPIKE_33_3_MS)) _perfLoadSpikeState.over33_3 += 1;
    if (_isFrameOverThreshold(frameMs, PERF_SPIKE_50_MS)) _perfLoadSpikeState.over50 += 1;
    if (_isFrameOverThreshold(frameMs, PERF_SPIKE_100_MS)) _perfLoadSpikeState.over100 += 1;
    if (frameMs > _perfLoadSpikeState.maxFrameMs) _perfLoadSpikeState.maxFrameMs = frameMs;
  }

  const replacing = _perfFrameSpikeCount >= PERF_SPIKE_WINDOW_SIZE;
  let replacedValue = 0;
  if (replacing) replacedValue = _perfFrameSpikeWindow[_perfFrameSpikeWriteIdx];

  if (replacing) {
    if (_isFrameOverThreshold(replacedValue, PERF_SPIKE_16_7_MS)) _perfWindowSpikeOver16_7 -= 1;
    if (_isFrameOverThreshold(replacedValue, PERF_SPIKE_33_3_MS)) _perfWindowSpikeOver33_3 -= 1;
    if (_isFrameOverThreshold(replacedValue, PERF_SPIKE_50_MS)) _perfWindowSpikeOver50 -= 1;
    if (_isFrameOverThreshold(replacedValue, PERF_SPIKE_100_MS)) _perfWindowSpikeOver100 -= 1;
  }

  _perfFrameSpikeWindow[_perfFrameSpikeWriteIdx] = frameMs;
  _perfFrameSpikeWriteIdx = (_perfFrameSpikeWriteIdx + 1) % PERF_SPIKE_WINDOW_SIZE;
  if (!replacing) _perfFrameSpikeCount += 1;

  if (_isFrameOverThreshold(frameMs, PERF_SPIKE_16_7_MS)) _perfWindowSpikeOver16_7 += 1;
  if (_isFrameOverThreshold(frameMs, PERF_SPIKE_33_3_MS)) _perfWindowSpikeOver33_3 += 1;
  if (_isFrameOverThreshold(frameMs, PERF_SPIKE_50_MS)) _perfWindowSpikeOver50 += 1;
  if (_isFrameOverThreshold(frameMs, PERF_SPIKE_100_MS)) _perfWindowSpikeOver100 += 1;

  if (frameMs >= _perfWindowMaxFrameMs) {
    _perfWindowMaxFrameMs = frameMs;
  } else if (replacing && Math.abs(replacedValue - _perfWindowMaxFrameMs) < 0.0001) {
    _recomputeWindowMaxFrameMs();
  }
}

function _windowFramesArray() {
  if (_perfFrameSpikeCount <= 0) return [];
  const out = new Array(_perfFrameSpikeCount);
  const firstIdx = _perfFrameSpikeCount < PERF_SPIKE_WINDOW_SIZE ? 0 : _perfFrameSpikeWriteIdx;
  for (let i = 0; i < _perfFrameSpikeCount; i++) {
    const idx = (firstIdx + i) % PERF_SPIKE_WINDOW_SIZE;
    out[i] = _perfFrameSpikeWindow[idx];
  }
  return out;
}

function _percentileSorted(sortedValues, p) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return 0;
  const clamped = Math.max(0, Math.min(1, p));
  const pos = clamped * (sortedValues.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedValues[lo];
  const t = pos - lo;
  return sortedValues[lo] * (1 - t) + sortedValues[hi] * t;
}

function getPerfSpikeMetrics(includePercentiles = false) {
  const metrics = {
    windowFrames: _perfFrameSpikeCount,
    over16_7: _perfWindowSpikeOver16_7,
    over33_3: _perfWindowSpikeOver33_3,
    over50: _perfWindowSpikeOver50,
    over100: _perfWindowSpikeOver100,
    maxFrameMs: Number((_perfWindowMaxFrameMs || 0).toFixed(2)),
    session: {
      frames: _perfSessionSpikeSamples,
      over16_7: _perfSessionSpikeOver16_7,
      over33_3: _perfSessionSpikeOver33_3,
      over50: _perfSessionSpikeOver50,
      over100: _perfSessionSpikeOver100,
      maxFrameMs: Number((_perfSessionMaxFrameMs || 0).toFixed(2))
    }
  };
  if (!includePercentiles || _perfFrameSpikeCount <= 0) {
    metrics.p95Ms = 0;
    metrics.p99Ms = 0;
    return metrics;
  }

  const sorted = _windowFramesArray().sort((a, b) => a - b);
  metrics.p95Ms = Number(_percentileSorted(sorted, 0.95).toFixed(2));
  metrics.p99Ms = Number(_percentileSorted(sorted, 0.99).toFixed(2));
  return metrics;
}

function exposeMutableGlobal(name, getter, setter) {
  Object.defineProperty(appCtx, name, {
    configurable: true,
    enumerable: true,
    get: getter,
    set: setter
  });
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {


    // Ignore storage failures (private browsing / blocked storage).
  }}
function normalizePerfMode(mode) {
  return mode === PERF_MODE_BASELINE ? PERF_MODE_BASELINE : PERF_MODE_RDT;
}

function normalizePerfQualityTier(tier) {
  if (tier === PERF_QUALITY_TIER_PERFORMANCE) return PERF_QUALITY_TIER_PERFORMANCE;
  if (tier === PERF_QUALITY_TIER_QUALITY) return PERF_QUALITY_TIER_QUALITY;
  return PERF_QUALITY_TIER_BALANCED;
}

function getPerfQualityProfile(tier = perfAutoQualityTier) {
  const normalized = normalizePerfQualityTier(tier);
  if (normalized === PERF_QUALITY_TIER_PERFORMANCE) {
    return {
      tier: normalized,
      label: 'Performance',
      budgetScale: 0.82,
      lodScale: 0.90
    };
  }
  if (normalized === PERF_QUALITY_TIER_QUALITY) {
    return {
      tier: normalized,
      label: 'Quality',
      budgetScale: 1.10,
      lodScale: 1.08
    };
  }
  return {
    tier: PERF_QUALITY_TIER_BALANCED,
    label: 'Balanced',
    budgetScale: 1.0,
    lodScale: 1.0
  };
}

function getPerfMode() {
  return perfMode;
}

function setPerfMode(mode, options = {}) {
  const normalized = normalizePerfMode(mode);
  perfMode = normalized;
  perfStats.mode = normalized;

  const persist = options.persist !== false;
  if (persist) writeStorage(PERF_STORAGE_MODE_KEY, normalized);
  return normalized;
}

function getPerfOverlayEnabled() {
  return !!perfOverlayEnabled;
}

function setPerfOverlayEnabled(enabled, options = {}) {
  perfOverlayEnabled = !!enabled;
  const persist = options.persist !== false;
  if (persist) writeStorage(PERF_STORAGE_OVERLAY_KEY, perfOverlayEnabled ? '1' : '0');
  return perfOverlayEnabled;
}

function getPerfAutoQualityEnabled() {
  return !!perfAutoQualityEnabled;
}

function setPerfAutoQualityEnabled(enabled, options = {}) {
  perfAutoQualityEnabled = !!enabled;
  if (!perfAutoQualityEnabled) {
    _perfAutoQualityLowStreak = 0;
    _perfAutoQualityHighStreak = 0;
    _perfAutoQualityCooldown = 0;
  }
  const persist = options.persist !== false;
  if (persist) writeStorage(PERF_STORAGE_AUTO_QUALITY_KEY, perfAutoQualityEnabled ? '1' : '0');
  return perfAutoQualityEnabled;
}

function getPerfAutoQualityTier() {
  return perfAutoQualityTier;
}

function setPerfAutoQualityTier(tier, options = {}) {
  const normalized = normalizePerfQualityTier(tier);
  perfAutoQualityTier = normalized;
  _perfAutoQualityLastReason = options.reason || _perfAutoQualityLastReason;
  _perfAutoQualityLastChangeAt = Date.now();
  return perfAutoQualityTier;
}

function _perfQualityTierIndex(tier) {
  switch (normalizePerfQualityTier(tier)) {
    case PERF_QUALITY_TIER_PERFORMANCE:return 0;
    case PERF_QUALITY_TIER_QUALITY:return 2;
    default:return 1;
  }
}

function _stepPerfAutoQuality(dt, fps, frameMs) {
  if (!perfAutoQualityEnabled) return;
  if (!Number.isFinite(dt) || dt <= 0) return;

  _perfAutoQualityEvalClock += dt;
  _perfAutoQualityCooldown = Math.max(0, _perfAutoQualityCooldown - dt);
  if (_perfAutoQualityEvalClock < AUTO_QUALITY_EVAL_INTERVAL_S) return;
  _perfAutoQualityEvalClock = 0;

  const spikeMetrics = getPerfSpikeMetrics(false);
  const windowFrames = Math.max(1, spikeMetrics.windowFrames || 0);
  const over33Ratio = (spikeMetrics.over33_3 || 0) / windowFrames;
  const lowPressure =
  Number.isFinite(fps) && fps > 0 && fps < AUTO_QUALITY_DEGRADE_FPS ||
  Number.isFinite(frameMs) && frameMs > AUTO_QUALITY_DEGRADE_FRAME_MS ||
  over33Ratio > 0.14 ||
  (spikeMetrics.maxFrameMs || 0) > 55;
  const highHeadroom =
  Number.isFinite(fps) && fps >= AUTO_QUALITY_RECOVER_FPS &&
  Number.isFinite(frameMs) && frameMs <= AUTO_QUALITY_RECOVER_FRAME_MS &&
  over33Ratio < 0.05;

  if (lowPressure) {
    _perfAutoQualityLowStreak += 1;
    _perfAutoQualityHighStreak = 0;
  } else if (highHeadroom) {
    _perfAutoQualityHighStreak += 1;
    _perfAutoQualityLowStreak = Math.max(0, _perfAutoQualityLowStreak - 1);
  } else {
    _perfAutoQualityLowStreak = Math.max(0, _perfAutoQualityLowStreak - 1);
    _perfAutoQualityHighStreak = Math.max(0, _perfAutoQualityHighStreak - 1);
  }

  if (_perfAutoQualityCooldown > 0) return;

  const tierIdx = _perfQualityTierIndex(perfAutoQualityTier);
  if (_perfAutoQualityLowStreak >= AUTO_QUALITY_DEGRADE_STREAK && tierIdx > 0) {
    const nextTier = tierIdx === 2 ? PERF_QUALITY_TIER_BALANCED : PERF_QUALITY_TIER_PERFORMANCE;
    setPerfAutoQualityTier(nextTier, { reason: 'fps_down' });
    _perfAutoQualityCooldown = AUTO_QUALITY_COOLDOWN_S;
    _perfAutoQualityLowStreak = 0;
    _perfAutoQualityHighStreak = 0;
    return;
  }

  if (_perfAutoQualityHighStreak >= AUTO_QUALITY_RECOVER_STREAK && tierIdx < 2) {
    const nextTier = tierIdx === 0 ? PERF_QUALITY_TIER_BALANCED : PERF_QUALITY_TIER_QUALITY;
    setPerfAutoQualityTier(nextTier, { reason: 'fps_up' });
    _perfAutoQualityCooldown = AUTO_QUALITY_COOLDOWN_S;
    _perfAutoQualityLowStreak = 0;
    _perfAutoQualityHighStreak = 0;
  }
}

function getDynamicBudgetState() {
  const effectiveTier = perfAutoQualityEnabled ? perfAutoQualityTier : PERF_QUALITY_TIER_BALANCED;
  const profile = getPerfQualityProfile(effectiveTier);
  return {
    auto: !!perfAutoQualityEnabled,
    tier: effectiveTier,
    label: profile.label,
    budgetScale: profile.budgetScale,
    lodScale: profile.lodScale,
    changedAt: _perfAutoQualityLastChangeAt,
    reason: _perfAutoQualityLastReason
  };
}

function setPerfLiveStat(key, value) {
  if (!key) return;
  perfStats.live[key] = value;
}

function mergePerfLiveStats(values = {}) {
  if (!values || typeof values !== 'object') return;
  Object.keys(values).forEach((key) => {
    perfStats.live[key] = values[key];
  });
}

function startPerfLoad(label, meta = {}) {
  _perfLoadStart = {
    label: label || 'world-load',
    mode: perfMode,
    startedAt: performance.now(),
    meta
  };
  _perfLoadSpikeState = {
    samples: 0,
    over16_7: 0,
    over33_3: 0,
    over50: 0,
    over100: 0,
    maxFrameMs: 0
  };
}

function finishPerfLoad(summary = {}) {
  const now = performance.now();
  const startedAt = _perfLoadStart?.startedAt;
  const loadMs = Number.isFinite(startedAt) ?
  now - startedAt :
  Number.isFinite(summary.loadMs) ? summary.loadMs : 0;

  const loadSpikes = _perfLoadSpikeState ?
  {
    sampleFrames: _perfLoadSpikeState.samples,
    over16_7: _perfLoadSpikeState.over16_7,
    over33_3: _perfLoadSpikeState.over33_3,
    over50: _perfLoadSpikeState.over50,
    over100: _perfLoadSpikeState.over100,
    maxFrameMs: Number((_perfLoadSpikeState.maxFrameMs || 0).toFixed(2))
  } :
  null;

  perfStats.lastLoad = {
    label: _perfLoadStart?.label || summary.label || 'world-load',
    mode: _perfLoadStart?.mode || perfMode,
    loadMs: Math.max(0, Math.round(loadMs)),
    timestamp: new Date().toISOString(),
    ...(typeof _perfLoadStart?.meta === 'object' ? _perfLoadStart.meta : {}),
    ...(loadSpikes ? { spikes: loadSpikes } : {}),
    ...(typeof summary === 'object' ? summary : {})
  };
  _perfLoadStart = null;
  _perfLoadSpikeState = null;
  perfStats.updatedAt = Date.now();
}

function recordPerfFrame(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;

  const frameMs = dt * 1000;
  _recordPerfSpikeFrame(frameMs);
  _perfFrameMs = _perfFrameMs <= 0 ? frameMs : _perfFrameMs * 0.9 + frameMs * 0.1;

  _perfFrameAccum += dt;
  _perfFrameCount += 1;
  if (_perfFrameAccum >= 0.5) {
    _perfFps = _perfFrameCount / _perfFrameAccum;
    _perfFrameAccum = 0;
    _perfFrameCount = 0;
  }

  perfStats.live.fps = Number.isFinite(_perfFps) ? _perfFps : 0;
  perfStats.live.frameMs = Number.isFinite(_perfFrameMs) ? _perfFrameMs : 0;
  perfStats.live.spikes = getPerfSpikeMetrics(false);

  const currentSpeedMph = (() => {
    if (typeof appCtx.droneMode !== 'undefined' && appCtx.droneMode && typeof appCtx.drone !== 'undefined') {
      return Math.max(0, Math.abs((appCtx.drone.speed || 0) * 1.8));
    }
    if (
    typeof appCtx.Walk !== 'undefined' && appCtx.Walk &&

    appCtx.Walk.state &&
    appCtx.Walk.state.mode === 'walk')
    {
      return Math.max(0, Math.abs(appCtx.Walk.state.walker?.speedMph || 0));
    }
    if (typeof appCtx.car !== 'undefined' && appCtx.car) {
      return Math.max(0, Math.abs((appCtx.car.speed || 0) * 0.5));
    }
    return 0;
  })();
  perfStats.live.speedMph = currentSpeedMph;
  _stepPerfAutoQuality(dt, perfStats.live.fps, perfStats.live.frameMs);
  perfStats.live.quality = getDynamicBudgetState();
}

function recordPerfRendererInfo(rendererRef) {
  if (!rendererRef || !rendererRef.info) return;
  const info = rendererRef.info;
  const render = info.render || {};
  const memory = info.memory || {};
  const programs = Array.isArray(info.programs) ? info.programs.length : info.programs || 0;

  perfStats.renderer.calls = render.calls || 0;
  perfStats.renderer.triangles = render.triangles || 0;
  perfStats.renderer.points = render.points || 0;
  perfStats.renderer.lines = render.lines || 0;
  perfStats.renderer.geometries = memory.geometries || 0;
  perfStats.renderer.textures = memory.textures || 0;
  perfStats.renderer.programs = programs || 0;

  perfStats.live.worldCounts = {
    roads: typeof appCtx.roads !== 'undefined' && Array.isArray(appCtx.roads) ? appCtx.roads.length : 0,
    buildings: typeof appCtx.buildingMeshes !== 'undefined' && Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes.length : 0,
    poiMeshes: typeof appCtx.poiMeshes !== 'undefined' && Array.isArray(appCtx.poiMeshes) ? appCtx.poiMeshes.length : 0,
    landuseMeshes: typeof appCtx.landuseMeshes !== 'undefined' && Array.isArray(appCtx.landuseMeshes) ? appCtx.landuseMeshes.length : 0
  };
  perfStats.updatedAt = Date.now();
}

function formatPerfNumber(n) {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function capturePerfSnapshot(extra = {}) {
  const locName = (() => {
    if (typeof appCtx.selLoc === 'undefined') return 'Unknown';
    if (appCtx.selLoc === 'custom' && typeof appCtx.customLoc !== 'undefined') return appCtx.customLoc?.name || 'Custom';
    if (typeof appCtx.LOCS !== 'undefined' && appCtx.LOCS && appCtx.LOCS[appCtx.selLoc]) return appCtx.LOCS[appCtx.selLoc].name;
    return String(appCtx.selLoc);
  })();

  const spikeMetrics = getPerfSpikeMetrics(true);
  return {
    generatedAt: new Date().toISOString(),
    location: locName,
    mode: perfMode,
    fps: Number((perfStats.live.fps || 0).toFixed(2)),
    frameMs: Number((perfStats.live.frameMs || 0).toFixed(2)),
    dynamicBudget: getDynamicBudgetState(),
    renderer: { ...perfStats.renderer },
    live: { ...perfStats.live },
    spikes: spikeMetrics,
    lastLoad: perfStats.lastLoad ? { ...perfStats.lastLoad } : null,
    ...extra
  };
}

async function copyPerfSnapshotToClipboard(extra = {}) {
  const snapshot = capturePerfSnapshot(extra);
  const text = JSON.stringify(snapshot, null, 2);

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return snapshot;
  }
  throw new Error('Clipboard API unavailable in this browser context.');
}

function updatePerfPanel(force = false) {
  const panel = document.getElementById('perfPanel');
  if (!panel) return;

  const shouldShow = !!perfOverlayEnabled && !!appCtx.gameStarted;
  if (!shouldShow) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  const lastLoad = perfStats.lastLoad || {};
  const r = perfStats.renderer;
  const live = perfStats.live || {};
  const lod = live.lodVisible || {};
  const counts = live.worldCounts || {};
  const spikes = live.spikes || getPerfSpikeMetrics(false);
  const quality = live.quality || getDynamicBudgetState();

  const lines = [
  `MODE: ${String(perfMode).toUpperCase()}`,
  `FPS: ${(live.fps || 0).toFixed(1)} | FRAME: ${(live.frameMs || 0).toFixed(1)} ms`,
  `QUALITY: ${quality.auto ? 'AUTO' : 'LOCK'} ${String(quality.tier || 'balanced').toUpperCase()} | SCALE ${(quality.budgetScale || 1).toFixed(2)}`,
  `DRAW: ${formatPerfNumber(r.calls)} | TRI: ${formatPerfNumber(r.triangles)}`,
  `GEO: ${formatPerfNumber(r.geometries)} | TEX: ${formatPerfNumber(r.textures)} | PROG: ${formatPerfNumber(r.programs)}`,
  `LOAD: ${Number.isFinite(lastLoad.loadMs) ? `${lastLoad.loadMs} ms` : '--'}`,
  `FEATURES: R${counts.roads || 0} B${counts.buildings || 0} P${counts.poiMeshes || 0} L${counts.landuseMeshes || 0}`,
  `LOD: NEAR ${lod.near || 0} | MID ${lod.mid || 0}`,
  `SPIKES: >33 ${spikes.over33_3 || 0} | >50 ${spikes.over50 || 0} | MAX ${(spikes.maxFrameMs || 0).toFixed(1)} ms`,
  `TERRAIN RING: ${Number.isFinite(live.terrainRing) ? live.terrainRing : '--'} | SPEED ${Math.round(live.speedMph || 0)} mph`];


  if (force || panel.textContent !== lines.join('\n')) {
    panel.textContent = lines.join('\n');
  }
  if (typeof appCtx.positionTopOverlays === 'function') appCtx.positionTopOverlays();
}

setPerfMode(readStorage(PERF_STORAGE_MODE_KEY), { persist: false });
// Always start hidden so benchmark diagnostics are opt-in for every session.
setPerfOverlayEnabled(false, { persist: false });
writeStorage(PERF_STORAGE_OVERLAY_KEY, '0');
setPerfAutoQualityEnabled(readStorage(PERF_STORAGE_AUTO_QUALITY_KEY) !== '0', { persist: false });

exposeMutableGlobal('perfMode', () => perfMode, (value) => {
  setPerfMode(value, { persist: false });
});
exposeMutableGlobal('perfOverlayEnabled', () => perfOverlayEnabled, (value) => {
  setPerfOverlayEnabled(value, { persist: false });
});
exposeMutableGlobal('perfAutoQualityEnabled', () => perfAutoQualityEnabled, (value) => {
  setPerfAutoQualityEnabled(value, { persist: false });
});
exposeMutableGlobal('perfAutoQualityTier', () => perfAutoQualityTier, (value) => {
  setPerfAutoQualityTier(value, { reason: 'external' });
});

Object.assign(appCtx, {
  PERF_QUALITY_TIER_BALANCED,
  PERF_QUALITY_TIER_PERFORMANCE,
  PERF_QUALITY_TIER_QUALITY,
  PERF_MODE_BASELINE,
  PERF_MODE_RDT,
  capturePerfSnapshot,
  copyPerfSnapshotToClipboard,
  finishPerfLoad,
  getDynamicBudgetState,
  getPerfMode,
  getPerfAutoQualityEnabled,
  getPerfAutoQualityTier,
  getPerfSpikeMetrics,
  getPerfOverlayEnabled,
  mergePerfLiveStats,
  perfStats,
  recordPerfFrame,
  recordPerfRendererInfo,
  setPerfAutoQualityEnabled,
  setPerfAutoQualityTier,
  setPerfLiveStat,
  setPerfMode,
  setPerfOverlayEnabled,
  startPerfLoad,
  updatePerfPanel
});

export {
  PERF_QUALITY_TIER_BALANCED,
  PERF_QUALITY_TIER_PERFORMANCE,
  PERF_QUALITY_TIER_QUALITY,
  PERF_MODE_BASELINE,
  PERF_MODE_RDT,
  capturePerfSnapshot,
  copyPerfSnapshotToClipboard,
  finishPerfLoad,
  getDynamicBudgetState,
  getPerfMode,
  getPerfAutoQualityEnabled,
  getPerfAutoQualityTier,
  getPerfSpikeMetrics,
  getPerfOverlayEnabled,
  mergePerfLiveStats,
  perfAutoQualityEnabled,
  perfAutoQualityTier,
  perfMode,
  perfOverlayEnabled,
  perfStats,
  recordPerfFrame,
  recordPerfRendererInfo,
  setPerfAutoQualityEnabled,
  setPerfAutoQualityTier,
  setPerfLiveStat,
  setPerfMode,
  setPerfOverlayEnabled,
  startPerfLoad,
  updatePerfPanel };
