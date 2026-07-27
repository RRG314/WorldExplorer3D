import { pointInPolygonXZ } from "../structure-semantics.js?v=17";

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
