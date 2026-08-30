import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  getWaveIntensity,
  inferWaterRenderContext,
  resolveWaterMotionProfile,
  sampleWaterSurfaceMotion,
  sampleWaterwaySurfaceProfile
} from "../water-dynamics.js?v=9";
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
} from './water-geometry.js?v=4';
import {
  normalizeWaterBody,
  resolveWaterBodySurfaceY,
  waterKindLabel
} from '../world/water-body-contract.js?v=4';
import { pointInWaterBody } from '../world/water-surface-registry.js?v=3';

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
  const surfaceY = waterSurfaceBaseYAt(x, z, { waterKind });
  const source = normalizeWaterBody({
    shape: 'area',
    synthetic: true,
    type: 'synthetic_water',
    pts,
    area: Math.PI * radius * radius,
    centerX: x,
    centerZ: z,
    surfaceY,
    bounds: {
      minX: x - radius,
      maxX: x + radius,
      minZ: z - radius,
      maxZ: z + radius
    },
    kindHint: waterKind,
    geometrySource: 'synthetic-transition',
    datumMethod: waterKind === 'open_ocean' ? 'sea-level' : 'terrain-fallback',
    datumConfidence: 0.35
  });
  return {
    type: 'area',
    synthetic: true,
    source,
    waterKind,
    label: waterKindLabel(waterKind),
    inside: true,
    distanceToWater: 0,
    shorelineDistance: radius,
    shorelineDistanceKnown: false,
    entryPoint: { x: x + radius, z },
    tangent: { x: 0, z: 1 },
    spawnX: x,
    spawnZ: z,
    centerX: x,
    centerZ: z,
    surfaceY
  };
}

function isSyntheticBoatCandidate(candidate) {
  return candidate?.synthetic === true ||
    candidate?.source?.synthetic === true ||
    candidate?.source?.provenance?.dataset === 'synthetic-transition';
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
  const source = candidate?.source || candidate;
  if (source && (source.waterSchemaVersion || Number.isFinite(source.surfaceY) || source.surfaceProfile)) {
    return resolveWaterBodySurfaceY(candidate, x, z, {
      sampleWaterwayProfile: sampleWaterwaySurfaceProfile,
      terrainHeightAt: (sampleX, sampleZ) => typeof appCtx.terrainMeshHeightAt === 'function'
        ? appCtx.terrainMeshHeightAt(sampleX, sampleZ)
        : appCtx.elevationWorldYAtWorldXZ(sampleX, sampleZ),
      waterwayBias: 0.14
    });
  }

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
    return { x: appCtx.boat.x, y: appCtx.boat.y, z: appCtx.boat.z, angle: appCtx.boat.angle, mode: 'boat' };
  }
  if (appCtx.planeMode?.active) {
    if (appCtx.planeMode.airborne) return null;
    return {
      x: appCtx.planeMode.x,
      y: appCtx.planeMode.y,
      z: appCtx.planeMode.z,
      angle: Number.isFinite(appCtx.planeMode.yaw) ? appCtx.planeMode.yaw : 0,
      mode: 'plane'
    };
  }
  if (appCtx.droneMode) {
    const x = Number(appCtx.drone?.x);
    const y = Number(appCtx.drone?.y);
    const z = Number(appCtx.drone?.z);
    if (![x, y, z].every(Number.isFinite)) return null;
    const sampledGroundY = appCtx.SurfaceQuery?.walkAt?.(x, z)?.position?.y;
    const groundY = Number.isFinite(sampledGroundY)
      ? sampledGroundY
      : appCtx.terrainMeshHeightAt?.(x, z);
    if (!Number.isFinite(groundY) || y - groundY > 4) return null;
    return {
      x,
      y,
      z,
      angle: Number.isFinite(appCtx.drone.yaw) ? appCtx.drone.yaw : 0,
      mode: 'drone'
    };
  }
  if (appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk.state.walker) {
    const walker = appCtx.Walk.state.walker;
    const resolvedSurfaceY = Number(walker._resolvedGroundState?.effectiveGroundY);
    return {
      x: walker.x,
      // Water reachability compares surfaces, not the walker's eye/body origin.
      y: Number.isFinite(resolvedSurfaceY) ? resolvedSurfaceY : Number(walker.y) - 1.7,
      z: walker.z,
      angle: Number.isFinite(walker.angle) ? walker.angle : walker.yaw || 0,
      mode: 'walk'
    };
  }
  return {
    x: Number.isFinite(appCtx.car?.x) ? appCtx.car.x : 0,
    y: Number.isFinite(appCtx.car?.y) ? appCtx.car.y : 0,
    z: Number.isFinite(appCtx.car?.z) ? appCtx.car.z : 0,
    angle: Number.isFinite(appCtx.car?.angle) ? appCtx.car.angle : 0,
    mode: 'drive',
    structureTerrainMode:
      appCtx.car?.onRoad === true ?
        String(appCtx.car?.road?.structureSemantics?.terrainMode || 'at_grade') :
        'at_grade'
  };
}

function buildAreaCandidate(area, x, z) {
  const classification = classifyWaterArea(area);
  if (!classification) return null;
  const inside = pointInWaterBody(area, x, z);
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
    // Vector-ocean polygons are clipped into source tiles, so the nearest
    // polygon edge is not necessarily a coastline and must not be presented
    // as a measured distance to shore.
    shorelineDistanceKnown: classification.kind !== 'open_ocean',
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
  if (String(options.structureTerrainMode || '') === 'subgrade') return null;
  let best = null;
  const requireContainment = options.requireContainment !== false;
  const referenceY = Number(options.referenceY);
  const maximumVerticalDelta = Math.max(0.5, Number(options.maximumVerticalDelta) || 2.8);
  const verticallyReachable = (candidate) => {
    if (!Number.isFinite(referenceY)) return true;
    const surfaceY = waterSurfaceBaseYAt(x, z, candidate);
    return Number.isFinite(surfaceY) &&
      Math.abs(referenceY - surfaceY) <= maximumVerticalDelta;
  };
  const areas = Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas : [];
  const ways = Array.isArray(appCtx.waterways) ? appCtx.waterways : [];

  for (let i = 0; i < areas.length; i++) {
    const candidate = buildAreaCandidate(areas[i], x, z);
    if (!candidate) continue;
    if (requireContainment && !candidate.inside) continue;
    if (!verticallyReachable(candidate)) continue;
    if (!candidate.inside && candidate.distanceToWater > candidateMaxDistance(candidate, maxDistance)) continue;
    if (!best || candidateDistanceScore(candidate) < candidateDistanceScore(best)) best = candidate;
  }

  for (let i = 0; i < ways.length; i++) {
    const candidate = buildWaterwayCandidate(ways[i], x, z);
    if (!candidate) continue;
    if (requireContainment && !candidate.inside) continue;
    if (!verticallyReachable(candidate)) continue;
    if (!candidate.inside && candidate.distanceToWater > candidateMaxDistance(candidate, maxDistance)) continue;
    if (!best || candidateDistanceScore(candidate) < candidateDistanceScore(best)) best = candidate;
  }

  if (!best && options?.allowSynthetic === true) {
    const previous = options.syntheticCandidate;
    if (isSyntheticBoatCandidate(previous) && previous?.source) {
      const source = previous.source;
      const stats = source._boatStats || polygonStats(source.pts || []);
      source._boatStats = stats;
      const centerX = Number.isFinite(source.centerX) ? source.centerX : stats.centerX;
      const centerZ = Number.isFinite(source.centerZ) ? source.centerZ : stats.centerZ;
      const radius = Math.max(80, stats.minSpan * 0.5);
      if (Math.hypot(x - centerX, z - centerZ) < radius * 0.52) {
        const continued = buildAreaCandidate(source, x, z);
        if (continued) return { ...continued, synthetic: true };
      }
    }
    return buildSyntheticBoatCandidate(x, z, {
      waterKind: options.waterKind || previous?.source?.waterKind || previous?.waterKind || 'open_ocean'
    });
  }

  return best;
}

function getBoatModeSnapshot() {
  return {
    active: !!appCtx.boatMode?.active,
    transportEntityId: String(appCtx.boatMode?.transportEntityId || ''),
    transportCatalogId: String(appCtx.boatMode?.transportCatalogId || 'marina-runabout'),
    vesselLabel: String(appCtx.boatMode?.vesselLabel || 'Marina runabout'),
    condition: Number(appCtx.boatMode?.condition ?? 1),
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
  isSyntheticBoatCandidate,
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
