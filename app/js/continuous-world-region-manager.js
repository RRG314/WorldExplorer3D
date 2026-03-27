import { ctx as appCtx } from "./shared-context.js?v=55";

const MAX_TRANSITION_KEYS = 16;

const managerState = {
  enabled: true,
  sessionEpoch: 0,
  activeRegionKey: null,
  trackedRegions: new Map(),
  lastTransition: null,
  lastSessionReset: null,
  lastUpdateAt: 0
};

function cloneBandCounts() {
  return { near: 0, mid: 0, far: 0, total: 0 };
}

function limitedKeys(keys) {
  return (Array.isArray(keys) ? keys : []).slice(0, MAX_TRANSITION_KEYS);
}

function desiredRegionBandMap(regionRings) {
  const map = new Map();
  const addBand = (band, cells) => {
    (Array.isArray(cells) ? cells : []).forEach((cell) => {
      if (!cell?.key) return;
      map.set(cell.key, {
        key: cell.key,
        band,
        latIndex: Number(cell.latIndex || 0),
        lonIndex: Number(cell.lonIndex || 0)
      });
    });
  };
  addBand("far", regionRings?.far);
  addBand("mid", regionRings?.mid);
  addBand("near", regionRings?.near);
  return map;
}

function summarizeTrackedRegions() {
  const counts = cloneBandCounts();
  let staleTrackedRegions = 0;
  const activeKeys = [];
  const prefetchKeys = [];
  const retiringKeys = [];

  managerState.trackedRegions.forEach((entry) => {
    if (!entry) return;
    counts.total += 1;
    if (entry.band === "near") counts.near += 1;
    else if (entry.band === "mid") counts.mid += 1;
    else counts.far += 1;

    if (entry.sessionEpoch !== managerState.sessionEpoch) staleTrackedRegions += 1;
    if (entry.status === "active") activeKeys.push(entry.key);
    else if (entry.status === "prefetch") prefetchKeys.push(entry.key);
    else if (entry.status === "retiring") retiringKeys.push(entry.key);
  });

  return {
    trackedCounts: counts,
    activeKeys: limitedKeys(activeKeys),
    prefetchKeys: limitedKeys(prefetchKeys),
    retiringKeys: limitedKeys(retiringKeys),
    staleTrackedRegions
  };
}

function applyDesiredRegions(activeRegion, regionRings, reason = "update") {
  const desired = desiredRegionBandMap(regionRings);
  const previousActiveRegionKey = managerState.activeRegionKey;
  const entered = [];
  const retired = [];
  const promoted = [];
  const demoted = [];

  for (const [key, existing] of managerState.trackedRegions.entries()) {
    const next = desired.get(key);
    if (!next) {
      retired.push(key);
      managerState.trackedRegions.delete(key);
      continue;
    }
    const prevBand = existing.band;
    existing.band = next.band;
    existing.latIndex = next.latIndex;
    existing.lonIndex = next.lonIndex;
    existing.status = next.band === "near" ? "active" : "prefetch";
    existing.lastSeenAt = performance.now();
    existing.sessionEpoch = managerState.sessionEpoch;
    if (prevBand !== next.band) {
      if (prevBand === "far" && (next.band === "mid" || next.band === "near")) promoted.push(key);
      else if (prevBand === "mid" && next.band === "near") promoted.push(key);
      else demoted.push(key);
    }
  }

  for (const [key, next] of desired.entries()) {
    if (managerState.trackedRegions.has(key)) continue;
    managerState.trackedRegions.set(key, {
      key,
      band: next.band,
      latIndex: next.latIndex,
      lonIndex: next.lonIndex,
      sessionEpoch: managerState.sessionEpoch,
      status: next.band === "near" ? "active" : "prefetch",
      firstSeenAt: performance.now(),
      lastSeenAt: performance.now()
    });
    entered.push(key);
  }

  managerState.activeRegionKey = activeRegion?.key || null;
  managerState.lastUpdateAt = performance.now();

  const summary = summarizeTrackedRegions();
  managerState.lastTransition = {
    reason,
    sessionEpoch: managerState.sessionEpoch,
    activeRegionChanged: previousActiveRegionKey !== managerState.activeRegionKey,
    previousActiveRegionKey,
    nextActiveRegionKey: managerState.activeRegionKey,
    enteredCount: entered.length,
    retiredCount: retired.length,
    promotedCount: promoted.length,
    demotedCount: demoted.length,
    entered: limitedKeys(entered),
    retired: limitedKeys(retired),
    promoted: limitedKeys(promoted),
    demoted: limitedKeys(demoted),
    trackedCounts: summary.trackedCounts
  };

  return getContinuousWorldRegionManagerSnapshot();
}

function resetContinuousWorldRegions({ sessionEpoch = 0, activeRegion = null, regionRings = null, reason = "session_reset" } = {}) {
  managerState.sessionEpoch = Number.isFinite(sessionEpoch) ? sessionEpoch : 0;
  managerState.trackedRegions.clear();
  managerState.activeRegionKey = null;
  managerState.lastTransition = null;
  managerState.lastSessionReset = {
    reason,
    sessionEpoch: managerState.sessionEpoch,
    activeRegionKey: activeRegion?.key || null,
    at: performance.now()
  };
  managerState.lastUpdateAt = 0;
  if (!managerState.enabled) return getContinuousWorldRegionManagerSnapshot();
  return applyDesiredRegions(activeRegion, regionRings, reason);
}

function updateContinuousWorldRegions({ sessionEpoch = null, activeRegion = null, regionRings = null, reason = "runtime_update" } = {}) {
  if (!managerState.enabled) return getContinuousWorldRegionManagerSnapshot();
  const nextEpoch = Number.isFinite(sessionEpoch) ? sessionEpoch : managerState.sessionEpoch;
  if (nextEpoch !== managerState.sessionEpoch) {
    return resetContinuousWorldRegions({ sessionEpoch: nextEpoch, activeRegion, regionRings, reason: `${reason}:epoch_change` });
  }
  return applyDesiredRegions(activeRegion, regionRings, reason);
}

function configureContinuousWorldRegionManager(config = {}) {
  if (!config || typeof config !== "object") return getContinuousWorldRegionManagerSnapshot();
  if (typeof config.enabled === "boolean") managerState.enabled = config.enabled;
  return getContinuousWorldRegionManagerSnapshot();
}

function getContinuousWorldRegionManagerSnapshot() {
  const summary = summarizeTrackedRegions();
  return {
    enabled: managerState.enabled,
    sessionEpoch: managerState.sessionEpoch,
    activeRegionKey: managerState.activeRegionKey,
    trackedCounts: summary.trackedCounts,
    staleTrackedRegions: summary.staleTrackedRegions,
    activeKeys: summary.activeKeys,
    prefetchKeys: summary.prefetchKeys,
    retiringKeys: summary.retiringKeys,
    lastTransition: managerState.lastTransition ? { ...managerState.lastTransition } : null,
    lastSessionReset: managerState.lastSessionReset ? { ...managerState.lastSessionReset } : null,
    lastUpdateAt: managerState.lastUpdateAt
  };
}

Object.assign(appCtx, {
  configureContinuousWorldRegionManager,
  getContinuousWorldRegionManagerSnapshot,
  resetContinuousWorldRegions,
  updateContinuousWorldRegions
});

export {
  configureContinuousWorldRegionManager,
  getContinuousWorldRegionManagerSnapshot,
  resetContinuousWorldRegions,
  updateContinuousWorldRegions
};
