import { pointInPolygonXZ, sampleFeatureSurfaceY } from "../structure-semantics.js?v=40";

function distanceToRoadCenterline(road, x, z) {
  let best = Infinity;
  for (let index = 0; index < (road?.pts?.length || 0) - 1; index += 1) {
    const a = road.pts[index];
    const b = road.pts[index + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    if (!(lengthSquared > 0)) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}

export function createDriveableRoadConflictIndex(roads = [], options = {}) {
  const cellSize = Math.max(24, Number(options.cellSize) || 96);
  const buckets = new Map();
  let indexedRoads = 0;
  for (const road of roads) {
    if (!road || road.driveable === false || !Array.isArray(road.pts) || road.pts.length < 2) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const point of road.pts) {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) continue;
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) continue;
    const padding = Math.max(2, (Number(road.width) || 5) * 0.5 + 0.8);
    const minCellX = Math.floor((minX - padding) / cellSize);
    const maxCellX = Math.floor((maxX + padding) / cellSize);
    const minCellZ = Math.floor((minZ - padding) / cellSize);
    const maxCellZ = Math.floor((maxZ + padding) / cellSize);
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const key = `${cellX},${cellZ}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = [];
          buckets.set(key, bucket);
        }
        bucket.push(road);
      }
    }
    indexedRoads += 1;
  }

  return Object.freeze({
    candidates(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
      return buckets.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) || [];
    },
    snapshot: () => Object.freeze({
      cellSize,
      cells: buckets.size,
      indexedRoads
    })
  });
}

export function barrierPointConflictsWithDriveableRoad(feature, options = {}) {
  const x = Number(options.x);
  const z = Number(options.z);
  const deckY = Number(options.deckY);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const candidateRoads = typeof options.roadIndex?.candidates === 'function'
    ? options.roadIndex.candidates(x, z)
    : options.roads || [];
  if (options.diagnostics && typeof options.diagnostics === 'object') {
    options.diagnostics.queries = Number(options.diagnostics.queries || 0) + 1;
    options.diagnostics.candidates = Number(options.diagnostics.candidates || 0) + candidateRoads.length;
  }
  for (const road of candidateRoads) {
    if (!road || road === feature || road.driveable === false || !Array.isArray(road.pts)) continue;
    const corridorRadius = Math.max(2, (Number(road.width) || 5) * 0.5 + 0.8);
    if (distanceToRoadCenterline(road, x, z) > corridorRadius) continue;
    const otherY = sampleFeatureSurfaceY(road, x, z);
    if (!Number.isFinite(deckY) || !Number.isFinite(otherY) || Math.abs(otherY - deckY) <= 1.8) {
      return true;
    }
  }
  return false;
}

function isProtectedRoadFeature(feature) {
  const semantics = feature?.structureSemantics;
  if (semantics?.terrainMode !== 'elevated' || feature?.driveable === false) return false;
  if (semantics.skywalk || semantics.covered || semantics.indoor || semantics.embeddedInBuilding) return false;
  const category = String(semantics.featureCategory || feature.networkKind || 'road').toLowerCase();
  const type = String(feature?.type || '').toLowerCase();
  if (category !== 'road' || /^(footway|path|pedestrian|steps|corridor|cycleway)$/.test(type)) return false;
  return semantics.isBridge === true || semantics.verticalOrder > 0 || semantics.deckClearance > 0;
}

function pointTouchesWater(x, z, waterAreas = []) {
  for (let i = 0; i < waterAreas.length; i += 1) {
    const polygon = waterAreas[i]?.pts;
    if (Array.isArray(polygon) && pointInPolygonXZ(x, z, polygon)) return true;
  }
  return false;
}

function stationCrossesWater(feature, distance) {
  const stations = Array.isArray(feature?.structureStations) ? feature.structureStations : [];
  for (let i = 0; i < stations.length; i += 1) {
    const station = stations[i];
    if (!String(station?.source || '').includes('water_crossing')) continue;
    const span = Math.max(8, Number(station?.span) || 0);
    if (Math.abs(distance - (Number(station?.distance) || 0)) <= span * 0.62) return true;
  }
  return false;
}

export function elevatedSegmentSafety(feature, options = {}) {
  if (!isProtectedRoadFeature(feature)) {
    return { protected: false, reason: 'not_vehicle_elevated', clearance: 0, overWater: false };
  }

  const semantics = feature.structureSemantics;
  const deckY = Number(options.deckY);
  const terrainY = Number(options.terrainY);
  const clearance = Number.isFinite(deckY) && Number.isFinite(terrainY) ? deckY - terrainY : 0;
  const distance = Math.max(0, Number(options.distance) || 0);
  const total = Math.max(0, Number(options.total) || 0);
  const overWater =
    pointTouchesWater(Number(options.x) || 0, Number(options.z) || 0, options.waterAreas) ||
    stationCrossesWater(feature, distance);
  const endpointDistance = total > 0 ? Math.min(distance, Math.max(0, total - distance)) : Infinity;
  const transitionZone = Math.max(5, Math.min(18, (Number(feature.width) || 5) * 1.25));

  if (overWater) return { protected: true, reason: 'water_crossing', clearance, overWater };
  if (endpointDistance < transitionZone && clearance < 0.8) {
    return { protected: false, reason: 'ground_transition', clearance, overWater };
  }
  if (semantics.isBridge && (clearance > 0.55 || semantics.deckClearance >= 1.5)) {
    return { protected: true, reason: 'bridge', clearance, overWater };
  }
  if (semantics.rampCandidate && clearance > 1.35) {
    return { protected: true, reason: 'elevated_ramp', clearance, overWater };
  }
  if (clearance > 1.05) return { protected: true, reason: 'fall_exposure', clearance, overWater };
  return { protected: false, reason: 'low_exposure', clearance, overWater };
}

export { isProtectedRoadFeature };
