import { ctx as appCtx } from "./shared-context.js?v=55";
import { roadBehavesGradeSeparated } from "./structure-semantics.js?v=26";

const DEFAULT_REGION_DEGREES = 0.02;
const MAX_SAMPLE_KEYS = 12;

const managerState = {
  enabled: true,
  sessionEpoch: 0,
  activeRegionKey: null,
  regions: new Map(),
  lastReset: null,
  lastRebuildAt: 0,
  lastRebuildReason: null,
  lastSignature: ""
};

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function regionDegrees(runtimeSnapshot) {
  return Math.max(
    0.0001,
    Number(runtimeSnapshot?.regionConfig?.degrees) || DEFAULT_REGION_DEGREES
  );
}

function regionKeyFromLatLon(lat, lon, sizeDegrees = DEFAULT_REGION_DEGREES) {
  const size = Math.max(0.0001, Number(sizeDegrees) || DEFAULT_REGION_DEGREES);
  return `${Math.floor(lat / size)}:${Math.floor(lon / size)}`;
}

function regionKeyFromWorldPoint(x, z, sizeDegrees = DEFAULT_REGION_DEGREES) {
  if (typeof appCtx.worldToLatLon !== "function") return null;
  const geo = appCtx.worldToLatLon(x, z);
  if (!Number.isFinite(geo?.lat) || !Number.isFinite(geo?.lon)) return null;
  return regionKeyFromLatLon(geo.lat, geo.lon, sizeDegrees);
}

function currentRuntimeSnapshot(runtimeSnapshot = null) {
  if (runtimeSnapshot) return runtimeSnapshot;
  if (typeof appCtx.getContinuousWorldRuntimeSnapshot === "function") {
    return appCtx.getContinuousWorldRuntimeSnapshot();
  }
  return null;
}

function buildContinuousWorldRegionKeysFromPoints(points = [], runtimeSnapshot = null, bounds = null) {
  const snapshot = currentRuntimeSnapshot(runtimeSnapshot);
  const regionSize = regionDegrees(snapshot);
  const keys = new Set();
  const visit = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const key = regionKeyFromWorldPoint(x, z, regionSize);
    if (key) keys.add(key);
  };

  (Array.isArray(points) ? points : []).forEach((point) => {
    visit(Number(point?.x), Number(point?.z));
  });

  if (!keys.size && bounds) {
    const minX = Number(bounds?.minX);
    const maxX = Number(bounds?.maxX);
    const minZ = Number(bounds?.minZ);
    const maxZ = Number(bounds?.maxZ);
    if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ)) {
      const midX = (minX + maxX) * 0.5;
      const midZ = (minZ + maxZ) * 0.5;
      visit(minX, minZ);
      visit(maxX, minZ);
      visit(maxX, maxZ);
      visit(minX, maxZ);
      visit(midX, midZ);
    }
  }

  return Array.from(keys);
}

function buildContinuousWorldRegionKeysFromFeature(feature = null, runtimeSnapshot = null) {
  if (!feature) return [];
  const points = featurePoints(feature);
  return buildContinuousWorldRegionKeysFromPoints(points, runtimeSnapshot, feature?.bounds || feature);
}

function targetContinuousWorldRegionKeys(target) {
  if (!target || typeof target !== "object") return [];
  const direct = Array.isArray(target.continuousWorldRegionKeys) ? target.continuousWorldRegionKeys : null;
  if (direct) return direct;
  const data = target.userData;
  return Array.isArray(data?.continuousWorldRegionKeys) ? data.continuousWorldRegionKeys : [];
}

function mergeContinuousWorldRegionKeysFromTargets(targets = []) {
  const keys = new Set();
  (Array.isArray(targets) ? targets : []).forEach((target) => {
    const targetKeys = targetContinuousWorldRegionKeys(target);
    targetKeys.forEach((key) => keys.add(key));
  });
  return Array.from(keys);
}

function assignContinuousWorldRegionKeysToTarget(target, options = {}) {
  if (!target || typeof target !== "object") return [];
  const {
    feature = null,
    points = null,
    bounds = null,
    runtimeSnapshot = null,
    family = null
  } = options || {};
  const slot = target.userData && typeof target.userData === "object" ? target.userData : target;
  const keys = feature ?
    buildContinuousWorldRegionKeysFromFeature(feature, runtimeSnapshot) :
    buildContinuousWorldRegionKeysFromPoints(points, runtimeSnapshot, bounds);
  slot.continuousWorldRegionKeys = keys;
  slot.continuousWorldRegionCount = keys.length;
  if (family) slot.continuousWorldFeatureFamily = family;
  return keys;
}

function continuousWorldTrackedRegionKeySet(runtimeSnapshot = null) {
  const snapshot = currentRuntimeSnapshot(runtimeSnapshot);
  const keys = new Set();
  if (snapshot?.activeRegion?.key) keys.add(snapshot.activeRegion.key);
  ["near", "mid", "far"].forEach((band) => {
    const cells = snapshot?.activeRegionRings?.[band];
    (Array.isArray(cells) ? cells : []).forEach((cell) => {
      if (cell?.key) keys.add(cell.key);
    });
  });
  return keys;
}

function targetIntersectsContinuousWorldTrackedRegions(target, runtimeSnapshot = null) {
  const targetKeys = targetContinuousWorldRegionKeys(target);
  if (!targetKeys.length) return true;
  const tracked = continuousWorldTrackedRegionKeySet(runtimeSnapshot);
  if (!tracked.size) return true;
  return targetKeys.some((key) => tracked.has(key));
}

function featurePoints(feature) {
  if (Array.isArray(feature?.pts) && feature.pts.length > 0) {
    const pts = feature.pts;
    if (pts.length <= 12) return pts;
    const step = Math.max(1, Math.floor(pts.length / 10));
    const sampled = [];
    for (let i = 0; i < pts.length; i += step) sampled.push(pts[i]);
    if (pts.length > 1) sampled.push(pts[pts.length - 1]);
    return sampled;
  }
  const minX = Number(feature?.minX);
  const maxX = Number(feature?.maxX);
  const minZ = Number(feature?.minZ);
  const maxZ = Number(feature?.maxZ);
  if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ)) {
    const midX = (minX + maxX) * 0.5;
    const midZ = (minZ + maxZ) * 0.5;
    return [
      { x: minX, z: minZ },
      { x: maxX, z: minZ },
      { x: maxX, z: maxZ },
      { x: minX, z: maxZ },
      { x: midX, z: midZ }
    ];
  }
  const centerX = Number(feature?.centerX);
  const centerZ = Number(feature?.centerZ);
  if (Number.isFinite(centerX) && Number.isFinite(centerZ)) {
    return [{ x: centerX, z: centerZ }];
  }
  return [];
}

function bandPriority(band = "outside") {
  if (band === "near") return 3;
  if (band === "mid") return 2;
  if (band === "far") return 1;
  return 0;
}

function buildRegionBandLookup(runtimeSnapshot) {
  const map = new Map();
  const add = (band, cells) => {
    (Array.isArray(cells) ? cells : []).forEach((cell) => {
      if (!cell?.key) return;
      const existing = map.get(cell.key);
      if (!existing || bandPriority(band) > bandPriority(existing)) {
        map.set(cell.key, band);
      }
    });
  };
  add("far", runtimeSnapshot?.activeRegionRings?.far);
  add("mid", runtimeSnapshot?.activeRegionRings?.mid);
  add("near", runtimeSnapshot?.activeRegionRings?.near);
  return map;
}

function createFamilyState() {
  return {
    count: 0,
    crossRegionCount: 0,
    roadSpanCount: 0,
    connectorCount: 0,
    areaCount: 0,
    waterwayCount: 0
  };
}

function createRegionEntry(key, band) {
  return {
    key,
    band,
    buildings: createFamilyState(),
    structures: createFamilyState(),
    water: createFamilyState()
  };
}

function loadedBuildings() {
  return Array.isArray(appCtx.buildings)
    ? appCtx.buildings
        .filter((building) => building && !building.collisionDisabled)
        .map((building) => ({ family: "buildings", feature: building, subtype: "building" }))
    : [];
}

function loadedStructures() {
  const roads = Array.isArray(appCtx.roads)
    ? appCtx.roads
        .filter((road) => road && roadBehavesGradeSeparated(road))
        .map((road) => ({ family: "structures", feature: road, subtype: "roadSpan" }))
    : [];
  const connectors = Array.isArray(appCtx.linearFeatures)
    ? appCtx.linearFeatures
        .filter((feature) => feature?.structureSemantics?.gradeSeparated)
        .map((feature) => ({ family: "structures", feature, subtype: "connector" }))
    : [];
  return [...roads, ...connectors];
}

function loadedWater() {
  const areas = Array.isArray(appCtx.waterAreas)
    ? appCtx.waterAreas.map((feature) => ({ family: "water", feature, subtype: "area" }))
    : [];
  const waterways = Array.isArray(appCtx.waterways)
    ? appCtx.waterways.map((feature) => ({ family: "water", feature, subtype: "waterway" }))
    : [];
  return [...areas, ...waterways];
}

function assignFeatureToRegions(entry, runtimeSnapshot, bandLookup, regionMap) {
  const points = featurePoints(entry?.feature);
  if (!points.length) return;
  const regionSize = regionDegrees(runtimeSnapshot);
  const keys = new Set();
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const key = regionKeyFromWorldPoint(point.x, point.z, regionSize);
    if (key) keys.add(key);
  }
  if (!keys.size) return;

  keys.forEach((key) => {
    let region = regionMap.get(key);
    if (!region) {
      region = createRegionEntry(key, bandLookup.get(key) || "outside");
      regionMap.set(key, region);
    } else if (bandPriority(bandLookup.get(key)) > bandPriority(region.band)) {
      region.band = bandLookup.get(key);
    }

    const familyState = region[entry.family];
    familyState.count += 1;
    if (keys.size > 1) familyState.crossRegionCount += 1;
    if (entry.family === "structures") {
      if (entry.subtype === "roadSpan") familyState.roadSpanCount += 1;
      else if (entry.subtype === "connector") familyState.connectorCount += 1;
    } else if (entry.family === "water") {
      if (entry.subtype === "area") familyState.areaCount += 1;
      else if (entry.subtype === "waterway") familyState.waterwayCount += 1;
    }
  });
}

function buildSignature(runtimeSnapshot) {
  return [
    runtimeSnapshot?.sessionEpoch || 0,
    runtimeSnapshot?.activeRegion?.key || "none",
    Array.isArray(appCtx.buildings) ? appCtx.buildings.length : 0,
    Array.isArray(appCtx.roads) ? appCtx.roads.length : 0,
    Array.isArray(appCtx.linearFeatures) ? appCtx.linearFeatures.length : 0,
    Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas.length : 0,
    Array.isArray(appCtx.waterways) ? appCtx.waterways.length : 0,
    Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes.length : 0,
    Array.isArray(appCtx.structureVisualMeshes) ? appCtx.structureVisualMeshes.length : 0,
    Array.isArray(appCtx.waterWaveVisuals) ? appCtx.waterWaveVisuals.length : 0
  ].join("|");
}

function resetContinuousWorldFeatureRegions({ runtimeSnapshot = null, reason = "session_reset" } = {}) {
  managerState.sessionEpoch = Number(runtimeSnapshot?.sessionEpoch || 0);
  managerState.activeRegionKey = runtimeSnapshot?.activeRegion?.key || null;
  managerState.regions.clear();
  managerState.lastSignature = "";
  managerState.lastReset = {
    reason,
    sessionEpoch: managerState.sessionEpoch,
    activeRegionKey: managerState.activeRegionKey,
    at: performance.now()
  };
  managerState.lastRebuildAt = 0;
  managerState.lastRebuildReason = null;
  return getContinuousWorldFeatureRegionSnapshot();
}

function updateContinuousWorldFeatureRegions({ runtimeSnapshot = null, reason = "runtime_update" } = {}) {
  if (!managerState.enabled || !runtimeSnapshot) return getContinuousWorldFeatureRegionSnapshot();
  const nextEpoch = Number(runtimeSnapshot?.sessionEpoch || 0);
  if (nextEpoch !== managerState.sessionEpoch) {
    resetContinuousWorldFeatureRegions({ runtimeSnapshot, reason: `${reason}:epoch_change` });
  }
  const signature = buildSignature(runtimeSnapshot);
  managerState.activeRegionKey = runtimeSnapshot?.activeRegion?.key || null;
  if (signature === managerState.lastSignature && managerState.regions.size > 0) {
    return getContinuousWorldFeatureRegionSnapshot();
  }

  const bandLookup = buildRegionBandLookup(runtimeSnapshot);
  const regionMap = new Map();
  const entries = [
    ...loadedBuildings(),
    ...loadedStructures(),
    ...loadedWater()
  ];
  for (let i = 0; i < entries.length; i++) {
    assignFeatureToRegions(entries[i], runtimeSnapshot, bandLookup, regionMap);
  }

  managerState.regions = regionMap;
  managerState.lastSignature = signature;
  managerState.lastRebuildAt = performance.now();
  managerState.lastRebuildReason = reason;
  return getContinuousWorldFeatureRegionSnapshot();
}

function configureContinuousWorldFeatureRegionManager(config = {}) {
  if (!config || typeof config !== "object") return getContinuousWorldFeatureRegionSnapshot();
  if (typeof config.enabled === "boolean") managerState.enabled = config.enabled;
  return getContinuousWorldFeatureRegionSnapshot();
}

function summarizeRegions() {
  const byBand = {
    near: { regions: 0, buildings: 0, structures: 0, water: 0 },
    mid: { regions: 0, buildings: 0, structures: 0, water: 0 },
    far: { regions: 0, buildings: 0, structures: 0, water: 0 },
    outside: { regions: 0, buildings: 0, structures: 0, water: 0 }
  };
  const totals = {
    regionsWithAnyFeatures: 0,
    buildingRegions: 0,
    structureRegions: 0,
    waterRegions: 0,
    buildings: 0,
    structures: 0,
    water: 0
  };
  const sample = {
    near: [],
    buildingRegions: [],
    structureRegions: [],
    waterRegions: []
  };

  managerState.regions.forEach((region) => {
    const band = region.band || "outside";
    byBand[band].regions += 1;
    totals.regionsWithAnyFeatures += 1;

    const buildingCount = Number(region.buildings.count || 0);
    const structureCount = Number(region.structures.count || 0);
    const waterCount = Number(region.water.count || 0);

    if (buildingCount > 0) {
      byBand[band].buildings += 1;
      totals.buildingRegions += 1;
      totals.buildings += buildingCount;
      if (sample.buildingRegions.length < MAX_SAMPLE_KEYS) sample.buildingRegions.push(region.key);
    }
    if (structureCount > 0) {
      byBand[band].structures += 1;
      totals.structureRegions += 1;
      totals.structures += structureCount;
      if (sample.structureRegions.length < MAX_SAMPLE_KEYS) sample.structureRegions.push(region.key);
    }
    if (waterCount > 0) {
      byBand[band].water += 1;
      totals.waterRegions += 1;
      totals.water += waterCount;
      if (sample.waterRegions.length < MAX_SAMPLE_KEYS) sample.waterRegions.push(region.key);
    }
    if (band === "near" && sample.near.length < MAX_SAMPLE_KEYS) {
      sample.near.push(region.key);
    }
  });

  return { byBand, totals, sample };
}

function cloneRegion(region) {
  if (!region) return null;
  return {
    key: region.key,
    band: region.band,
    buildings: { ...region.buildings },
    structures: { ...region.structures },
    water: { ...region.water }
  };
}

function getContinuousWorldFeatureRegionSnapshot() {
  const { byBand, totals, sample } = summarizeRegions();
  const activeRegion = cloneRegion(managerState.regions.get(managerState.activeRegionKey));
  return {
    enabled: managerState.enabled,
    sessionEpoch: managerState.sessionEpoch,
    activeRegionKey: managerState.activeRegionKey,
    regionCount: managerState.regions.size,
    byBand,
    totals,
    sampleKeys: sample,
    activeRegion,
    lastReset: managerState.lastReset ? { ...managerState.lastReset } : null,
    lastRebuildAt: managerState.lastRebuildAt,
    lastRebuildReason: managerState.lastRebuildReason
  };
}

Object.assign(appCtx, {
  configureContinuousWorldFeatureRegionManager,
  resetContinuousWorldFeatureRegions,
  updateContinuousWorldFeatureRegions,
  getContinuousWorldFeatureRegionSnapshot,
  continuousWorldTrackedRegionKeySet,
  targetIntersectsContinuousWorldTrackedRegions
});

export {
  assignContinuousWorldRegionKeysToTarget,
  buildContinuousWorldRegionKeysFromFeature,
  buildContinuousWorldRegionKeysFromPoints,
  configureContinuousWorldFeatureRegionManager,
  continuousWorldTrackedRegionKeySet,
  resetContinuousWorldFeatureRegions,
  mergeContinuousWorldRegionKeysFromTargets,
  targetIntersectsContinuousWorldTrackedRegions,
  updateContinuousWorldFeatureRegions,
  getContinuousWorldFeatureRegionSnapshot
};
