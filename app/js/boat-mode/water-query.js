import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  getWaveIntensity,
  inferWaterRenderContext,
  resolveWaterMotionProfile,
  sampleWaterSurfaceMotion,
  sampleWaterwaySurfaceProfile
} from "../water-dynamics.js?v=4";
import {
  BOAT_AREA_MIN_AREA,
  BOAT_AREA_MIN_SPAN,
  BOAT_EDGE_BUFFER_MIN,
  BOAT_ENTRY_OFFSET,
  BOAT_MAX_CANDIDATE_DISTANCE,
  BOAT_WATERWAY_MIN_LENGTH,
  BOAT_WATERWAY_MIN_WIDTH,
  candidateDistanceScore,
  candidateMaxDistance,
  classifyWaterArea,
  classifyWaterway,
  findBestAreaInteriorSpawn,
  isPointInsideWaterAreaFootprint,
  isPointInsideWaterFootprint,
  isPointInsideWaterwayFootprint,
  measureBoatShorelineDistance,
  minimumBoatShorelineDistance,
  nearestPointOnPolygon,
  nearestPointOnPolyline,
  normalizeAngle,
  pointInsideBoatCandidate,
  polygonStats,
  preferredBoatEntryOffset,
  resolveBoatSpawnPoint,
  segmentDistanceInfo,
  shortestAngleDelta
} from './water-geometry.js?v=1';

let _waterRaycaster = null;
let _waterRayStart = null;
let _waterRayDir = null;
let _cachedWaterMeshes = [];

function ensureRaycaster() {
  if (_waterRaycaster || typeof THREE === 'undefined') return;
  _waterRaycaster = new THREE.Raycaster();
  _waterRayStart = new THREE.Vector3();
  _waterRayDir = new THREE.Vector3(0, -1, 0);
}

function buildSyntheticBoatCandidate(x, z, options = {}) {
  const waterKind = String(options.waterKind || 'open_ocean').toLowerCase();
  const radius =
    waterKind === 'lake' ? 180 :
    waterKind === 'harbor' ? 130 :
    waterKind === 'coastal' ? 260 : 420;
  const pts = [];
  const segments = 12;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    pts.push({
      x: x + Math.cos(angle) * radius,
      z: z + Math.sin(angle) * radius
    });
  }
  return {
    type: 'area',
    synthetic: true,
    source: {
      type: 'synthetic_water',
      pts,
      area: Math.PI * radius * radius,
      centerX: x,
      centerZ: z,
      surfaceY: waterSurfaceBaseYAt(x, z, { waterKind }),
      bounds: {
        minX: x - radius,
        maxX: x + radius,
        minZ: z - radius,
        maxZ: z + radius
      }
    },
    waterKind,
    label: waterKindLabel(waterKind),
    inside: true,
    distanceToWater: 0,
    shorelineDistance: radius,
    entryPoint: { x: x + radius, z },
    tangent: { x: 0, z: 1 },
    spawnX: x,
    spawnZ: z,
    centerX: x,
    centerZ: z,
    surfaceY: waterSurfaceBaseYAt(x, z, { waterKind })
  };
}

function resolveBoatWaterKind(candidate = null) {
  return inferWaterRenderContext({
    kindHint: candidate?.waterKind || appCtx.boatMode?.waterKind || 'coastal'
  });
}

function getBoatWaveProfile(candidate = null, options = {}) {
  return resolveWaterMotionProfile({
    waterKind: resolveBoatWaterKind(candidate),
    shorelineDistance: Number.isFinite(options.shorelineDistance) ?
      options.shorelineDistance :
      Number(candidate?.shorelineDistance || appCtx.boatMode?.shorelineDistance || 0),
    intensity: options.intensity,
    active: options.active !== false,
    energyScale: options.energyScale
  });
}

function waterSurfaceBaseYAt(x, z, candidate = null) {
  if (candidate?.type === 'waterway') {
    const source = candidate?.source || candidate;
    const profileY = sampleWaterwaySurfaceProfile(source?.surfaceProfile, x, z);
    if (Number.isFinite(profileY)) return profileY;
    const terrainY = typeof appCtx.terrainMeshHeightAt === 'function' ?
      appCtx.terrainMeshHeightAt(x, z) :
      appCtx.elevationWorldYAtWorldXZ(x, z);
    const bias = Number.isFinite(candidate?.surfaceY) ? Number(candidate.surfaceY) : 0.14;
    if (Number.isFinite(terrainY)) return terrainY + bias;
  }

  if (Number.isFinite(candidate?.surfaceY)) return Number(candidate.surfaceY);

  ensureRaycaster();
  if (_waterRaycaster && Array.isArray(_cachedWaterMeshes) && _cachedWaterMeshes.length > 0) {
    _waterRayStart.set(x, 1800, z);
    _waterRaycaster.set(_waterRayStart, _waterRayDir);
    const hits = _waterRaycaster.intersectObjects(_cachedWaterMeshes, false);
    if (hits.length > 0 && Number.isFinite(hits[0]?.point?.y)) {
      return hits[0].point.y;
    }
  }

  const terrainY = appCtx.elevationWorldYAtWorldXZ(x, z);
  const waterKind = String(candidate?.waterKind || appCtx.boatMode?.waterKind || '').toLowerCase();
  if ((waterKind === 'open_ocean' || waterKind === 'coastal') && terrainY < -1) {
    return 0.08;
  }
  return terrainY + 0.12;
}

function sampleDynamicWaterAt(x, z, candidate = null, options = {}) {
  const profile = options.profile || getBoatWaveProfile(candidate, options);
  const time = Number.isFinite(options.time) ? Number(options.time) : performance.now() * 0.001;
  const motion = sampleWaterSurfaceMotion(x, z, time, { profile });
  const baseY = waterSurfaceBaseYAt(x, z, candidate);
  return {
    baseY,
    surfaceY: baseY + motion.height,
    motion,
    profile,
    time
  };
}

function waterSurfaceYAt(x, z, candidate = null, options = {}) {
  return sampleDynamicWaterAt(x, z, candidate, options).surfaceY;
}

function syncWaterMeshCache() {
  _cachedWaterMeshes = (Array.isArray(appCtx.landuseMeshes) ? appCtx.landuseMeshes : []).filter((mesh) => {
    if (!mesh) return false;
    if (mesh.userData?.isWaterwayLine) return true;
    return mesh.userData?.landuseType === 'water' || mesh.userData?.surfaceVariant === 'water' || mesh.userData?.surfaceVariant === 'ice';
  });
}

function waterKindLabel(kind) {
  if (kind === 'open_ocean') return 'Open Water';
  if (kind === 'coastal') return 'Coastal Water';
  if (kind === 'harbor') return 'Harbor Water';
  if (kind === 'channel') return 'Channel Water';
  return 'Lake Water';
}

function localizeWaterKind(kind, shorelineDistance = 0) {
  const value = String(kind || '').toLowerCase();
  const depth = Math.max(0, Number(shorelineDistance) || 0);
  if (value === 'open_ocean') {
    if (depth < 26) return 'harbor';
    if (depth < 64) return 'coastal';
    return 'open_ocean';
  }
  if (value === 'coastal') {
    if (depth < 18) return 'harbor';
    return 'coastal';
  }
  return value || 'lake';
}

function localizeBoatCandidate(candidate, shorelineDistance = 0) {
  if (!candidate) return null;
  const depth = Math.max(0, Number(shorelineDistance) || 0);
  const baseKind =
    candidate.type === 'area' ?
      (classifyWaterArea(candidate.source)?.kind || candidate.waterKind || 'lake') :
      candidate.waterKind || 'harbor';
  const waterKind = candidate.type === 'area' ? localizeWaterKind(baseKind, depth) : baseKind;
  const label = waterKindLabel(waterKind);
  if (
    candidate.waterKind === waterKind &&
    candidate.label === label &&
    Number(candidate.shorelineDistance || 0) === depth
  ) {
    return candidate;
  }
  return {
    ...candidate,
    waterKind,
    label,
    shorelineDistance: depth
  };
}

function angleFromDirection(dirX, dirZ, fallbackAngle = 0) {
  if (!Number.isFinite(dirX) || !Number.isFinite(dirZ) || (Math.abs(dirX) < 1e-6 && Math.abs(dirZ) < 1e-6)) {
    return fallbackAngle;
  }
  return Math.atan2(dirX, dirZ);
}

function headingFromTangent(tangent, fallbackAngle = 0) {
  if (!tangent || !Number.isFinite(tangent.x) || !Number.isFinite(tangent.z)) return fallbackAngle;
  const forward = angleFromDirection(tangent.x, tangent.z, fallbackAngle);
  const backward = normalizeAngle(forward + Math.PI);
  return Math.abs(shortestAngleDelta(forward, fallbackAngle)) <= Math.abs(shortestAngleDelta(backward, fallbackAngle)) ?
    forward :
    backward;
}

function resolveBoatHeading(candidate, fallbackAngle = 0) {
  if (!candidate) return fallbackAngle;
  if (candidate.type === 'waterway') {
    return headingFromTangent(candidate.tangent, fallbackAngle);
  }

  const centerHeading = angleFromDirection(
    Number(candidate.centerX) - Number(candidate.spawnX),
    Number(candidate.centerZ) - Number(candidate.spawnZ),
    fallbackAngle
  );

  if (candidate.inside && Number(candidate.shorelineDistance || 0) > 14) {
    return headingFromTangent(candidate.tangent, fallbackAngle);
  }
  if (Number.isFinite(candidate.centerX) && Number.isFinite(candidate.centerZ)) {
    return centerHeading;
  }
  return headingFromTangent(candidate.tangent, fallbackAngle);
}

function getReferencePosition() {
  if (appCtx.boatMode?.active) {
    return { x: appCtx.boat.x, z: appCtx.boat.z, angle: appCtx.boat.angle, mode: 'boat' };
  }
  if (appCtx.droneMode) return null;
  if (appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk.state.walker) {
    return {
      x: appCtx.Walk.state.walker.x,
      z: appCtx.Walk.state.walker.z,
      angle: Number.isFinite(appCtx.Walk.state.walker.angle) ? appCtx.Walk.state.walker.angle : appCtx.Walk.state.walker.yaw || 0,
      mode: 'walk'
    };
  }
  return {
    x: Number.isFinite(appCtx.car?.x) ? appCtx.car.x : 0,
    z: Number.isFinite(appCtx.car?.z) ? appCtx.car.z : 0,
    angle: Number.isFinite(appCtx.car?.angle) ? appCtx.car.angle : 0,
    mode: 'drive'
  };
}

function buildAreaCandidate(area, x, z) {
  const classification = classifyWaterArea(area);
  if (!classification) return null;
  const inside = typeof appCtx.pointInPolygon === 'function' && appCtx.pointInPolygon(x, z, area.pts);
  const nearest = nearestPointOnPolygon(x, z, area.pts);
  if (!nearest) return null;
  const stats = area._boatStats || polygonStats(area.pts);
  const dirToCenterX = stats.centerX - nearest.point.x;
  const dirToCenterZ = stats.centerZ - nearest.point.z;
  const centerLen = Math.hypot(dirToCenterX, dirToCenterZ) || 1;
  const inwardX = dirToCenterX / centerLen;
  const inwardZ = dirToCenterZ / centerLen;
  const spawnX = inside ? x : nearest.point.x + inwardX * BOAT_ENTRY_OFFSET;
  const spawnZ = inside ? z : nearest.point.z + inwardZ * BOAT_ENTRY_OFFSET;
  const localShorelineDistance = inside ? nearest.dist : 0;
  const waterKind = inside ? localizeWaterKind(classification.kind, localShorelineDistance) : classification.kind;
  const label = waterKindLabel(waterKind);
  return {
    type: 'area',
    source: area,
    waterKind,
    label,
    inside,
    distanceToWater: inside ? 0 : nearest.dist,
    shorelineDistance: localShorelineDistance,
    entryPoint: nearest.point,
    tangent: nearest.tangent,
    spawnX,
    spawnZ,
    centerX: stats.centerX,
    centerZ: stats.centerZ,
    surfaceY: Number.isFinite(area.surfaceY) ? area.surfaceY : null
  };
}

function buildWaterwayCandidate(way, x, z) {
  const classification = classifyWaterway(way);
  if (!classification) return null;
  const nearest = nearestPointOnPolyline(x, z, way.pts);
  if (!nearest) return null;
  const halfWidth = Math.max(3, (Number(way.width) || 8) * 0.5);
  const inside = nearest.dist <= halfWidth;
  return {
    type: 'waterway',
    source: way,
    waterKind: classification.kind,
    label: classification.label,
    inside,
    distanceToWater: Math.max(0, nearest.dist - halfWidth),
    shorelineDistance: inside ? Math.max(0, halfWidth - nearest.dist) : 0,
    entryPoint: nearest.point,
    tangent: nearest.tangent,
    spawnX: nearest.point.x,
    spawnZ: nearest.point.z,
    centerX: nearest.point.x,
    centerZ: nearest.point.z,
    surfaceY: Number.isFinite(way.surfaceY) ? way.surfaceY : null
  };
}

function findNearestBoatCandidate(x, z, maxDistance = BOAT_MAX_CANDIDATE_DISTANCE, options = {}) {
  let best = null;
  const areas = Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas : [];
  const ways = Array.isArray(appCtx.waterways) ? appCtx.waterways : [];

  for (let i = 0; i < areas.length; i++) {
    const candidate = buildAreaCandidate(areas[i], x, z);
    if (!candidate) continue;
    if (!candidate.inside && candidate.distanceToWater > candidateMaxDistance(candidate, maxDistance)) continue;
    if (!best || candidateDistanceScore(candidate) < candidateDistanceScore(best)) best = candidate;
  }

  for (let i = 0; i < ways.length; i++) {
    const candidate = buildWaterwayCandidate(ways[i], x, z);
    if (!candidate) continue;
    if (!candidate.inside && candidate.distanceToWater > candidateMaxDistance(candidate, maxDistance)) continue;
    if (!best || candidateDistanceScore(candidate) < candidateDistanceScore(best)) best = candidate;
  }

  if (!best && options?.allowSynthetic === true) {
    return buildSyntheticBoatCandidate(x, z, {
      waterKind: options.waterKind || 'open_ocean'
    });
  }

  return best;
}

function getBoatModeSnapshot() {
  return {
    active: !!appCtx.boatMode?.active,
    available: !!appCtx.boatMode?.available,
    seaState: appCtx.boatMode?.seaState || 'moderate',
    waveIntensity: getWaveIntensity(),
    waterKind: appCtx.boatMode?.waterKind || null,
    shorelineDistance: Number(appCtx.boatMode?.shorelineDistance || 0),
    detailBias: Number(appCtx.boatMode?.detailBias || 1),
    wakeStrength: Number(appCtx.boatMode?.wakeStrength || 0),
    bowSplashStrength: Number(appCtx.boatMode?.bowSplashStrength || 0),
    slamStrength: Number(appCtx.boatMode?.slamStrength || 0),
    currentLabel: appCtx.boatMode?.currentWater?.label || null,
    promptMessage: appCtx.boatMode?.promptMessage || ''
  };
}

export {
  buildSyntheticBoatCandidate,
  findNearestBoatCandidate,
  getBoatModeSnapshot,
  getBoatWaveProfile,
  getReferencePosition,
  isPointInsideWaterFootprint,
  localizeBoatCandidate,
  measureBoatShorelineDistance,
  minimumBoatShorelineDistance,
  resolveBoatWaterKind,
  resolveBoatHeading,
  resolveBoatSpawnPoint,
  sampleDynamicWaterAt,
  syncWaterMeshCache,
  waterKindLabel,
  waterSurfaceBaseYAt,
  waterSurfaceYAt
};
