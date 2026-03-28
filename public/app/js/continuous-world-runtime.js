import { ctx as appCtx } from "./shared-context.js?v=55";
import {
  configureContinuousWorldRegionManager,
  getContinuousWorldRegionManagerSnapshot,
  resetContinuousWorldRegions,
  updateContinuousWorldRegions
} from "./continuous-world-region-manager.js?v=2";
import {
  configureContinuousWorldFeatureRegionManager,
  getContinuousWorldFeatureRegionSnapshot,
  resetContinuousWorldFeatureRegions,
  updateContinuousWorldFeatureRegions
} from "./continuous-world-feature-manager.js?v=2";

const DEFAULT_REBASE_DISTANCE = 800;
const DEFAULT_NEAR_RADIUS = 1;
const DEFAULT_MID_RADIUS = 2;
const DEFAULT_FAR_RADIUS = 4;
const DEFAULT_REGION_DEGREES = 0.02;

const state = {
  enabled: true,
  sessionEpoch: 0,
  initializedAt: null,
  origin: {
    lat: 0,
    lon: 0,
    x: 0,
    z: 0
  },
  actorGlobal: {
    lat: 0,
    lon: 0,
    x: 0,
    y: 0,
    z: 0,
    mode: "drive"
  },
  localOffset: {
    x: 0,
    z: 0,
    distanceFromOrigin: 0
  },
  regionConfig: {
    degrees: DEFAULT_REGION_DEGREES,
    nearRadius: DEFAULT_NEAR_RADIUS,
    midRadius: DEFAULT_MID_RADIUS,
    farRadius: DEFAULT_FAR_RADIUS
  },
  activeRegion: null,
  activeRegionRings: {
    near: [],
    mid: [],
    far: []
  },
  rebase: {
    recommended: false,
    reason: null,
    threshold: DEFAULT_REBASE_DISTANCE
  },
  lastUpdateAt: 0,
  lastTopologyUpdateAt: 0,
  lastTopologyActor: {
    x: 0,
    z: 0,
    mode: "drive",
    regionKey: null
  }
};

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function getActorReference() {
  if (appCtx.oceanMode?.active) {
    const ocean = typeof appCtx.getOceanModeDebugState === "function" ? appCtx.getOceanModeDebugState() : null;
    return {
      mode: "ocean",
      x: finite(ocean?.position?.x),
      y: finite(ocean?.position?.y),
      z: finite(ocean?.position?.z)
    };
  }
  if (appCtx.boatMode?.active) {
    return {
      mode: "boat",
      x: finite(appCtx.boat?.x),
      y: finite(appCtx.boat?.y),
      z: finite(appCtx.boat?.z)
    };
  }
  if (appCtx.droneMode) {
    return {
      mode: "drone",
      x: finite(appCtx.drone?.x),
      y: finite(appCtx.drone?.y),
      z: finite(appCtx.drone?.z)
    };
  }
  if (appCtx.Walk?.state?.mode === "walk" && appCtx.Walk?.state?.walker) {
    return {
      mode: "walk",
      x: finite(appCtx.Walk.state.walker.x),
      y: finite(appCtx.Walk.state.walker.y),
      z: finite(appCtx.Walk.state.walker.z)
    };
  }
  return {
    mode: "drive",
    x: finite(appCtx.car?.x),
    y: finite(appCtx.car?.y),
    z: finite(appCtx.car?.z)
  };
}

function regionKeyFromLatLon(lat, lon, sizeDegrees = DEFAULT_REGION_DEGREES) {
  const size = Math.max(0.0001, Number(sizeDegrees) || DEFAULT_REGION_DEGREES);
  const latIndex = Math.floor(lat / size);
  const lonIndex = Math.floor(lon / size);
  return `${latIndex}:${lonIndex}`;
}

function regionCellFromLatLon(lat, lon, sizeDegrees = DEFAULT_REGION_DEGREES) {
  const size = Math.max(0.0001, Number(sizeDegrees) || DEFAULT_REGION_DEGREES);
  return {
    sizeDegrees: size,
    latIndex: Math.floor(lat / size),
    lonIndex: Math.floor(lon / size)
  };
}

function buildRegionRing(centerCell, radius) {
  const cells = [];
  const r = Math.max(0, Number(radius) || 0);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      cells.push({
        latIndex: centerCell.latIndex + dy,
        lonIndex: centerCell.lonIndex + dx,
        key: `${centerCell.latIndex + dy}:${centerCell.lonIndex + dx}`
      });
    }
  }
  return cells;
}

function subtractCells(primary, exclusion) {
  const excluded = new Set((Array.isArray(exclusion) ? exclusion : []).map((cell) => cell.key));
  return (Array.isArray(primary) ? primary : []).filter((cell) => !excluded.has(cell.key));
}

function topologyRefreshPolicy(mode = "drive") {
  if (mode === "walk") return { distance: 10, intervalMs: 260 };
  if (mode === "drone") return { distance: 22, intervalMs: 180 };
  if (mode === "boat" || mode === "ocean") return { distance: 28, intervalMs: 200 };
  return { distance: 16, intervalMs: 140 };
}

function resetContinuousWorldSession(location = null, reason = "location_load") {
  const lat = finite(location?.lat, finite(appCtx.LOC?.lat));
  const lon = finite(location?.lon, finite(appCtx.LOC?.lon));
  state.sessionEpoch += 1;
  state.initializedAt = new Date().toISOString();
  state.origin.lat = lat;
  state.origin.lon = lon;
  state.origin.x = 0;
  state.origin.z = 0;
  state.actorGlobal.lat = lat;
  state.actorGlobal.lon = lon;
  state.actorGlobal.x = 0;
  state.actorGlobal.y = 0;
  state.actorGlobal.z = 0;
  state.localOffset.x = 0;
  state.localOffset.z = 0;
  state.localOffset.distanceFromOrigin = 0;
  state.activeRegion = {
    key: regionKeyFromLatLon(lat, lon, state.regionConfig.degrees),
    lat,
    lon
  };
  const cell = regionCellFromLatLon(lat, lon, state.regionConfig.degrees);
  const near = buildRegionRing(cell, state.regionConfig.nearRadius);
  const mid = subtractCells(buildRegionRing(cell, state.regionConfig.midRadius), near);
  const far = subtractCells(buildRegionRing(cell, state.regionConfig.farRadius), [...near, ...mid]);
  state.activeRegionRings = { near, mid, far };
  resetContinuousWorldRegions({
    sessionEpoch: state.sessionEpoch,
    activeRegion: state.activeRegion,
    regionRings: state.activeRegionRings,
    reason
  });
  resetContinuousWorldFeatureRegions({
    runtimeSnapshot: getContinuousWorldRuntimeSnapshot(),
    reason
  });
  state.rebase.recommended = false;
  state.rebase.reason = reason;
  state.lastUpdateAt = performance.now();
  state.lastTopologyUpdateAt = state.lastUpdateAt;
  state.lastTopologyActor.x = 0;
  state.lastTopologyActor.z = 0;
  state.lastTopologyActor.mode = "drive";
  state.lastTopologyActor.regionKey = state.activeRegion?.key || null;
  return getContinuousWorldRuntimeSnapshot();
}

function updateContinuousWorldRuntime() {
  if (!state.enabled) return getContinuousWorldRuntimeSnapshot();
  let actor = getActorReference();
  let geo = typeof appCtx.worldToLatLon === "function" ? appCtx.worldToLatLon(actor.x, actor.z) : null;
  let lat = finite(geo?.lat, state.actorGlobal.lat);
  let lon = finite(geo?.lon, state.actorGlobal.lon);
  let dist = Math.hypot(actor.x - state.origin.x, actor.z - state.origin.z);
  const shouldRebase = dist >= state.rebase.threshold;

  if (shouldRebase && typeof appCtx.applyContinuousWorldRebase === "function") {
    const rebaseResult = appCtx.applyContinuousWorldRebase(
      { lat, lon },
      {
        actorX: actor.x,
        actorZ: actor.z,
        mode: actor.mode,
        reason: "distance_from_origin"
      }
    );
    if (rebaseResult?.applied) {
      actor = getActorReference();
      geo = typeof appCtx.worldToLatLon === "function" ? appCtx.worldToLatLon(actor.x, actor.z) : geo;
      lat = finite(geo?.lat, lat);
      lon = finite(geo?.lon, lon);
      state.origin.lat = lat;
      state.origin.lon = lon;
      state.origin.x = 0;
      state.origin.z = 0;
      dist = Math.hypot(actor.x - state.origin.x, actor.z - state.origin.z);
    }
  }

  state.actorGlobal = {
    mode: actor.mode,
    lat,
    lon,
    x: actor.x,
    y: actor.y,
    z: actor.z
  };
  state.localOffset = {
    x: actor.x - state.origin.x,
    z: actor.z - state.origin.z,
    distanceFromOrigin: dist
  };
  state.rebase.recommended = dist >= state.rebase.threshold;
  state.rebase.reason = state.rebase.recommended ? "distance_from_origin" : null;
  const now = performance.now();
  const cell = regionCellFromLatLon(lat, lon, state.regionConfig.degrees);
  const regionKey = `${cell.latIndex}:${cell.lonIndex}`;
  const topologyPolicy = topologyRefreshPolicy(actor.mode);
  const topologyMove = Math.hypot(
    actor.x - finite(state.lastTopologyActor.x),
    actor.z - finite(state.lastTopologyActor.z)
  );
  const shouldRefreshTopology =
    !state.activeRegion ||
    state.activeRegion.key !== regionKey ||
    state.lastTopologyActor.mode !== actor.mode ||
    topologyMove >= topologyPolicy.distance ||
    (now - finite(state.lastTopologyUpdateAt, 0)) >= topologyPolicy.intervalMs;
  if (!shouldRefreshTopology) {
    state.lastUpdateAt = now;
    return getContinuousWorldRuntimeSnapshot();
  }
  const near = buildRegionRing(cell, state.regionConfig.nearRadius);
  const mid = subtractCells(buildRegionRing(cell, state.regionConfig.midRadius), near);
  const far = subtractCells(buildRegionRing(cell, state.regionConfig.farRadius), [...near, ...mid]);
  state.activeRegion = {
    key: regionKey,
    lat,
    lon
  };
  state.activeRegionRings = { near, mid, far };
  updateContinuousWorldRegions({
    sessionEpoch: state.sessionEpoch,
    activeRegion: state.activeRegion,
    regionRings: state.activeRegionRings,
    reason: "runtime_update"
  });
  updateContinuousWorldFeatureRegions({
    runtimeSnapshot: getContinuousWorldRuntimeSnapshot(),
    reason: "runtime_update"
  });
  state.lastTopologyUpdateAt = now;
  state.lastTopologyActor.x = actor.x;
  state.lastTopologyActor.z = actor.z;
  state.lastTopologyActor.mode = actor.mode;
  state.lastTopologyActor.regionKey = regionKey;
  state.lastUpdateAt = now;
  return getContinuousWorldRuntimeSnapshot();
}

function configureContinuousWorldRuntime(config = {}) {
  if (!config || typeof config !== "object") return getContinuousWorldRuntimeSnapshot();
  if (typeof config.enabled === "boolean") state.enabled = config.enabled;
  if (typeof config.regionManagerEnabled === "boolean") {
    configureContinuousWorldRegionManager({ enabled: config.regionManagerEnabled });
  }
  if (typeof config.featureRegionManagerEnabled === "boolean") {
    configureContinuousWorldFeatureRegionManager({ enabled: config.featureRegionManagerEnabled });
  }
  if (Number.isFinite(config.regionDegrees) && config.regionDegrees > 0) {
    state.regionConfig.degrees = config.regionDegrees;
  }
  if (Number.isFinite(config.nearRadius) && config.nearRadius >= 0) {
    state.regionConfig.nearRadius = Math.floor(config.nearRadius);
  }
  if (Number.isFinite(config.midRadius) && config.midRadius >= state.regionConfig.nearRadius) {
    state.regionConfig.midRadius = Math.floor(config.midRadius);
  }
  if (Number.isFinite(config.farRadius) && config.farRadius >= state.regionConfig.midRadius) {
    state.regionConfig.farRadius = Math.floor(config.farRadius);
  }
  if (Number.isFinite(config.rebaseDistance) && config.rebaseDistance > 0) {
    state.rebase.threshold = config.rebaseDistance;
  }
  return getContinuousWorldRuntimeSnapshot();
}

function getContinuousWorldRuntimeSnapshot() {
  return {
    enabled: state.enabled,
    sessionEpoch: state.sessionEpoch,
    initializedAt: state.initializedAt,
    origin: { ...state.origin },
    actorGlobal: { ...state.actorGlobal },
    localOffset: { ...state.localOffset },
    regionConfig: { ...state.regionConfig },
    activeRegion: state.activeRegion ? { ...state.activeRegion } : null,
    activeRegionRings: {
      near: state.activeRegionRings.near.slice(),
      mid: state.activeRegionRings.mid.slice(),
      far: state.activeRegionRings.far.slice()
    },
    regionManager: getContinuousWorldRegionManagerSnapshot(),
    featureRegions: getContinuousWorldFeatureRegionSnapshot(),
    rebase: { ...state.rebase },
    lastUpdateAt: state.lastUpdateAt
  };
}

Object.assign(appCtx, {
  configureContinuousWorldRuntime,
  getContinuousWorldRuntimeSnapshot,
  resetContinuousWorldSession,
  updateContinuousWorldRuntime
});

export {
  configureContinuousWorldRuntime,
  getContinuousWorldRuntimeSnapshot,
  resetContinuousWorldSession,
  updateContinuousWorldRuntime
};
