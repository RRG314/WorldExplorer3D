import { ctx as appCtx } from "./shared-context.js?v=55";
import { roadBehavesGradeSeparated } from "./structure-semantics.js?v=26";

const DEFAULT_REGION_DEGREES = 0.02;
const BUILDING_NEARBY_RADIUS = 220;
const STRUCTURE_NEARBY_RADIUS = 320;
const WATER_NEARBY_RADIUS = 420;
const MAX_SAMPLE_KEYS = 8;

const snapshotCache = {
  signature: "",
  snapshot: null
};

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function currentActorPosition() {
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
  if (appCtx.Walk?.state?.mode === "walk") {
    return {
      mode: "walk",
      x: finite(appCtx.Walk?.state?.walker?.x),
      y: finite(appCtx.Walk?.state?.walker?.y),
      z: finite(appCtx.Walk?.state?.walker?.z)
    };
  }
  return {
    mode: "drive",
    x: finite(appCtx.car?.x),
    y: finite(appCtx.car?.y),
    z: finite(appCtx.car?.z)
  };
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

function summarizeFeatureCollection(entries, options) {
  const actor = options?.actor || { x: 0, z: 0 };
  const regionSize = regionDegrees(options?.runtimeSnapshot);
  const bandLookup = options?.bandLookup || new Map();
  const nearbyRadius = Math.max(0, Number(options?.nearbyRadius) || 0);
  const keyExamples = new Set();
  const uniqueRegionKeys = new Set();
  const bands = { near: 0, mid: 0, far: 0, outside: 0 };

  let assigned = 0;
  let unassigned = 0;
  let crossRegion = 0;
  let nearbyCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const points = featurePoints(entry);
    if (!points.length) {
      unassigned++;
      continue;
    }

    const keys = new Set();
    for (let j = 0; j < points.length; j++) {
      const point = points[j];
      const key = regionKeyFromWorldPoint(point.x, point.z, regionSize);
      if (!key) continue;
      keys.add(key);
      uniqueRegionKeys.add(key);
      if (keyExamples.size < MAX_SAMPLE_KEYS) keyExamples.add(key);
    }

    if (!keys.size) {
      unassigned++;
      continue;
    }
    assigned++;
    if (keys.size > 1) crossRegion++;

    let band = "outside";
    keys.forEach((key) => {
      const candidate = bandLookup.get(key);
      if (bandPriority(candidate) > bandPriority(band)) band = candidate;
    });
    bands[band] += 1;

    if (nearbyRadius > 0) {
      let nearest = Infinity;
      for (let j = 0; j < points.length; j++) {
        const point = points[j];
        const dist = Math.hypot(finite(point.x) - actor.x, finite(point.z) - actor.z);
        if (dist < nearest) nearest = dist;
      }
      if (nearest <= nearbyRadius) nearbyCount++;
    }
  }

  return {
    total: entries.length,
    assigned,
    unassigned,
    crossRegion,
    uniqueRegionCount: uniqueRegionKeys.size,
    nearbyCount,
    bands,
    sampleRegionKeys: Array.from(keyExamples)
  };
}

function loadedBuildings() {
  return Array.isArray(appCtx.buildings) ?
    appCtx.buildings.filter((building) => building && !building.collisionDisabled) :
    [];
}

function loadedStructureRoads() {
  return Array.isArray(appCtx.roads) ?
    appCtx.roads.filter((road) => road && roadBehavesGradeSeparated(road)) :
    [];
}

function loadedStructureConnectors() {
  return Array.isArray(appCtx.linearFeatures) ?
    appCtx.linearFeatures.filter((feature) => feature?.structureSemantics?.gradeSeparated) :
    [];
}

function loadedWaterFeatures() {
  const areas = Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas : [];
  const waterways = Array.isArray(appCtx.waterways) ? appCtx.waterways : [];
  return { areas, waterways, combined: [...areas, ...waterways] };
}

function currentDriveRoad() {
  return appCtx.car?.road || appCtx.car?._lastStableRoad || null;
}

function actorOccupiesGradeSeparatedSurface() {
  const road = currentDriveRoad();
  return !!(appCtx.car?.onRoad && road && roadBehavesGradeSeparated(road));
}

function actorOccupiesWaterSurface() {
  return !!(appCtx.boatMode?.active || appCtx.oceanMode?.active);
}

function buildSignature(runtimeSnapshot, actor) {
  return [
    runtimeSnapshot?.sessionEpoch || 0,
    runtimeSnapshot?.activeRegion?.key || "none",
    Math.round(finite(actor?.x) / 96),
    Math.round(finite(actor?.z) / 96),
    Array.isArray(appCtx.buildings) ? appCtx.buildings.length : 0,
    Array.isArray(appCtx.roads) ? appCtx.roads.length : 0,
    Array.isArray(appCtx.linearFeatures) ? appCtx.linearFeatures.length : 0,
    Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas.length : 0,
    Array.isArray(appCtx.waterways) ? appCtx.waterways.length : 0
  ].join("|");
}

function getContinuousWorldFeatureOwnershipSnapshot() {
  const runtimeSnapshot = typeof appCtx.getContinuousWorldRuntimeSnapshot === "function" ?
    appCtx.getContinuousWorldRuntimeSnapshot() :
    null;
  const actor = currentActorPosition();
  const signature = buildSignature(runtimeSnapshot, actor);
  if (snapshotCache.signature === signature && snapshotCache.snapshot) {
    return snapshotCache.snapshot;
  }

  const bandLookup = buildRegionBandLookup(runtimeSnapshot);
  const buildings = loadedBuildings();
  const structureRoads = loadedStructureRoads();
  const structureConnectors = loadedStructureConnectors();
  const water = loadedWaterFeatures();

  const snapshot = {
    generatedAt: new Date().toISOString(),
    sessionEpoch: Number(runtimeSnapshot?.sessionEpoch || 0),
    activeRegionKey: runtimeSnapshot?.activeRegion?.key || null,
    trackedRegionCount: Number(runtimeSnapshot?.regionManager?.trackedCounts?.total || 0),
    actor: {
      mode: actor.mode,
      x: Number(finite(actor.x).toFixed(3)),
      z: Number(finite(actor.z).toFixed(3))
    },
    buildings: {
      ...summarizeFeatureCollection(buildings, {
        actor,
        runtimeSnapshot,
        bandLookup,
        nearbyRadius: BUILDING_NEARBY_RADIUS
      }),
      meshCount: Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes.length : 0
    },
    structures: {
      ...summarizeFeatureCollection([...structureRoads, ...structureConnectors], {
        actor,
        runtimeSnapshot,
        bandLookup,
        nearbyRadius: STRUCTURE_NEARBY_RADIUS
      }),
      roadSpanCount: structureRoads.length,
      connectorCount: structureConnectors.length,
      meshCount: Array.isArray(appCtx.structureVisualMeshes) ? appCtx.structureVisualMeshes.length : 0
    },
    water: {
      ...summarizeFeatureCollection(water.combined, {
        actor,
        runtimeSnapshot,
        bandLookup,
        nearbyRadius: WATER_NEARBY_RADIUS
      }),
      areaCount: water.areas.length,
      waterwayCount: water.waterways.length,
      waveVisualCount: Array.isArray(appCtx.waterWaveVisuals) ? appCtx.waterWaveVisuals.length : 0
    }
  };

  if (
    actorOccupiesGradeSeparatedSurface() &&
    snapshot.structures.total > 0 &&
    snapshot.structures.bands.near > 0
  ) {
    snapshot.structures.nearbyCount = Math.max(1, Number(snapshot.structures.nearbyCount || 0));
  }

  if (
    actorOccupiesWaterSurface() &&
    snapshot.water.total > 0 &&
    snapshot.water.bands.near > 0
  ) {
    snapshot.water.nearbyCount = Math.max(1, Number(snapshot.water.nearbyCount || 0));
  }

  snapshotCache.signature = signature;
  snapshotCache.snapshot = snapshot;
  return snapshot;
}

Object.assign(appCtx, {
  getContinuousWorldFeatureOwnershipSnapshot
});

export { getContinuousWorldFeatureOwnershipSnapshot };
