import { ctx as appCtx } from "./shared-context.js?v=55";
import {
  DEFAULT_WAVE_INTENSITY,
  SEA_STATE_CONFIG,
  SEA_STATE_SEQUENCE,
  getSeaStateConfig,
  getWaveIntensity,
  inferWaterRenderContext,
  intensityFromSeaState,
  resolveWaterMotionProfile,
  sampleWaterSurfaceMotion,
  surfaceNormalFromMotion,
  seaStateFromIntensity
} from "./water-dynamics.js?v=3";

const BOAT_PROMPT_DISTANCE = 18;
const BOAT_ENTRY_OFFSET = 9;
const BOAT_MAX_CANDIDATE_DISTANCE = 58;
const BOAT_EXIT_MAX_SHORELINE_WALK = 96;
const BOAT_EXIT_MAX_SHORELINE_DRIVE = 132;
const BOAT_PROMPT_DURATION_MS = 4200;
const BOAT_WATERWAY_MIN_WIDTH = 12;
const BOAT_WATERWAY_MIN_LENGTH = 120;
const BOAT_AREA_MIN_AREA = 18000;
const BOAT_AREA_MIN_SPAN = 120;
const BOAT_EDGE_BUFFER_MIN = 1.2;

let _waterRaycaster = null;
let _waterRayStart = null;
let _waterRayDir = null;
let _cachedWaterMeshes = [];
let _boatPromptEl = null;
let _boatButtonEl = null;
let _seaStateButtonEl = null;
let _boatWaveDockEl = null;
let _boatWaveSliderEl = null;
let _boatWaveLabelEl = null;
let _boatWaveValueEl = null;
let _boatMeshReady = false;
let _boatFoamTexture = null;
let _boatFoamFx = null;
let _boatFoamSprites = [];
let _boatSternFoamCarry = 0;
let _boatBowFoamCarry = 0;
let _boatPromptHideTimer = null;
let _boatPromptSignature = '';
let _waterMeshCacheSignature = '';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle = 0) {
  let value = Number(angle) || 0;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

function shortestAngleDelta(target = 0, current = 0) {
  return normalizeAngle(target - current);
}

function stepBoatSpring(value, velocity, target, dt, stiffness, damping, maxVelocity = Infinity) {
  const currentValue = Number.isFinite(value) ? value : target;
  const currentVelocity = Number.isFinite(velocity) ? velocity : 0;
  if (!Number.isFinite(dt) || dt <= 0) {
    return {
      value: target,
      velocity: 0
    };
  }
  let nextVelocity = currentVelocity + (target - currentValue) * stiffness * dt;
  nextVelocity *= Math.exp(-damping * dt);
  if (Number.isFinite(maxVelocity)) {
    nextVelocity = clamp(nextVelocity, -maxVelocity, maxVelocity);
  }
  return {
    value: currentValue + nextVelocity * dt,
    velocity: nextVelocity
  };
}

function ensureRaycaster() {
  if (_waterRaycaster || typeof THREE === 'undefined') return;
  _waterRaycaster = new THREE.Raycaster();
  _waterRayStart = new THREE.Vector3();
  _waterRayDir = new THREE.Vector3(0, -1, 0);
}

function segmentDistanceInfo(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-9) {
    const dist = Math.hypot(px - ax, pz - az);
    return {
      dist,
      point: { x: ax, z: az },
      tangent: { x: 0, z: -1 }
    };
  }
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t;
  const z = az + dz * t;
  const dist = Math.hypot(px - x, pz - z);
  const len = Math.hypot(dx, dz) || 1;
  return {
    dist,
    point: { x, z },
    tangent: { x: dx / len, z: dz / len }
  };
}

function polygonStats(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return {
      area: 0,
      centerX: 0,
      centerZ: 0,
      span: 0,
      minSpan: 0,
      avgWidth: 0
    };
  }
  let area2 = 0;
  let cx = 0;
  let cz = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const cross = p1.x * p2.z - p2.x * p1.z;
    area2 += cross;
    cx += (p1.x + p2.x) * cross;
    cz += (p1.z + p2.z) * cross;
    minX = Math.min(minX, p1.x);
    maxX = Math.max(maxX, p1.x);
    minZ = Math.min(minZ, p1.z);
    maxZ = Math.max(maxZ, p1.z);
  }
  const signedArea = area2 * 0.5;
  const area = Math.abs(signedArea);
  const denom = area2 || 1;
  return {
    area,
    centerX: cx / (3 * denom),
    centerZ: cz / (3 * denom),
    span: Math.max(maxX - minX, maxZ - minZ),
    minSpan: Math.min(maxX - minX, maxZ - minZ),
    avgWidth: area > 0 ? area / Math.max(1, Math.max(maxX - minX, maxZ - minZ)) : 0
  };
}

function classifyWaterArea(area) {
  const stats = area?._boatStats || polygonStats(area?.pts || []);
  if (!area) return null;
  area._boatStats = stats;
  if (!(stats.area >= BOAT_AREA_MIN_AREA || stats.span >= BOAT_AREA_MIN_SPAN)) return null;
  const broadOpenWater =
    stats.area > 900000 ||
    (stats.span > 1500 && stats.avgWidth > 120) ||
    (stats.span > 900 && stats.avgWidth > 180);
  if (broadOpenWater) return { kind: 'open_ocean', label: 'Open Water' };
  if (stats.area > 240000 || stats.span > 650 || stats.avgWidth > 70 || stats.minSpan > 85) {
    return { kind: 'coastal', label: 'Coastal Water' };
  }
  if (stats.area > 70000 || stats.span > 260 || stats.avgWidth > 28 || stats.minSpan > 34) {
    return { kind: 'harbor', label: 'Harbor Water' };
  }
  return { kind: 'lake', label: 'Lake Water' };
}

function classifyWaterway(way) {
  const width = Number(way?.width) || 0;
  const pts = Array.isArray(way?.pts) ? way.pts : [];
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    length += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  }
  way._boatLength = length;
  if (width < BOAT_WATERWAY_MIN_WIDTH || length < BOAT_WATERWAY_MIN_LENGTH) return null;
  if (width >= 80 || length >= 1600) return { kind: 'coastal', label: 'Coastal Water' };
  if (width >= 28 || length >= 480) return { kind: 'channel', label: 'Channel Water' };
  return { kind: 'harbor', label: 'Harbor Water' };
}

function nearestPointOnPolygon(px, pz, pts) {
  let best = null;
  if (!Array.isArray(pts)) return null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const info = segmentDistanceInfo(px, pz, a.x, a.z, b.x, b.z);
    if (!best || info.dist < best.dist) best = info;
  }
  return best;
}

function nearestPointOnPolyline(px, pz, pts) {
  let best = null;
  if (!Array.isArray(pts)) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const info = segmentDistanceInfo(px, pz, a.x, a.z, b.x, b.z);
    if (!best || info.dist < best.dist) best = info;
  }
  return best;
}

function candidateDistanceScore(candidate) {
  const boundaryDist = Number.isFinite(candidate?.distanceToWater) ? candidate.distanceToWater : Infinity;
  const insidePenalty = candidate?.inside ? 0 : 1;
  const shorelineDepth = Number.isFinite(candidate?.shorelineDistance) ? candidate.shorelineDistance : 0;
  const desiredDepth = minimumBoatShorelineDistance(candidate?.waterKind || '');
  const kindBias =
    candidate?.waterKind === 'open_ocean' ? 0 :
    candidate?.waterKind === 'coastal' ? 4 :
    candidate?.waterKind === 'harbor' ? 6 :
    candidate?.waterKind === 'channel' ? 8 : 10;
  const shallowPenalty = candidate?.inside ? Math.max(0, desiredDepth - shorelineDepth) * 2.8 : 0;
  const depthBonus = candidate?.inside ? Math.min(shorelineDepth, desiredDepth * 2.4) * 0.12 : 0;
  return boundaryDist + insidePenalty + kindBias + shallowPenalty - depthBonus;
}

function candidateMaxDistance(candidate, baseMaxDistance) {
  const base = Number.isFinite(baseMaxDistance) ? baseMaxDistance : BOAT_MAX_CANDIDATE_DISTANCE;
  if (!candidate) return base;
  if (candidate.waterKind === 'open_ocean') return Math.max(base, 130);
  if (candidate.waterKind === 'coastal') return Math.max(base, 110);
  if (candidate.waterKind === 'lake') return Math.max(base, 95);
  return Math.max(base, 72);
}

function preferredBoatEntryOffset(kind = '') {
  const value = String(kind || '').toLowerCase();
  if (value === 'open_ocean') return 68;
  if (value === 'coastal') return 38;
  if (value === 'lake') return 24;
  if (value === 'harbor') return 16;
  return 12;
}

function minimumBoatShorelineDistance(kind = '') {
  const value = String(kind || '').toLowerCase();
  if (value === 'open_ocean') return 36;
  if (value === 'coastal') return 22;
  if (value === 'lake') return 14;
  if (value === 'harbor') return 8;
  return 6;
}

function pointInsideBoatCandidate(candidate, x, z, edgeBuffer = 0) {
  if (!candidate || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  const buffer = Math.max(0, Number(edgeBuffer) || 0);
  if (candidate.type === 'waterway') {
    const pts = Array.isArray(candidate.source?.pts) ? candidate.source.pts : [];
    const nearest = nearestPointOnPolyline(x, z, pts);
    if (!nearest) return false;
    const halfWidth = Math.max(3, (Number(candidate.source?.width) || 8) * 0.5);
    return nearest.dist <= Math.max(0.8, halfWidth - buffer);
  }
  const pts = Array.isArray(candidate.source?.pts) ? candidate.source.pts : [];
  const inside = typeof appCtx.pointInPolygon === 'function' ? appCtx.pointInPolygon(x, z, pts) : false;
  if (!inside) return false;
  if (buffer <= 0) return true;
  const edge = nearestPointOnPolygon(x, z, pts);
  return !!edge && edge.dist >= buffer;
}

function measureBoatShorelineDistance(candidate, x, z) {
  if (!candidate || !Number.isFinite(x) || !Number.isFinite(z)) return 0;
  if (candidate.type === 'waterway') {
    const pts = Array.isArray(candidate.source?.pts) ? candidate.source.pts : [];
    const nearest = nearestPointOnPolyline(x, z, pts);
    if (!nearest) return 0;
    const halfWidth = Math.max(3, (Number(candidate.source?.width) || 8) * 0.5);
    return Math.max(0, halfWidth - nearest.dist);
  }
  const pts = Array.isArray(candidate.source?.pts) ? candidate.source.pts : [];
  if (!(typeof appCtx.pointInPolygon === 'function' && appCtx.pointInPolygon(x, z, pts))) return 0;
  const nearest = nearestPointOnPolygon(x, z, pts);
  return Math.max(0, Number(nearest?.dist || 0));
}

function findBestAreaInteriorSpawn(candidate, preferredX, preferredZ, minEdge) {
  if (!candidate || candidate.type !== 'area') return null;
  const stats = candidate.source?._boatStats || polygonStats(candidate.source?.pts || []);
  candidate.source._boatStats = stats;
  const centerX = Number.isFinite(candidate.centerX) ? candidate.centerX : stats.centerX;
  const centerZ = Number.isFinite(candidate.centerZ) ? candidate.centerZ : stats.centerZ;
  const entryX = Number(candidate.entryPoint?.x ?? candidate.spawnX ?? centerX);
  const entryZ = Number(candidate.entryPoint?.z ?? candidate.spawnZ ?? centerZ);
  const seeds = [];
  let bestSafe = null;
  let bestAny = null;

  const consider = (px, pz, bonus = 0) => {
    if (!Number.isFinite(px) || !Number.isFinite(pz)) return;
    if (!pointInsideBoatCandidate(candidate, px, pz, 0)) return;
    const shorelineDistance = measureBoatShorelineDistance(candidate, px, pz);
    const distanceToPreferred =
      Number.isFinite(preferredX) && Number.isFinite(preferredZ) ?
        Math.hypot(px - preferredX, pz - preferredZ) :
        Math.hypot(px - entryX, pz - entryZ);
    const score = shorelineDistance - distanceToPreferred * 0.012 + bonus;
    const next = { x: px, z: pz, shorelineDistance, score };
    if (!bestAny || next.score > bestAny.score) bestAny = next;
    if (shorelineDistance >= minEdge && (!bestSafe || next.score > bestSafe.score)) bestSafe = next;
  };

  if (Number.isFinite(centerX) && Number.isFinite(centerZ)) {
    consider(centerX, centerZ, 1.8);
  }

  if (Number.isFinite(preferredX) && Number.isFinite(preferredZ) && Number.isFinite(centerX) && Number.isFinite(centerZ)) {
    const blends = [0.18, 0.32, 0.48, 0.64, 0.8, 1];
    for (let i = 0; i < blends.length; i++) {
      const t = blends[i];
      consider(
        preferredX + (centerX - preferredX) * t,
        preferredZ + (centerZ - preferredZ) * t,
        0.9 - t * 0.24
      );
    }
  }

  if (Number.isFinite(entryX) && Number.isFinite(entryZ) && Number.isFinite(centerX) && Number.isFinite(centerZ)) {
    const blends = [0.26, 0.42, 0.58, 0.74, 0.9];
    for (let i = 0; i < blends.length; i++) {
      const t = blends[i];
      consider(
        entryX + (centerX - entryX) * t,
        entryZ + (centerZ - entryZ) * t,
        0.65 - t * 0.18
      );
    }
  }

  const radialBase = clamp(
    Math.max(minEdge * 1.3, Math.min(stats.avgWidth * 0.42, Math.max(minEdge * 1.6, stats.minSpan * 0.36))),
    minEdge * 1.2,
    Math.max(minEdge * 2.2, stats.span * 0.28)
  );
  const radii = [radialBase * 0.45, radialBase * 0.82, radialBase * 1.14];
  const anchorX = Number.isFinite(centerX) ? centerX : entryX;
  const anchorZ = Number.isFinite(centerZ) ? centerZ : entryZ;
  if (Number.isFinite(anchorX) && Number.isFinite(anchorZ)) {
    for (let r = 0; r < radii.length; r++) {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        consider(
          anchorX + Math.cos(angle) * radii[r],
          anchorZ + Math.sin(angle) * radii[r],
          0.22 - r * 0.06
        );
      }
    }
  }

  return bestSafe || bestAny;
}

function resolveBoatSpawnPoint(candidate, preferredX, preferredZ) {
  if (!candidate) return null;
  const minEdge = Math.max(BOAT_EDGE_BUFFER_MIN, minimumBoatShorelineDistance(candidate.waterKind));
  if (
    Number.isFinite(preferredX) &&
    Number.isFinite(preferredZ) &&
    pointInsideBoatCandidate(candidate, preferredX, preferredZ, 0)
  ) {
    const shorelineDistance = measureBoatShorelineDistance(candidate, preferredX, preferredZ);
    if (shorelineDistance >= minEdge) {
      return {
        x: preferredX,
        z: preferredZ,
        shorelineDistance
      };
    }
    if (candidate.type === 'area') {
      const deeper = findBestAreaInteriorSpawn(candidate, preferredX, preferredZ, minEdge);
      if (deeper && deeper.shorelineDistance >= Math.max(minEdge, shorelineDistance + 4)) {
        return {
          x: deeper.x,
          z: deeper.z,
          shorelineDistance: deeper.shorelineDistance
        };
      }
      const nearestEdge = nearestPointOnPolygon(preferredX, preferredZ, Array.isArray(candidate.source?.pts) ? candidate.source.pts : []);
      if (nearestEdge?.point) {
        let dirX = preferredX - nearestEdge.point.x;
        let dirZ = preferredZ - nearestEdge.point.z;
        const dirLen = Math.hypot(dirX, dirZ) || 1;
        dirX /= dirLen;
        dirZ /= dirLen;
        const topUp = Math.max(0, minEdge - shorelineDistance);
        const offsets = [
          topUp + 2,
          topUp + 8,
          topUp + 18,
          topUp + 32
        ];
        for (let i = 0; i < offsets.length; i++) {
          const px = preferredX + dirX * offsets[i];
          const pz = preferredZ + dirZ * offsets[i];
          if (!pointInsideBoatCandidate(candidate, px, pz, minEdge)) continue;
          return {
            x: px,
            z: pz,
            shorelineDistance: measureBoatShorelineDistance(candidate, px, pz)
          };
        }
      }
    }
  }
  if (
    Number.isFinite(preferredX) &&
    Number.isFinite(preferredZ) &&
    pointInsideBoatCandidate(candidate, preferredX, preferredZ, minEdge)
  ) {
    return {
      x: preferredX,
      z: preferredZ,
      shorelineDistance: measureBoatShorelineDistance(candidate, preferredX, preferredZ)
    };
  }

  if (candidate.type === 'area') {
    const deeper = findBestAreaInteriorSpawn(candidate, preferredX, preferredZ, minEdge);
    if (deeper && deeper.shorelineDistance >= minEdge) {
      return {
        x: deeper.x,
        z: deeper.z,
        shorelineDistance: deeper.shorelineDistance
      };
    }
  }

  if (candidate.type === 'waterway') {
    const x = Number(candidate.entryPoint?.x ?? candidate.spawnX);
    const z = Number(candidate.entryPoint?.z ?? candidate.spawnZ);
    return {
      x,
      z,
      shorelineDistance: measureBoatShorelineDistance(candidate, x, z)
    };
  }

  const entryX = Number(candidate.entryPoint?.x ?? candidate.spawnX);
  const entryZ = Number(candidate.entryPoint?.z ?? candidate.spawnZ);
  const centerX = Number(candidate.centerX ?? entryX);
  const centerZ = Number(candidate.centerZ ?? entryZ);
  let dirX = 0;
  let dirZ = 0;
  const tangent = candidate.tangent || { x: 0, z: 1 };
  const normals = [
    { x: -tangent.z, z: tangent.x },
    { x: tangent.z, z: -tangent.x }
  ];
  for (let i = 0; i < normals.length; i++) {
    const probeX = entryX + normals[i].x * 3.5;
    const probeZ = entryZ + normals[i].z * 3.5;
    if (pointInsideBoatCandidate(candidate, probeX, probeZ, BOAT_EDGE_BUFFER_MIN * 0.5)) {
      dirX = normals[i].x;
      dirZ = normals[i].z;
      break;
    }
  }
  if (Math.abs(dirX) + Math.abs(dirZ) < 1e-5) {
    dirX = centerX - entryX;
    dirZ = centerZ - entryZ;
    const dirLen = Math.hypot(dirX, dirZ) || 1;
    dirX /= dirLen;
    dirZ /= dirLen;
  }
  if (!Number.isFinite(dirX) || !Number.isFinite(dirZ) || Math.abs(dirX) + Math.abs(dirZ) < 1e-5) {
    dirX = -tangent.z || 0;
    dirZ = tangent.x || 1;
  }

  const baseOffset = preferredBoatEntryOffset(candidate.waterKind);
  const offsets = [
    baseOffset,
    baseOffset * 1.4,
    baseOffset * 1.9,
    baseOffset * 2.6,
    baseOffset * 3.4
  ];
  for (let i = 0; i < offsets.length; i++) {
    const px = entryX + dirX * offsets[i];
    const pz = entryZ + dirZ * offsets[i];
    if (!pointInsideBoatCandidate(candidate, px, pz, minEdge)) continue;
    return {
      x: px,
      z: pz,
      shorelineDistance: measureBoatShorelineDistance(candidate, px, pz)
    };
  }

  const blendSteps = [0.18, 0.32, 0.48, 0.64, 0.78, 0.9];
  for (let i = 0; i < blendSteps.length; i++) {
    const t = blendSteps[i];
    const px = entryX + (centerX - entryX) * t;
    const pz = entryZ + (centerZ - entryZ) * t;
    if (!pointInsideBoatCandidate(candidate, px, pz, Math.max(BOAT_EDGE_BUFFER_MIN, minEdge * 0.45))) continue;
    return {
      x: px,
      z: pz,
      shorelineDistance: measureBoatShorelineDistance(candidate, px, pz)
    };
  }

  for (let i = 0; i < offsets.length; i++) {
    const px = entryX + dirX * offsets[i];
    const pz = entryZ + dirZ * offsets[i];
    if (!pointInsideBoatCandidate(candidate, px, pz, 0)) continue;
    return {
      x: px,
      z: pz,
      shorelineDistance: measureBoatShorelineDistance(candidate, px, pz)
    };
  }

  const fallbackX = Number(candidate.spawnX ?? entryX);
  const fallbackZ = Number(candidate.spawnZ ?? entryZ);
  return {
    x: fallbackX,
    z: fallbackZ,
    shorelineDistance: measureBoatShorelineDistance(candidate, fallbackX, fallbackZ)
  };
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
      surfaceY: waterSurfaceBaseYAt(x, z, null),
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
    surfaceY: waterSurfaceBaseYAt(x, z, null)
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

  return appCtx.elevationWorldYAtWorldXZ(x, z) + 0.12;
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
  const signature = `${Array.isArray(appCtx.landuseMeshes) ? appCtx.landuseMeshes.length : 0}:${Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas.length : 0}:${Array.isArray(appCtx.waterways) ? appCtx.waterways.length : 0}`;
  if (signature === _waterMeshCacheSignature) return _cachedWaterMeshes;
  _waterMeshCacheSignature = signature;
  _cachedWaterMeshes = (Array.isArray(appCtx.landuseMeshes) ? appCtx.landuseMeshes : []).filter((mesh) => {
    if (!mesh) return false;
    if (mesh.userData?.isWaterwayLine) return true;
    return mesh.userData?.landuseType === 'water' || mesh.userData?.surfaceVariant === 'water' || mesh.userData?.surfaceVariant === 'ice';
  });
  return _cachedWaterMeshes;
}

function waterFeatureBounds(feature) {
  if (!feature) return null;
  if (feature.bounds) return feature.bounds;
  const pts = Array.isArray(feature.pts) ? feature.pts : [];
  if (pts.length < 2) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const padding = feature.type === 'waterway' ? Math.max(12, (Number(feature.width) || 8) * 0.5 + 12) : 0;
  for (let i = 0; i < pts.length; i++) {
    const point = pts[i];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return null;
  feature.bounds = {
    minX: minX - padding,
    maxX: maxX + padding,
    minZ: minZ - padding,
    maxZ: maxZ + padding
  };
  return feature.bounds;
}

function distanceSqToBounds(bounds, x, z) {
  if (!bounds || !Number.isFinite(x) || !Number.isFinite(z)) return Infinity;
  const dx =
    x < bounds.minX ? bounds.minX - x :
    x > bounds.maxX ? x - bounds.maxX :
      0;
  const dz =
    z < bounds.minZ ? bounds.minZ - z :
    z > bounds.maxZ ? z - bounds.maxZ :
      0;
  return dx * dx + dz * dz;
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
  const coarseSearchRadius = Math.max(140, Number(maxDistance) || BOAT_MAX_CANDIDATE_DISTANCE);
  const coarseSearchRadiusSq = coarseSearchRadius * coarseSearchRadius;

  for (let i = 0; i < areas.length; i++) {
    if (distanceSqToBounds(waterFeatureBounds(areas[i]), x, z) > coarseSearchRadiusSq) continue;
    const candidate = buildAreaCandidate(areas[i], x, z);
    if (!candidate) continue;
    if (!candidate.inside && candidate.distanceToWater > candidateMaxDistance(candidate, maxDistance)) continue;
    if (!best || candidateDistanceScore(candidate) < candidateDistanceScore(best)) best = candidate;
  }

  for (let i = 0; i < ways.length; i++) {
    if (distanceSqToBounds(waterFeatureBounds(ways[i]), x, z) > coarseSearchRadiusSq) continue;
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

function ensureBoatPromptRefs() {
  if (!_boatPromptEl) _boatPromptEl = document.getElementById('boatPrompt');
  if (!_boatButtonEl) _boatButtonEl = document.getElementById('fBoat');
  if (!_seaStateButtonEl) _seaStateButtonEl = document.getElementById('fSeaState');
  if (!_boatWaveDockEl) _boatWaveDockEl = document.getElementById('boatWaveDock');
  if (!_boatWaveSliderEl) _boatWaveSliderEl = document.getElementById('boatWaveSlider');
  if (!_boatWaveLabelEl) _boatWaveLabelEl = document.getElementById('boatWaveLabel');
  if (!_boatWaveValueEl) _boatWaveValueEl = document.getElementById('boatWaveValue');
}

function resetBoatDynamics() {
  appCtx.boat.speed = 0;
  appCtx.boat.turnRate = 0;
  appCtx.boat.vx = 0;
  appCtx.boat.vz = 0;
  appCtx.boat.throttle = 0;
  appCtx.boat.forwardSpeed = 0;
  appCtx.boat.lateralSpeed = 0;
  appCtx.boat.verticalVelocity = 0;
  appCtx.boat.bowLift = 0;
  appCtx.boat.heaveVelocity = 0;
  appCtx.boat.pitchVelocity = 0;
  appCtx.boat.rollVelocity = 0;
  appCtx.boat.surfaceSteepness = 0;
  appCtx.boatMode.wakeStrength = 0;
  appCtx.boatMode.wakeSpread = 0;
  appCtx.boatMode.bowWaveStrength = 0;
  appCtx.boatMode.bowSplashStrength = 0;
  appCtx.boatMode.sternFoamStrength = 0;
  appCtx.boatMode.slamStrength = 0;
}

function setBoatWaveIntensity(value, options = {}) {
  const nextValue = Number(value);
  const intensity = clamp(Number.isFinite(nextValue) ? nextValue : getWaveIntensity(), 0, 1);
  appCtx.boatMode.waveIntensity = intensity;
  appCtx.boatMode.seaState = seaStateFromIntensity(intensity);
  if (appCtx.boatMode?.active) {
    appCtx.boatMode.promptMessage = `Boat Mode Active • ${boatHudLabel()}`;
  }
  if (_boatWaveSliderEl && document.activeElement !== _boatWaveSliderEl) {
    _boatWaveSliderEl.value = String(Math.round(intensity * 100));
  }
  if (options.skipVisuals !== true) updateWaterWaveVisuals();
  if (options.skipUi !== true) updateBoatMenuUi();
  return intensity;
}

function updateBoatMenuUi() {
  ensureBoatPromptRefs();
  if (_boatButtonEl) {
    const showBoat = !!(appCtx.boatMode?.active || appCtx.boatMode?.available || appCtx.oceanMode?.active);
    _boatButtonEl.style.display = showBoat ? '' : 'none';
    _boatButtonEl.textContent = appCtx.boatMode?.active ? '⛴ Exit Boat' : appCtx.oceanMode?.active ? '🚤 Surface Boat' : '🚤 Boat Mode';
    _boatButtonEl.classList.toggle('on', !!appCtx.boatMode?.active);
  }
  if (_seaStateButtonEl) {
    const showSea = !!appCtx.boatMode?.active;
    _seaStateButtonEl.style.display = showSea ? '' : 'none';
    const label = getSeaStateConfig().label;
    _seaStateButtonEl.textContent = `🌊 Sea State: ${label}`;
  }
  if (_boatWaveDockEl && _boatWaveSliderEl && _boatWaveLabelEl && _boatWaveValueEl) {
    const active = !!appCtx.boatMode?.active;
    _boatWaveDockEl.classList.toggle('show', active);
    _boatWaveDockEl.setAttribute('aria-hidden', active ? 'false' : 'true');
    const intensity = getWaveIntensity();
    const percent = Math.round(intensity * 100);
    _boatWaveSliderEl.value = String(percent);
    _boatWaveValueEl.textContent = `${percent}%`;
    _boatWaveLabelEl.textContent = `${getSeaStateConfig().label} Water`;
  }
}

function hideBoatPrompt() {
  ensureBoatPromptRefs();
  if (_boatPromptHideTimer) {
    clearTimeout(_boatPromptHideTimer);
    _boatPromptHideTimer = null;
  }
  if (_boatPromptEl) {
    _boatPromptEl.classList.remove('show');
    _boatPromptEl.textContent = '';
    _boatPromptEl.dataset.variant = '';
  }
}

function showBoatPrompt(message, variant = 'supported', durationMs = 0) {
  ensureBoatPromptRefs();
  if (!_boatPromptEl) return;
  if (_boatPromptHideTimer) {
    clearTimeout(_boatPromptHideTimer);
    _boatPromptHideTimer = null;
  }
  _boatPromptEl.textContent = message;
  _boatPromptEl.dataset.variant = variant;
  _boatPromptEl.classList.add('show');
  if (Number.isFinite(durationMs) && durationMs > 0) {
    _boatPromptHideTimer = window.setTimeout(() => {
      _boatPromptHideTimer = null;
      hideBoatPrompt();
    }, durationMs);
  }
}

function boatHudLabel() {
  const waterLabel = waterKindLabel(appCtx.boatMode?.waterKind);
  const seaLabel = getSeaStateConfig().label;
  return `${waterLabel} • ${seaLabel} Sea`;
}

function getBoatFoamTexture() {
  if (_boatFoamTexture || typeof THREE === 'undefined' || typeof document === 'undefined') return _boatFoamTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return null;
  const gradient = ctx2d.createRadialGradient(64, 64, 8, 64, 64, 58);
  gradient.addColorStop(0, 'rgba(255,255,255,0.96)');
  gradient.addColorStop(0.34, 'rgba(244,249,255,0.82)');
  gradient.addColorStop(0.68, 'rgba(169,210,235,0.24)');
  gradient.addColorStop(1, 'rgba(120,170,205,0)');
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, 128, 128);
  _boatFoamTexture = new THREE.CanvasTexture(canvas);
  _boatFoamTexture.needsUpdate = true;
  return _boatFoamTexture;
}

function ensureBoatFoamFx() {
  if (_boatFoamFx || typeof THREE === 'undefined' || !appCtx.scene) return _boatFoamFx;
  const group = new THREE.Group();
  group.name = 'BoatFoamFx';
  group.visible = false;
  group.renderOrder = 4;
  group.frustumCulled = false;
  const texture = getBoatFoamTexture();
  for (let i = 0; i < 84; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: 0xf7fbff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.scale.setScalar(0.01);
    sprite.userData.active = false;
    sprite.userData.kind = 'stern';
    sprite.userData.life = 0;
    sprite.userData.maxLife = 1;
    sprite.userData.vx = 0;
    sprite.userData.vy = 0;
    sprite.userData.vz = 0;
    sprite.frustumCulled = false;
    group.add(sprite);
    _boatFoamSprites.push(sprite);
  }
  appCtx.scene.add(group);
  _boatFoamFx = group;
  return group;
}

function resetBoatFoamFx() {
  _boatSternFoamCarry = 0;
  _boatBowFoamCarry = 0;
  if (!_boatFoamFx) return;
  _boatFoamFx.visible = false;
  for (let i = 0; i < _boatFoamSprites.length; i++) {
    const sprite = _boatFoamSprites[i];
    if (!sprite) continue;
    sprite.visible = false;
    sprite.userData.active = false;
    sprite.userData.life = 0;
    if (sprite.material) sprite.material.opacity = 0;
  }
}

function spawnBoatFoamParticle(kind, x, y, z, vx, vy, vz, life, size) {
  ensureBoatFoamFx();
  for (let i = 0; i < _boatFoamSprites.length; i++) {
    const sprite = _boatFoamSprites[i];
    if (!sprite || sprite.userData.active) continue;
    sprite.visible = true;
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(size);
    sprite.material.opacity = kind === 'bow' ? 0.74 : 0.56;
    sprite.userData.active = true;
    sprite.userData.kind = kind;
    sprite.userData.life = life;
    sprite.userData.maxLife = life;
    sprite.userData.vx = vx;
    sprite.userData.vy = vy;
    sprite.userData.vz = vz;
    return true;
  }
  return false;
}

function updateBoatFoamFx(dt, profile) {
  const group = ensureBoatFoamFx();
  if (!group) return false;
  if (!appCtx.boatMode?.active) {
    resetBoatFoamFx();
    return false;
  }
  group.visible = true;
  const maxSpeed = Math.max(1, getSeaStateConfig().speedMax || 1);
  const speedNorm = clamp(Math.abs(appCtx.boat.forwardSpeed || appCtx.boat.speed || 0) / maxSpeed, 0, 1.6);
  const forwardX = Math.sin(appCtx.boat.angle || 0);
  const forwardZ = Math.cos(appCtx.boat.angle || 0);
  const rightX = Math.cos(appCtx.boat.angle || 0);
  const rightZ = -Math.sin(appCtx.boat.angle || 0);
  const waveDirX = Number.isFinite(appCtx.boatMode.waveDirectionX) ? appCtx.boatMode.waveDirectionX : forwardX;
  const waveDirZ = Number.isFinite(appCtx.boatMode.waveDirectionZ) ? appCtx.boatMode.waveDirectionZ : forwardZ;

  const sternRate = (0.4 + appCtx.boatMode.wakeStrength * 5.4 + speedNorm * 2.8) * (1 + profile.intensity * 0.12);
  const bowRate = (appCtx.boatMode.bowSplashStrength * 3.2 + appCtx.boatMode.slamStrength * 2.6) * (0.65 + speedNorm * 0.55);
  _boatSternFoamCarry += sternRate * dt;
  _boatBowFoamCarry += bowRate * dt;

  while (_boatSternFoamCarry >= 1) {
    _boatSternFoamCarry -= 1;
    const lateral = (Math.random() * 2 - 1) * (0.8 + appCtx.boatMode.wakeSpread * 0.9);
    const behind = 3.2 + Math.random() * 1.2;
    const px = appCtx.boat.x - forwardX * behind + rightX * lateral;
    const pz = appCtx.boat.z - forwardZ * behind + rightZ * lateral;
    const py = appCtx.boat.y + 0.14 + Math.random() * 0.16;
    const vx = -forwardX * (0.8 + speedNorm * 2.8 + Math.random() * 1.1) + waveDirX * 0.45 + rightX * lateral * 0.18;
    const vz = -forwardZ * (0.8 + speedNorm * 2.8 + Math.random() * 1.1) + waveDirZ * 0.45 + rightZ * lateral * 0.18;
    const vy = 0.12 + appCtx.boatMode.sternFoamStrength * 0.18 + Math.random() * 0.12;
    spawnBoatFoamParticle('stern', px, py, pz, vx, vy, vz, 0.9 + Math.random() * 0.55, 1.1 + Math.random() * 1.2);
  }

  while (_boatBowFoamCarry >= 1) {
    _boatBowFoamCarry -= 1;
    const lateral = (Math.random() * 2 - 1) * 0.75;
    const ahead = 3.6 + Math.random() * 0.9;
    const px = appCtx.boat.x + forwardX * ahead + rightX * lateral;
    const pz = appCtx.boat.z + forwardZ * ahead + rightZ * lateral;
    const py = appCtx.boat.y + 0.22 + Math.random() * 0.22;
    const vx = forwardX * (0.6 + appCtx.boatMode.bowSplashStrength * 1.2) + waveDirX * 0.3 + rightX * lateral * 0.24;
    const vz = forwardZ * (0.6 + appCtx.boatMode.bowSplashStrength * 1.2) + waveDirZ * 0.3 + rightZ * lateral * 0.24;
    const vy = 0.4 + appCtx.boatMode.slamStrength * 0.7 + Math.random() * 0.34;
    spawnBoatFoamParticle('bow', px, py, pz, vx, vy, vz, 0.58 + Math.random() * 0.44, 0.9 + Math.random() * 0.9);
  }

  for (let i = 0; i < _boatFoamSprites.length; i++) {
    const sprite = _boatFoamSprites[i];
    if (!sprite?.userData?.active) continue;
    sprite.userData.life -= dt;
    if (sprite.userData.life <= 0) {
      sprite.userData.active = false;
      sprite.visible = false;
      if (sprite.material) sprite.material.opacity = 0;
      continue;
    }
    const lifeT = sprite.userData.life / Math.max(0.001, sprite.userData.maxLife);
    sprite.position.x += sprite.userData.vx * dt;
    sprite.position.y += sprite.userData.vy * dt;
    sprite.position.z += sprite.userData.vz * dt;
    sprite.userData.vx *= Math.exp(-1.6 * dt);
    sprite.userData.vy = sprite.userData.vy * Math.exp(-1.9 * dt) - 0.42 * dt;
    sprite.userData.vz *= Math.exp(-1.6 * dt);
    const swellLift = 1 + (1 - lifeT) * (sprite.userData.kind === 'bow' ? 1.2 : 0.8);
    sprite.scale.setScalar((sprite.userData.kind === 'bow' ? 1.1 : 0.9) * swellLift);
    sprite.material.opacity = (sprite.userData.kind === 'bow' ? 0.82 : 0.62) * Math.min(1, lifeT * 1.8);
  }
  return true;
}

function customizeBoatWaterPatchShader(shader) {
  if (!shader?.uniforms || typeof THREE === 'undefined') return;
  shader.uniforms.weBoatPos = { value: new THREE.Vector2(0, 0) };
  shader.uniforms.weBoatForward = { value: new THREE.Vector2(0, 1) };
  shader.uniforms.weBoatWakeStrength = { value: 0 };
  shader.uniforms.weBoatWakeSpread = { value: 0.4 };
  shader.uniforms.weBoatBowWave = { value: 0 };
  shader.uniforms.weBoatBowSplash = { value: 0 };
  shader.uniforms.weBoatSternFoam = { value: 0 };
  shader.uniforms.weBoatWaveSeverity = { value: 0 };

  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
uniform vec2 weBoatPos;
uniform vec2 weBoatForward;
uniform float weBoatWakeStrength;
uniform float weBoatWakeSpread;
uniform float weBoatBowWave;
uniform float weBoatBowSplash;
uniform float weBoatSternFoam;
uniform float weBoatWaveSeverity;

vec2 weBoatToLocal(vec2 worldXZ) {
  vec2 delta = worldXZ - weBoatPos;
  vec2 boatRight = vec2(weBoatForward.y, -weBoatForward.x);
  return vec2(dot(delta, boatRight), dot(delta, weBoatForward));
}

float weBoatWakeFoamMask(vec2 worldXZ) {
  vec2 local = weBoatToLocal(worldXZ);
  float sternDistance = max(0.0, -local.y);
  float spread = 0.58 + sternDistance * (0.12 + weBoatWakeSpread * 0.12);
  float wakeWidth = 0.52 + sternDistance * 0.018;
  float kelvin = exp(-pow((abs(local.x) - spread) / wakeWidth, 2.0));
  float sternCore = exp(-pow(local.x / (0.86 + sternDistance * 0.07), 2.0));
  float decay = exp(-sternDistance * 0.046);
  return smoothstep(0.0, 1.0, sternDistance) * decay * max(kelvin, sternCore * 0.72);
}

float weBoatBowFoamMask(vec2 worldXZ) {
  vec2 local = weBoatToLocal(worldXZ);
  float bowDistance = max(0.0, local.y);
  float bowWidth = max(0.82, 0.38 + bowDistance * 0.16);
  float cone = exp(-pow(local.x / bowWidth, 2.0));
  float bowFront = smoothstep(0.0, 2.6, bowDistance) * (1.0 - smoothstep(5.6, 10.0, bowDistance));
  return cone * bowFront;
}

float weBoatWakeDisplacement(vec2 worldXZ) {
  vec2 local = weBoatToLocal(worldXZ);
  float sternDistance = max(0.0, -local.y);
  float spread = 0.44 + sternDistance * (0.14 + weBoatWakeSpread * 0.1);
  float wakeWidth = 0.6 + sternDistance * 0.02;
  float wakeBands = exp(-pow((abs(local.x) - spread) / wakeWidth, 2.0));
  float sternCore = exp(-pow(local.x / (0.92 + sternDistance * 0.06), 2.0));
  float wakeTrail = smoothstep(0.0, 1.0, sternDistance) * exp(-sternDistance * 0.045) * (wakeBands * 0.76 - sternCore * 0.22);
  float bowDistance = max(0.0, local.y);
  float bowWidth = max(0.9, 0.36 + bowDistance * 0.18);
  float bowPush = exp(-pow(local.x / bowWidth, 2.0)) * smoothstep(0.0, 2.2, bowDistance) * (1.0 - smoothstep(5.4, 9.2, bowDistance));
  return wakeTrail * (0.12 + weBoatWakeStrength * 0.42) + bowPush * (0.04 + weBoatBowWave * 0.18 + weBoatBowSplash * 0.08);
}`
    )
    .replace(
      'transformed.y += weWaveField(weWorldPos.xz);',
      `float weBoatWakeDisplace = weBoatWakeDisplacement(weWorldPos.xz);
transformed.y += weWaveField(weWorldPos.xz) + weBoatWakeDisplace;`
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform vec2 weBoatPos;
uniform vec2 weBoatForward;
uniform float weBoatWakeStrength;
uniform float weBoatWakeSpread;
uniform float weBoatBowWave;
uniform float weBoatBowSplash;
uniform float weBoatSternFoam;
uniform float weBoatWaveSeverity;

vec2 weBoatToLocal(vec2 worldXZ) {
  vec2 delta = worldXZ - weBoatPos;
  vec2 boatRight = vec2(weBoatForward.y, -weBoatForward.x);
  return vec2(dot(delta, boatRight), dot(delta, weBoatForward));
}

float weBoatWakeFoamMask(vec2 worldXZ) {
  vec2 local = weBoatToLocal(worldXZ);
  float sternDistance = max(0.0, -local.y);
  float spread = 0.58 + sternDistance * (0.12 + weBoatWakeSpread * 0.12);
  float wakeWidth = 0.52 + sternDistance * 0.018;
  float kelvin = exp(-pow((abs(local.x) - spread) / wakeWidth, 2.0));
  float sternCore = exp(-pow(local.x / (0.86 + sternDistance * 0.07), 2.0));
  float decay = exp(-sternDistance * 0.046);
  return smoothstep(0.0, 1.0, sternDistance) * decay * max(kelvin, sternCore * 0.72);
}

float weBoatBowFoamMask(vec2 worldXZ) {
  vec2 local = weBoatToLocal(worldXZ);
  float bowDistance = max(0.0, local.y);
  float bowWidth = max(0.82, 0.38 + bowDistance * 0.16);
  float cone = exp(-pow(local.x / bowWidth, 2.0));
  float bowFront = smoothstep(0.0, 2.6, bowDistance) * (1.0 - smoothstep(5.6, 10.0, bowDistance));
  return cone * bowFront;
}`
    )
    .replace(
      'float weFoamBands = smoothstep(0.46, 0.96, weWaveCrestValue) * clamp(weWaveFoamStrength, 0.0, 1.5);',
      `float weFoamBands = smoothstep(0.44, 0.98, weWaveCrestValue) * clamp(weWaveFoamStrength, 0.0, 1.8);
float weWhitecaps = smoothstep(0.74, 1.36, weWaveCrestValue + weBoatWaveSeverity * 0.18) * clamp(weWaveFoamStrength * 0.72 + weBoatWaveSeverity * 0.66, 0.0, 2.2);
float weBoatWakeFoam = weBoatWakeFoamMask(vWeWaveWorldXZ) * (0.28 + weBoatWakeStrength * 1.24 + weBoatSternFoam * 0.46);
float weBoatBowFoam = weBoatBowFoamMask(vWeWaveWorldXZ) * (0.22 + weBoatBowWave * 0.92 + weBoatBowSplash * 0.76);
float weBoatFoam = clamp(weBoatWakeFoam + weBoatBowFoam, 0.0, 2.8);`
    )
    .replace(
      'diffuseColor.rgb += vec3(0.08, 0.11, 0.13) * weFoamBands * 0.58;',
      `diffuseColor.rgb += vec3(0.04, 0.06, 0.08) * (weFoamBands * 0.32 + weWhitecaps * 0.38 + weBoatFoam * 0.42);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.84, 0.9), clamp(weWhitecaps * 0.1 + weBoatFoam * 0.12, 0.0, 0.24));`
    )
    .replace(
      'totalEmissiveRadiance += vec3(0.048, 0.074, 0.098) * weFoamBands * (weWaveVisualStrength * 0.74);',
      `totalEmissiveRadiance += vec3(0.048, 0.074, 0.098) * (weFoamBands * (weWaveVisualStrength * 0.74) + weWhitecaps * 0.22 + weBoatFoam * 0.28);`
    )
    .replace(
      `if (weWaveEdgeFade > 0.0) {
  float weEdge = min(min(vWePatchUv.x, 1.0 - vWePatchUv.x), min(vWePatchUv.y, 1.0 - vWePatchUv.y));
  float wePatchMask = smoothstep(0.0, weWaveEdgeFade, weEdge);
  diffuseColor.a *= wePatchMask;
}`,
      `if (weWaveEdgeFade > 0.0) {
  vec2 wePatchCenteredUv = vWePatchUv - vec2(0.5);
  float wePatchRadius = length(wePatchCenteredUv) * 1.41421356;
  float wePatchNoise = sin(vWeWaveWorldXZ.x * 0.008 + weWaveTime * 0.08) * sin(vWeWaveWorldXZ.y * 0.009 - weWaveTime * 0.06);
  float wePatchInner = max(0.0, 1.0 - weWaveEdgeFade * (2.1 + wePatchNoise * 0.32));
  float wePatchOuter = 1.0 + wePatchNoise * 0.035;
  float wePatchMask = 1.0 - smoothstep(wePatchInner, wePatchOuter, wePatchRadius);
  diffuseColor.a *= clamp(wePatchMask, 0.0, 1.0);
}`
    );
}

function ensureBoatWaterPatch() {
  if (appCtx.boatMode?.waterPatch || typeof THREE === 'undefined' || !appCtx.scene) return appCtx.boatMode?.waterPatch || null;
  const geometry = new THREE.PlaneGeometry(1, 1, 128, 128);
  geometry.rotateX(-Math.PI / 2);
  const waterColor = appCtx.LANDUSE_STYLES?.water?.color || 0x4a90e2;
  const material = new THREE.MeshStandardMaterial({
    color: waterColor,
    emissive: 0x082038,
    emissiveIntensity: 0.1,
    roughness: 0.5,
    metalness: 0.02,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -8,
    polygonOffsetUnits: -8
  });
  if (typeof appCtx.registerWaterWaveMaterial === 'function') {
    appCtx.registerWaterWaveMaterial(material, {
      waveScale: 1.08,
      waveBase: 1.28,
      visualBase: 0.78,
      foamBase: 1.38,
      edgeFade: 0.46,
      useRuntimeKind: true,
      localPatch: true,
      shaderKey: 'boatPatchWake',
      shaderHook: customizeBoatWaterPatchShader
    });
    material.userData.weWaterWaveConfig = {
      ...(material.userData.weWaterWaveConfig || {}),
      visualBase: 0.78,
      foamBase: 1.38
    };
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'BoatWaterPatch';
  mesh.visible = false;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = () => {
    if (!appCtx.boatMode?.active) return;
    refreshBoatWaterPatchUniforms(performance.now() * 0.001);
  };
  appCtx.scene.add(mesh);
  appCtx.boatMode.waterPatch = mesh;
  return mesh;
}

function updateBoatWaterPatch(candidate = null) {
  const patch = ensureBoatWaterPatch();
  if (!patch) return false;
  if (!appCtx.boatMode?.active) {
    patch.visible = false;
    return false;
  }
  const waterKind = String(candidate?.waterKind || appCtx.boatMode?.waterKind || 'coastal').toLowerCase();
  const radius =
    waterKind === 'harbor' ? 110 :
    waterKind === 'channel' ? 90 :
    waterKind === 'lake' ? 150 :
    waterKind === 'open_ocean' ? 320 : 210;
  patch.visible = true;
  patch.position.set(
    appCtx.boat.x,
    waterSurfaceBaseYAt(appCtx.boat.x, appCtx.boat.z, candidate || appCtx.boatMode.currentWater || null) + 0.003,
    appCtx.boat.z
  );
  // The geometry is pre-rotated onto the XZ plane, so scale the footprint on X/Z.
  // Scaling Y here collapses the patch into a moving strip and exaggerates wave height.
  patch.scale.set(radius * 2.05, 1, radius * 2.05);
  patch.material.opacity = 1;
  if (patch.material.color?.setHex) patch.material.color.setHex(appCtx.LANDUSE_STYLES?.water?.color || 0x4a90e2);
  if (patch.material.emissive?.setHex) patch.material.emissive.setHex(0x082038);
  patch.material.roughness =
    waterKind === 'open_ocean' ? 0.46 :
    waterKind === 'coastal' ? 0.44 :
    waterKind === 'harbor' || waterKind === 'channel' ? 0.4 :
    0.42;
  patch.material.metalness = 0.02;
  if (!patch.material.userData?.weWaterWaveShader) patch.material.needsUpdate = true;
  return true;
}

function buildBoatWaveProfile(material, runtimeIntensity = getWaveIntensity(), timeOverride = null) {
  const config = material?.userData?.weWaterWaveConfig || {};
  const runtimeKind = resolveBoatWaterKind(appCtx.boatMode?.currentWater || null);
  const runtimeShoreline = Number(appCtx.boatMode?.shorelineDistance || 0);
  const profile = resolveWaterMotionProfile({
    waterKind: config.useRuntimeKind === true ? runtimeKind : inferWaterRenderContext({ kindHint: config.waterKind || runtimeKind }),
    shorelineDistance: Number.isFinite(config.shorelineDistance) ? config.shorelineDistance : runtimeShoreline,
    intensity: appCtx.boatMode?.active ? runtimeIntensity : Math.min(runtimeIntensity, 0.24),
    active: appCtx.boatMode?.active || config.localPatch === true,
    energyScale: Number.isFinite(config.energyBase) ? config.energyBase : 1
  });
  const time = Number.isFinite(timeOverride) ? Number(timeOverride) : performance.now() * 0.001;
  return { config, profile, time };
}

function applyWaveUniformsToMaterial(material, profileBundle) {
  const shader = material?.userData?.weWaterWaveShader;
  if (!shader?.uniforms) return false;
  const { config, profile, time } = profileBundle;
  shader.uniforms.weWaveTime.value = time;
  shader.uniforms.weWaveSpeed.value = profile.speed;
  shader.uniforms.weWaveAmplitude.value = profile.primaryAmplitude * (Number(config.waveBase) || 1);
  if (shader.uniforms.weWaveSecondaryAmplitude) {
    shader.uniforms.weWaveSecondaryAmplitude.value = profile.secondaryAmplitude * (Number(config.waveBase) || 1);
  }
  if (shader.uniforms.weWaveSwellAmplitude) {
    shader.uniforms.weWaveSwellAmplitude.value = profile.swellAmplitude * (Number(config.waveBase) || 1);
  }
  if (shader.uniforms.weWaveRippleAmplitude) {
    shader.uniforms.weWaveRippleAmplitude.value = profile.rippleAmplitude * (Number(config.waveBase) || 1);
  }
  if (shader.uniforms.weWaveVisualStrength) {
    shader.uniforms.weWaveVisualStrength.value = profile.visualStrength * (Number(config.visualBase) || 1);
  }
  if (shader.uniforms.weWaveFoamStrength) {
    shader.uniforms.weWaveFoamStrength.value = (profile.foamStrength + profile.whitecapStrength * 0.4) * (Number(config.foamBase) || 1);
  }
  return true;
}

function refreshBoatWaterPatchUniforms(timeOverride = null) {
  const patchMaterial = appCtx.boatMode?.waterPatch?.material || null;
  if (!patchMaterial) return false;
  const bundle = buildBoatWaveProfile(patchMaterial, getWaveIntensity(), timeOverride);
  if (!applyWaveUniformsToMaterial(patchMaterial, bundle)) {
    patchMaterial.needsUpdate = true;
    return false;
  }
  updateBoatPatchWakeUniforms(bundle.profile);
  return true;
}

function updateBoatSurfaceEffects(profile, dt, centerMotion, speedNorm, bowAverage, sternAverage) {
  const forwardX = Math.sin(appCtx.boat.angle || 0);
  const forwardZ = Math.cos(appCtx.boat.angle || 0);
  const waveDirX = Number(centerMotion?.directionX || appCtx.boatMode.waveDirectionX || 0);
  const waveDirZ = Number(centerMotion?.directionZ || appCtx.boatMode.waveDirectionZ || 1);
  const waveAlignment = clamp(forwardX * waveDirX + forwardZ * waveDirZ, -1, 1);
  const intoWave = clamp(-waveAlignment, 0, 1);
  const followingSea = clamp(waveAlignment, 0, 1);
  const bowRiseTarget = clamp((sternAverage - bowAverage) * 0.28 + speedNorm * 0.1 + intoWave * 0.06, -0.14, 0.3);
  const wakeTarget = clamp(speedNorm * 1.04 + Math.abs(appCtx.boat.turnRate || 0) * 0.48 + profile.foamStrength * 0.22, 0, 2.2);
  const wakeSpreadTarget = clamp(0.46 + speedNorm * 0.6 + profile.offshoreBlend * 0.3, 0.32, 1.72);
  const bowWaveTarget = clamp(0.22 + speedNorm * 0.82 + intoWave * 0.42 + profile.breakerStrength * 0.18, 0, 2.2);
  const slamTarget = clamp(
    Math.max(0, -appCtx.boat.verticalVelocity * 0.52) +
    intoWave * (0.26 + profile.breakerStrength * 0.4) +
    Math.abs(appCtx.boat.pitch) * 0.98,
    0,
    2.1
  );
  const bowSplashTarget = clamp(bowWaveTarget * (0.62 + slamTarget * 0.58), 0, 2.6);
  const sternFoamTarget = clamp(wakeTarget * (0.66 + Math.abs(appCtx.boat.turnRate || 0) * 0.22 + followingSea * 0.1), 0, 2.2);
  const alpha = clamp((dt > 0 ? dt : 1 / 60) * (profile.waterKind === 'harbor' ? 4.6 : 3.6), 0.06, 0.24);
  appCtx.boat.bowLift += (bowRiseTarget - appCtx.boat.bowLift) * alpha;
  appCtx.boatMode.wakeStrength += (wakeTarget - appCtx.boatMode.wakeStrength) * alpha;
  appCtx.boatMode.wakeSpread += (wakeSpreadTarget - appCtx.boatMode.wakeSpread) * alpha;
  appCtx.boatMode.bowWaveStrength += (bowWaveTarget - appCtx.boatMode.bowWaveStrength) * alpha;
  appCtx.boatMode.bowSplashStrength += (bowSplashTarget - appCtx.boatMode.bowSplashStrength) * alpha;
  appCtx.boatMode.sternFoamStrength += (sternFoamTarget - appCtx.boatMode.sternFoamStrength) * alpha;
  appCtx.boatMode.slamStrength += (slamTarget - appCtx.boatMode.slamStrength) * alpha;
}

function updateBoatPatchWakeUniforms(profile = null) {
  const shader = appCtx.boatMode?.waterPatch?.material?.userData?.weWaterWaveShader;
  if (!shader?.uniforms?.weBoatPos || typeof THREE === 'undefined') return false;
  const forwardX = Math.sin(appCtx.boat.angle || 0);
  const forwardZ = Math.cos(appCtx.boat.angle || 0);
  const speedNorm = clamp(Math.abs(appCtx.boat.forwardSpeed || appCtx.boat.speed || 0) / Math.max(1, getSeaStateConfig().speedMax || 1), 0, 1.6);
  shader.uniforms.weBoatPos.value.set(appCtx.boat.x, appCtx.boat.z);
  shader.uniforms.weBoatForward.value.set(forwardX, forwardZ);
  shader.uniforms.weBoatWakeStrength.value = Number(appCtx.boatMode.wakeStrength || 0);
  shader.uniforms.weBoatWakeSpread.value = Number(appCtx.boatMode.wakeSpread || 0);
  shader.uniforms.weBoatBowWave.value = Number(appCtx.boatMode.bowWaveStrength || 0);
  shader.uniforms.weBoatBowSplash.value = Number(appCtx.boatMode.bowSplashStrength || 0);
  shader.uniforms.weBoatSternFoam.value = Number(appCtx.boatMode.sternFoamStrength || 0);
  shader.uniforms.weBoatWaveSeverity.value = clamp(
    Number(profile?.breakerStrength || 0) + speedNorm * 0.28 + Number(appCtx.boatMode.slamStrength || 0) * 0.4,
    0,
    2.5
  );
  return true;
}

function syncBoatTerrainSuppression() {
  const active = !!appCtx.boatMode?.active;
  const shoreline = Number(appCtx.boatMode?.shorelineDistance || 0);
  const waterKind = String(appCtx.boatMode?.waterKind || '').toLowerCase();
  const offshore = Math.max(
    shoreline,
    Number(appCtx.boatMode?.offshoreDistance || 0)
  );
  const farOffshoreWater =
    active &&
    offshore > 160 &&
    (waterKind === 'open_ocean' || waterKind === 'coastal');
  const terrainRadius = active ?
    farOffshoreWater ? clamp(offshore * 4.2, 900, 5600) :
    waterKind === 'open_ocean' ? clamp(offshore * 0.68, 120, 320) :
    waterKind === 'coastal' ? clamp(offshore * 0.54, 80, 210) :
    waterKind === 'lake' ? clamp(offshore * 0.44, 54, 150) :
    0 :
    0;
  const clutterRadius = active ?
    farOffshoreWater ? clamp(offshore * 4.5, 1080, 6200) :
    waterKind === 'open_ocean' ? clamp(offshore * 0.92, 160, 460) :
    waterKind === 'coastal' ? clamp(offshore * 0.7, 110, 300) :
    0 :
    0;
  const hideVegetation = active && (
    farOffshoreWater ? true :
    waterKind === 'open_ocean' ? offshore > 34 :
    waterKind === 'coastal' ? offshore > 86 :
    false
  );

  const terrainMeshes = Array.isArray(appCtx.terrainGroup?.children) ? appCtx.terrainGroup.children : [];
  const urbanSurfaceMeshes = Array.isArray(appCtx.urbanSurfaceMeshes) ? appCtx.urbanSurfaceMeshes : [];
  const landuseMeshes = Array.isArray(appCtx.landuseMeshes) ? appCtx.landuseMeshes : [];
  const streetFurnitureMeshes = Array.isArray(appCtx.streetFurnitureMeshes) ? appCtx.streetFurnitureMeshes : [];
  const vegetationMeshes = Array.isArray(appCtx.vegetationMeshes) ? appCtx.vegetationMeshes : [];
  const linearFeatureMeshes = Array.isArray(appCtx.linearFeatureMeshes) ? appCtx.linearFeatureMeshes : [];

  const clearSuppression = (mesh, restoreVisible = true) => {
    if (!mesh?.userData?.boatSuppressed) return;
    mesh.userData.boatSuppressed = false;
    if (restoreVisible) mesh.visible = true;
  };
  const meshCenterXZ = (mesh) => {
    if (!mesh) return null;
    const furniturePos = mesh.userData?.furniturePos;
    if (furniturePos && Number.isFinite(furniturePos.x) && Number.isFinite(furniturePos.z)) {
      return { x: furniturePos.x, z: furniturePos.z };
    }
    const geom = mesh.geometry;
    if (geom) {
      if (!geom.boundingSphere) geom.computeBoundingSphere();
      if (geom.boundingSphere) {
        const center = geom.boundingSphere.center.clone();
        mesh.localToWorld(center);
        if (Number.isFinite(center.x) && Number.isFinite(center.z)) {
          return { x: center.x, z: center.z };
        }
      }
    }
    if (mesh.position && Number.isFinite(mesh.position.x) && Number.isFinite(mesh.position.z)) {
      return { x: mesh.position.x, z: mesh.position.z };
    }
    return null;
  };
  const meshRadius = (mesh) => {
    const geom = mesh?.geometry;
    if (geom && !geom.boundingSphere) geom.computeBoundingSphere();
    return Number(geom?.boundingSphere?.radius || 0);
  };
  const overlapSuppressed = (mesh, radius) => {
    const center = meshCenterXZ(mesh);
    if (!center || radius <= 0) return false;
    const dx = center.x - appCtx.boat.x;
    const dz = center.z - appCtx.boat.z;
    const overlapRadius = radius + meshRadius(mesh);
    return dx * dx + dz * dz <= overlapRadius * overlapRadius;
  };
  const isWaterSurfaceMesh = (mesh) => {
    if (!mesh) return false;
    if (mesh.userData?.isWaterwayLine) return true;
    const landuseType = String(mesh.userData?.landuseType || '').toLowerCase();
    const surfaceVariant = String(mesh.userData?.surfaceVariant || '').toLowerCase();
    return landuseType === 'water' || surfaceVariant === 'water' || surfaceVariant === 'ice';
  };

  for (let i = 0; i < terrainMeshes.length; i++) {
    const mesh = terrainMeshes[i];
    if (!mesh) continue;
    if (!active || terrainRadius <= 0) {
      clearSuppression(mesh, true);
      continue;
    }
    const suppressed = overlapSuppressed(mesh, terrainRadius);
    mesh.userData.boatSuppressed = suppressed;
    mesh.visible = !suppressed;
  }

  for (let i = 0; i < landuseMeshes.length; i++) {
    const mesh = landuseMeshes[i];
    if (!mesh) continue;
    if (!active || clutterRadius <= 0 || isWaterSurfaceMesh(mesh)) {
      clearSuppression(mesh, mesh.userData?.alwaysVisible || !!appCtx.landUseVisible);
      continue;
    }
    const suppressed = overlapSuppressed(mesh, clutterRadius);
    mesh.userData.boatSuppressed = suppressed;
    if (suppressed) mesh.visible = false;
  }

  for (let i = 0; i < urbanSurfaceMeshes.length; i++) {
    const mesh = urbanSurfaceMeshes[i];
    if (!mesh) continue;
    if (!active || clutterRadius <= 0) {
      clearSuppression(mesh, true);
      continue;
    }
    const suppressed = overlapSuppressed(mesh, clutterRadius * 0.9);
    mesh.userData.boatSuppressed = suppressed;
    if (suppressed) mesh.visible = false;
  }

  for (let i = 0; i < linearFeatureMeshes.length; i++) {
    const mesh = linearFeatureMeshes[i];
    if (!mesh) continue;
    if (!active || clutterRadius <= 0) {
      clearSuppression(mesh, appCtx.showPathOverlays !== false);
      continue;
    }
    const suppressed = overlapSuppressed(mesh, clutterRadius * 0.88);
    mesh.userData.boatSuppressed = suppressed;
    if (suppressed) mesh.visible = false;
  }

  for (let i = 0; i < streetFurnitureMeshes.length; i++) {
    const mesh = streetFurnitureMeshes[i];
    if (!mesh) continue;
    if (!active || clutterRadius <= 0) {
      clearSuppression(mesh, true);
      continue;
    }
    const suppressed = overlapSuppressed(mesh, clutterRadius * 0.72);
    mesh.userData.boatSuppressed = suppressed;
    if (suppressed) mesh.visible = false;
  }

  for (let i = 0; i < vegetationMeshes.length; i++) {
    const mesh = vegetationMeshes[i];
    if (!mesh) continue;
    if (!hideVegetation) {
      clearSuppression(mesh, true);
      continue;
    }
    mesh.userData.boatSuppressed = true;
    mesh.visible = false;
  }
  return true;
}

function applyBoatWavePose(x, z, angle, candidate = null, dt = 0, forceSnap = false) {
  const time = performance.now() * 0.001;
  const profile = getBoatWaveProfile(candidate);
  const baseCenterY = waterSurfaceBaseYAt(x, z, candidate);
  const speedNorm = clamp(
    Math.abs(appCtx.boat.forwardSpeed || appCtx.boat.speed || 0) / Math.max(1, getSeaStateConfig().speedMax || 1),
    0,
    1.4
  );
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);
  const sampleOffsets = [
    { forward: 0, side: 0, weight: 2.2, zone: 'center' },
    { forward: 4.9, side: 0, weight: 1.28, zone: 'bow' },
    { forward: 6.4, side: 0.98, weight: 0.92, zone: 'bow' },
    { forward: 6.4, side: -0.98, weight: 0.92, zone: 'bow' },
    { forward: 3.1, side: 1.78, weight: 0.94, zone: 'port' },
    { forward: 3.1, side: -1.78, weight: 0.94, zone: 'starboard' },
    { forward: 0.2, side: 1.96, weight: 0.88, zone: 'port' },
    { forward: 0.2, side: -1.96, weight: 0.88, zone: 'starboard' },
    { forward: -2.85, side: 1.58, weight: 0.82, zone: 'port' },
    { forward: -2.85, side: -1.58, weight: 0.82, zone: 'starboard' },
    { forward: -4.8, side: 0, weight: 1.14, zone: 'stern' },
    { forward: -3.45, side: 1.08, weight: 0.78, zone: 'stern' },
    { forward: -3.45, side: -1.08, weight: 0.78, zone: 'stern' }
  ];

  let weightedSurfaceY = 0;
  let totalWeight = 0;
  let bowSurface = 0;
  let bowWeight = 0;
  let sternSurface = 0;
  let sternWeight = 0;
  let portSurface = 0;
  let portWeight = 0;
  let starboardSurface = 0;
  let starboardWeight = 0;
  let maxSurfaceY = -Infinity;
  let bowPeakSurface = -Infinity;
  let sternPeakSurface = -Infinity;
  let normalX = 0;
  let normalY = 0;
  let normalZ = 0;
  let steepnessWeighted = 0;
  let centerMotion = null;

  for (let i = 0; i < sampleOffsets.length; i++) {
    const offset = sampleOffsets[i];
    const sampleX = x + sinA * offset.forward + cosA * offset.side;
    const sampleZ = z + cosA * offset.forward - sinA * offset.side;
    const sample = sampleDynamicWaterAt(sampleX, sampleZ, candidate, { time, profile });

    weightedSurfaceY += sample.surfaceY * offset.weight;
    totalWeight += offset.weight;
    if (sample.surfaceY > maxSurfaceY) maxSurfaceY = sample.surfaceY;
    if (offset.zone === 'bow' && sample.surfaceY > bowPeakSurface) bowPeakSurface = sample.surfaceY;
    if (offset.zone === 'stern' && sample.surfaceY > sternPeakSurface) sternPeakSurface = sample.surfaceY;
    const sampleNormal = surfaceNormalFromMotion(sample.motion);
    normalX += sampleNormal.x * offset.weight;
    normalY += sampleNormal.y * offset.weight;
    normalZ += sampleNormal.z * offset.weight;
    steepnessWeighted += sampleNormal.steepness * offset.weight;
    if (offset.zone === 'center') centerMotion = sample.motion;
    if (offset.zone === 'bow') {
      bowSurface += sample.surfaceY * offset.weight;
      bowWeight += offset.weight;
    } else if (offset.zone === 'stern') {
      sternSurface += sample.surfaceY * offset.weight;
      sternWeight += offset.weight;
    } else if (offset.zone === 'port') {
      portSurface += sample.surfaceY * offset.weight;
      portWeight += offset.weight;
    } else if (offset.zone === 'starboard') {
      starboardSurface += sample.surfaceY * offset.weight;
      starboardWeight += offset.weight;
    }
  }

  const averageSurfaceY = totalWeight > 0 ? weightedSurfaceY / totalWeight : waterSurfaceYAt(x, z, candidate, { time, profile });
  const bowAverage = bowWeight > 0 ? bowSurface / bowWeight : averageSurfaceY;
  const sternAverage = sternWeight > 0 ? sternSurface / sternWeight : averageSurfaceY;
  const portAverage = portWeight > 0 ? portSurface / portWeight : averageSurfaceY;
  const starboardAverage = starboardWeight > 0 ? starboardSurface / starboardWeight : averageSurfaceY;
  const normalLen = Math.hypot(normalX, normalY, normalZ) || 1;
  const blendedNormal = {
    x: normalX / normalLen,
    y: normalY / normalLen,
    z: normalZ / normalLen
  };
  const steepness = totalWeight > 0 ? steepnessWeighted / totalWeight : 0;

  const pitchDelta = bowAverage - sternAverage;
  const rollDelta = portAverage - starboardAverage;
  const waveDirectionX = Number(centerMotion?.directionX || 0);
  const waveDirectionZ = Number(centerMotion?.directionZ || 1);
  const waveAlignment = clamp(sinA * waveDirectionX + cosA * waveDirectionZ, -1, 1);
  const intoWave = clamp(-waveAlignment, 0, 1);
  const followingSea = clamp(waveAlignment, 0, 1);
  const heaveBoost = 1 + profile.breakerStrength * 0.46 + speedNorm * 0.18;
  const bowDipAssist = clamp(
    (sternAverage - bowAverage) * (0.078 + intoWave * 0.132 + profile.breakerStrength * 0.034),
    0,
    0.28
  );
  const planingTrim = clamp(speedNorm * 0.02 + intoWave * 0.038 - followingSea * 0.012, -0.026, 0.072);
  const crestBias = Math.max(0, (Number.isFinite(maxSurfaceY) ? maxSurfaceY : averageSurfaceY) - averageSurfaceY);
  const prevHeave = appCtx.boat.heave;
  let normalPitch = Math.atan2(
    -((blendedNormal.x * sinA) + (blendedNormal.z * cosA)),
    Math.max(0.42, blendedNormal.y)
  );
  let normalRoll = Math.atan2(
    -((blendedNormal.x * cosA) - (blendedNormal.z * sinA)),
    Math.max(0.42, blendedNormal.y)
  );
  if (pitchDelta * normalPitch < 0) normalPitch *= -1;
  if (rollDelta * normalRoll < 0) normalRoll *= -1;
  const samplePitch = Math.atan2(
    pitchDelta * profile.pitchScale * (1.22 + speedNorm * 0.34 + profile.breakerStrength * 0.28 + intoWave * 0.56),
    Math.max(3.4, 4.9 - intoWave * 1.0 - profile.breakerStrength * 0.64)
  );
  const sampleRoll = Math.atan2(
    rollDelta * profile.rollScale * (1.06 + profile.breakerStrength * 0.26 + steepness * 0.08),
    2.38
  );
  const targetPitch = clamp(
    samplePitch * 0.9 +
    normalPitch * (0.72 + profile.breakerStrength * 0.14 + speedNorm * 0.1) +
    bowDipAssist +
    planingTrim,
    -0.62,
    0.68
  );
  const targetRoll = clamp(
    sampleRoll * 0.82 +
    normalRoll * (0.6 + profile.breakerStrength * 0.12 + steepness * 0.05) -
    (appCtx.boat.turnRate || 0) * Math.min(0.28, 0.12 + speedNorm * 0.14),
    -0.58,
    0.58
  );
  const targetHeave =
    (averageSurfaceY - baseCenterY) * heaveBoost +
    crestBias * (0.22 + intoWave * 0.14 + profile.breakerStrength * 0.1) +
    steepness * (0.06 + profile.breakerStrength * 0.024);
  const sampledMaxSurfaceY = Number.isFinite(maxSurfaceY) ? maxSurfaceY : averageSurfaceY;
  appCtx.boatMode.waveDirectionX = waveDirectionX;
  appCtx.boatMode.waveDirectionZ = waveDirectionZ;
  appCtx.boat.surfaceSteepness = steepness;
  appCtx.boat.surfaceNormalX = blendedNormal.x;
  appCtx.boat.surfaceNormalY = blendedNormal.y;
  appCtx.boat.surfaceNormalZ = blendedNormal.z;

  if (forceSnap || !Number.isFinite(dt) || dt <= 0) {
    appCtx.boat.heave = targetHeave;
    appCtx.boat.pitch = targetPitch;
    appCtx.boat.roll = targetRoll;
    appCtx.boat.heaveVelocity = 0;
    appCtx.boat.pitchVelocity = 0;
    appCtx.boat.rollVelocity = 0;
  } else {
    const heaveSpring =
      candidate?.waterKind === 'harbor' || candidate?.waterKind === 'channel' ? 18.6 :
      candidate?.waterKind === 'lake' ? 16.8 :
      candidate?.waterKind === 'open_ocean' ? 13.4 : 15.2;
    const heaveDamping =
      candidate?.waterKind === 'open_ocean' ? 4.6 :
      candidate?.waterKind === 'lake' ? 6.2 :
      6.8;
    const pitchSpring =
      candidate?.waterKind === 'harbor' || candidate?.waterKind === 'channel' ? 14.4 :
      candidate?.waterKind === 'open_ocean' ? 13.4 + intoWave * 3.2 :
      13.5 + intoWave * 1.6;
    const pitchDamping =
      candidate?.waterKind === 'open_ocean' ? 4.1 :
      5.6;
    const rollSpring =
      candidate?.waterKind === 'harbor' || candidate?.waterKind === 'channel' ? 11.8 :
      candidate?.waterKind === 'open_ocean' ? 10.6 :
      10.8;
    const rollDamping =
      candidate?.waterKind === 'open_ocean' ? 3.4 :
      4.8;
    const nextHeave = stepBoatSpring(
      appCtx.boat.heave,
      appCtx.boat.heaveVelocity,
      targetHeave,
      dt,
      heaveSpring,
      heaveDamping,
      8.2
    );
    const nextPitch = stepBoatSpring(
      appCtx.boat.pitch,
      appCtx.boat.pitchVelocity,
      targetPitch,
      dt,
      pitchSpring,
      pitchDamping,
      2.1
    );
    const nextRoll = stepBoatSpring(
      appCtx.boat.roll,
      appCtx.boat.rollVelocity,
      targetRoll,
      dt,
      rollSpring,
      rollDamping,
      1.8
    );
    appCtx.boat.heave = nextHeave.value;
    appCtx.boat.heaveVelocity = nextHeave.velocity;
    appCtx.boat.pitch = nextPitch.value;
    appCtx.boat.pitchVelocity = nextPitch.velocity;
    appCtx.boat.roll = nextRoll.value;
    appCtx.boat.rollVelocity = nextRoll.velocity;
  }
  appCtx.boat.verticalVelocity = dt > 0 ? (appCtx.boat.heave - prevHeave) / dt : 0;
  updateBoatSurfaceEffects(profile, dt > 0 ? dt : 1 / 60, centerMotion, speedNorm, bowAverage, sternAverage);

  const buoyancyBase = 0.76 + profile.breakerStrength * 0.16;
  const hullDraft = Math.max(0.36, Number(appCtx.boatMode?.meshDraft || 0.42));
  const keelClearance = clamp(
    hullDraft * 0.56 +
    0.06 +
    profile.breakerStrength * 0.18 +
    speedNorm * 0.08 +
    steepness * 0.03,
    0.24,
    0.64
  );
  const rotationClearance = Math.abs(appCtx.boat.pitch) * 0.72 + Math.abs(appCtx.boat.roll) * 0.46;
  const bowClearance = Math.max(0, (Number.isFinite(bowPeakSurface) ? bowPeakSurface : sampledMaxSurfaceY) - sampledMaxSurfaceY) * 0.26;
  const visualFreeboard = 0.08;
  const staticWaterFloor = baseCenterY + clamp(0.14 + profile.breakerStrength * 0.08 + speedNorm * 0.04, 0.14, 0.28);
  const targetBoatY = baseCenterY + buoyancyBase + appCtx.boat.heave;
  const hullFloorY =
    Math.max(
      sampledMaxSurfaceY,
      Number.isFinite(bowPeakSurface) ? bowPeakSurface : sampledMaxSurfaceY,
      Number.isFinite(sternPeakSurface) ? sternPeakSurface : sampledMaxSurfaceY,
      staticWaterFloor
    ) +
    keelClearance +
    rotationClearance +
    bowClearance +
    visualFreeboard;
  appCtx.boat.y = Math.max(targetBoatY, hullFloorY);
}

function setBoatActorPose(x, z, angle, candidate = null, options = {}) {
  appCtx.boat.x = x;
  appCtx.boat.z = z;
  appCtx.boat.angle = angle;
  applyBoatWavePose(x, z, angle, candidate, Number(options.dt) || 0, options.forceSnap === true);
  appCtx.car.x = x;
  appCtx.car.z = z;
  appCtx.car.y = appCtx.boat.y;
  appCtx.car.angle = angle;
  appCtx.car.onRoad = false;
  appCtx.car.road = null;
}

function createBoatMesh() {
  if (_boatMeshReady || typeof THREE === 'undefined' || !appCtx.scene) return;
  const group = new THREE.Group();
  group.name = 'BoatModeMesh';

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x0f3a4f, roughness: 0.72, metalness: 0.12 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45, metalness: 0.08 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xd94660, roughness: 0.5, metalness: 0.08 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 8.4), hullMat);
  hull.position.y = 0.45;
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.28, 2.85, 6), hullMat);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.z = Math.PI;
  bow.position.set(0, 0.94, 5.15);
  bow.castShadow = true;
  group.add(bow);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 4.8), trimMat);
  deck.position.set(0, 1.02, 0.4);
  group.add(deck);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.2, 2.1), trimMat);
  cabin.position.set(0, 1.76, -0.5);
  cabin.castShadow = true;
  group.add(cabin);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 5.2), accentMat);
  stripe.position.set(0, 0.96, 0.75);
  group.add(stripe);

  group.traverse((child) => {
    if (!child?.isMesh) return;
    child.renderOrder = 8;
  });

  group.visible = false;
  appCtx.scene.add(group);
  if (typeof THREE.Box3 === 'function') {
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    if (Number.isFinite(bounds.min.y)) {
      appCtx.boatMode.meshDraft = Math.max(0.36, -bounds.min.y);
    }
  }
  appCtx.boatMode.mesh = group;
  _boatMeshReady = true;
}

function updateBoatMesh() {
  if (!_boatMeshReady) createBoatMesh();
  const mesh = appCtx.boatMode?.mesh;
  if (!mesh) return;
  mesh.visible = !!appCtx.boatMode?.active;
  if (!mesh.visible) return;
  mesh.position.set(appCtx.boat.x, appCtx.boat.y, appCtx.boat.z);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = appCtx.boat.angle;
  mesh.rotation.x = appCtx.boat.pitch;
  mesh.rotation.z = appCtx.boat.roll;
}

function updateBoatLodBias() {
  const shoreline = Number.isFinite(appCtx.boatMode?.shorelineDistance) ? appCtx.boatMode.shorelineDistance : 0;
  const waterKind = String(appCtx.boatMode?.waterKind || '').toLowerCase();
  let detailBias = 1;
  if (waterKind === 'harbor' || waterKind === 'channel') {
    if (shoreline > 420) detailBias = 0.78;
    else if (shoreline > 180) detailBias = 0.9;
  } else if (waterKind === 'lake' || waterKind === 'coastal') {
    if (shoreline > 620) detailBias = 0.58;
    else if (shoreline > 300) detailBias = 0.72;
    else if (shoreline > 140) detailBias = 0.86;
  } else if (waterKind === 'open_ocean') {
    if (shoreline > 1200) detailBias = 0.34;
    else if (shoreline > 760) detailBias = 0.44;
    else if (shoreline > 420) detailBias = 0.58;
    else if (shoreline > 180) detailBias = 0.76;
  } else if (shoreline > 420) {
    detailBias = 0.52;
  } else if (shoreline > 220) {
    detailBias = 0.68;
  } else if (shoreline > 90) {
    detailBias = 0.84;
  }
  appCtx.boatMode.detailBias = detailBias;
}

function maybeBootstrapBoatWater(force = false) {
  const waterCount =
    (Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas.length : 0) +
    (Array.isArray(appCtx.waterways) ? appCtx.waterways.length : 0);
  if (waterCount > 0) return null;
  if (typeof appCtx.ensureWaterRuntimeCoverage !== 'function') return null;
  if (appCtx.boatMode?._waterBootstrapPromise) return appCtx.boatMode._waterBootstrapPromise;

  const waterSignals = appCtx.worldSurfaceProfile?.signals?.normalized || {};
  const likelyWaterNearby =
    force ||
    appCtx.boatMode?.active === true ||
    appCtx.oceanMode?.active === true ||
    Number(waterSignals.water || 0) >= 0.02 ||
    Number(waterSignals.explicitBlue || 0) >= 0.015;
  if (!likelyWaterNearby) return null;

  appCtx.boatMode._waterBootstrapPromise = Promise.resolve(
    appCtx.ensureWaterRuntimeCoverage({
      force: true,
      injectFallback: false,
      showStatus: false,
      updateLod: true,
      reason: 'boat_runtime_bootstrap'
    })
  ).catch((error) => {
    console.warn('[BoatMode] water bootstrap failed', error);
  }).finally(() => {
    appCtx.boatMode._waterBootstrapPromise = null;
    window.setTimeout(() => {
      try {
        syncBoatPromptState(true);
      } catch {}
    }, 0);
  });
  return appCtx.boatMode._waterBootstrapPromise;
}

function syncBoatPromptState(force = false) {
  ensureBoatPromptRefs();
  syncWaterMeshCache();

  if (!appCtx.gameStarted || appCtx.onMoon || appCtx.travelingToMoon || appCtx.spaceFlight?.active) {
    appCtx.boatMode.available = false;
    appCtx.boatMode.candidate = null;
    _boatPromptSignature = '';
    hideBoatPrompt();
    updateBoatMenuUi();
    return null;
  }

  if (appCtx.oceanMode?.active) {
    appCtx.boatMode.available = false;
    appCtx.boatMode.candidate = null;
    updateBoatMenuUi();
    const promptSignature = 'ocean_surface_transfer';
    if (force || _boatPromptSignature !== promptSignature) {
      _boatPromptSignature = promptSignature;
      showBoatPrompt('Surface Boat Available • Press G or choose Surface Boat', 'supported', BOAT_PROMPT_DURATION_MS);
    }
    return null;
  }

  if (appCtx.boatMode?.active) {
    updateBoatMenuUi();
    const shoreline = Number.isFinite(appCtx.boatMode.shorelineDistance) ? Math.round(appCtx.boatMode.shorelineDistance) : null;
    const message =
      shoreline && shoreline < 90 ?
        `Boat Mode Active • Press G or choose Exit Boat to dock • ${shoreline}m to shore` :
        'Boat Mode Active • Press G or choose Exit Boat to dock';
    const promptSignature = `active:${message}`;
    if (force || _boatPromptSignature !== promptSignature) {
      _boatPromptSignature = promptSignature;
      showBoatPrompt(message, 'active', BOAT_PROMPT_DURATION_MS);
    }
    return appCtx.boatMode.currentWater || null;
  }

  if (appCtx.droneMode || appCtx.activeInterior || !appCtx.isEnv?.(appCtx.ENV.EARTH)) {
    appCtx.boatMode.available = false;
    appCtx.boatMode.candidate = null;
    _boatPromptSignature = '';
    hideBoatPrompt();
    updateBoatMenuUi();
    return null;
  }

  const ref = getReferencePosition();
  if (!ref) {
    hideBoatPrompt();
    updateBoatMenuUi();
    return null;
  }
  const waterBootstrapPromise = maybeBootstrapBoatWater(force);
  const waterSignature = `${Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas.length : 0}:${Array.isArray(appCtx.waterways) ? appCtx.waterways.length : 0}`;
  const cachedProbe = appCtx.boatMode?._candidateProbe || null;
  let candidate = null;
  if (
    !force &&
    cachedProbe &&
    cachedProbe.waterSignature === waterSignature &&
    cachedProbe.mode === ref.mode
  ) {
    const dx = ref.x - Number(cachedProbe.x || 0);
    const dz = ref.z - Number(cachedProbe.z || 0);
    const reuseDistance =
      cachedProbe.candidate ?
        18 :
        10;
    if (dx * dx + dz * dz <= reuseDistance * reuseDistance) {
      candidate = cachedProbe.candidate || null;
    }
  }
  if (!candidate) {
    candidate = findNearestBoatCandidate(ref.x, ref.z);
    appCtx.boatMode._candidateProbe = {
      x: ref.x,
      z: ref.z,
      mode: ref.mode,
      waterSignature,
      candidate
    };
  }
  appCtx.boatMode.candidate = candidate;
  appCtx.boatMode.available = !!candidate;
  if (candidate) {
    appCtx.boatMode.promptLabel = candidate.label;
    appCtx.boatMode.promptMessage = `Boat Travel Available • ${candidate.label} • Press G or choose Boat Mode`;
    const promptSignature = `candidate:${candidate.type}:${candidate.label}:${Math.round(candidate.spawnX * 2)}:${Math.round(candidate.spawnZ * 2)}`;
    if (force || _boatPromptSignature !== promptSignature) {
      _boatPromptSignature = promptSignature;
      showBoatPrompt(appCtx.boatMode.promptMessage, 'supported', BOAT_PROMPT_DURATION_MS);
    }
  } else {
    if (force && waterBootstrapPromise && typeof waterBootstrapPromise.then === 'function') {
      return waterBootstrapPromise.then(() => syncBoatPromptState(true)).catch(() => null);
    }
    _boatPromptSignature = '';
    hideBoatPrompt();
  }
  updateBoatMenuUi();
  if (force && typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
  return candidate;
}

function canExitBoatMode(targetMode = 'walk', options = {}) {
  if (!appCtx.boatMode?.active) return true;
  const maxShoreline = targetMode === 'drive' ? BOAT_EXIT_MAX_SHORELINE_DRIVE : BOAT_EXIT_MAX_SHORELINE_WALK;
  const shoreline = Number(appCtx.boatMode?.shorelineDistance || 0);
  if (Number.isFinite(shoreline) && shoreline <= maxShoreline) return true;
  if (options.showNotice !== false) {
    _boatPromptSignature = `blocked_exit:${targetMode}`;
    showBoatPrompt('Move closer to shore before leaving Boat Mode', 'notice', BOAT_PROMPT_DURATION_MS);
  }
  updateBoatMenuUi();
  return false;
}

async function transferSubmarineToBoat(options = {}) {
  if (!appCtx.oceanMode?.active) return false;
  const launchSite = appCtx.oceanMode?.launchSite || {};
  const sub = appCtx.oceanMode?.submarine || {};
  if (!Number.isFinite(sub?.position?.x) || !Number.isFinite(sub?.position?.z) || !Number.isFinite(launchSite.lat) || !Number.isFinite(launchSite.lon)) {
    showBoatPrompt('Could not resolve submarine position for boat transfer', 'notice', BOAT_PROMPT_DURATION_MS);
    return false;
  }
  const lonDenom = appCtx.SCALE * Math.cos(launchSite.lat * Math.PI / 180);
  const lat = launchSite.lat - sub.position.z / appCtx.SCALE;
  const lon = launchSite.lon + sub.position.x / (Math.abs(lonDenom) > 0.0001 ? lonDenom : appCtx.SCALE);
  const customName = `${launchSite.name || 'Ocean Site'} Surface`;
  const customLatInput = document.getElementById('customLat');
  const customLonInput = document.getElementById('customLon');
  if (customLatInput) customLatInput.value = lat.toFixed(6);
  if (customLonInput) customLonInput.value = lon.toFixed(6);

  appCtx.customLoc = { lat, lon, name: customName };
  appCtx.customLocTransient = false;
  appCtx.selLoc = 'custom';

  _boatPromptSignature = 'submarine_transfer';
  showBoatPrompt('Switching from submarine to surface boat…', 'supported', BOAT_PROMPT_DURATION_MS);

  try {
    if (typeof appCtx.stopOceanMode === 'function') appCtx.stopOceanMode();
    if (typeof appCtx.showTransitionLoad === 'function') {
      await appCtx.showTransitionLoad('earth', 700);
    }
    if (typeof appCtx.loadRoads === 'function') {
      await appCtx.loadRoads();
    }
    if (typeof appCtx.applyCustomLocationSpawn === 'function') {
      appCtx.applyCustomLocationSpawn('walk', {
        source: 'submarine_transfer_spawn',
        preferBoatIfWater: true,
        allowSyntheticWater: true,
        waterKind: 'open_ocean'
      });
    }
    if (appCtx.boatMode?.active) {
      if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
      return true;
    }
    const candidate =
      findNearestBoatCandidate(0, 0, BOAT_MAX_CANDIDATE_DISTANCE * 2.2, {
        allowSynthetic: true,
        waterKind: 'open_ocean'
      }) ||
      buildSyntheticBoatCandidate(0, 0, { waterKind: 'open_ocean' });
    if (!candidate) {
      showBoatPrompt('No surface boat spawn was available here', 'notice', BOAT_PROMPT_DURATION_MS);
      return false;
    }
    const resolved = typeof appCtx.setTravelMode === 'function' ?
      appCtx.setTravelMode('boat', {
        source: options.source || 'submarine_transfer',
        force: true,
        emitTutorial: options.emitTutorial !== false,
        spawnX: Number.isFinite(candidate.spawnX) ? candidate.spawnX : 0,
        spawnZ: Number.isFinite(candidate.spawnZ) ? candidate.spawnZ : 0,
        yaw: Number.isFinite(sub.yaw) ? sub.yaw : 0,
        candidate,
        allowSynthetic: true,
        waterKind: candidate.waterKind || 'open_ocean',
        entryMode: 'walk'
      }) :
      startBoatMode({
        source: options.source || 'submarine_transfer',
        spawnX: Number.isFinite(candidate.spawnX) ? candidate.spawnX : 0,
        spawnZ: Number.isFinite(candidate.spawnZ) ? candidate.spawnZ : 0,
        yaw: Number.isFinite(sub.yaw) ? sub.yaw : 0,
        candidate,
        allowSynthetic: true,
        waterKind: candidate.waterKind || 'open_ocean',
        entryMode: 'walk'
      });
    return resolved === 'boat' || resolved === true;
  } catch (error) {
    console.warn('[BoatMode] submarine transfer failed', error);
    _boatPromptSignature = 'submarine_transfer_error';
    showBoatPrompt('Could not switch from submarine to surface boat here', 'notice', BOAT_PROMPT_DURATION_MS);
    return false;
  }
}

function startBoatMode(options = {}) {
  if (appCtx.boatMode?.active) return true;
  if (appCtx.oceanMode?.active || appCtx.onMoon || appCtx.travelingToMoon) return false;
  const baseRef = getReferencePosition();
  if (!baseRef) return false;
  const ref = {
    ...baseRef,
    x: Number.isFinite(options.spawnX) ? options.spawnX : baseRef.x,
    z: Number.isFinite(options.spawnZ) ? options.spawnZ : baseRef.z
  };
  const candidate =
    options.candidate ||
    appCtx.boatMode?.candidate ||
    findNearestBoatCandidate(ref.x, ref.z, BOAT_MAX_CANDIDATE_DISTANCE, {
      allowSynthetic: options.allowSynthetic === true,
      waterKind: options.waterKind || 'open_ocean'
    });
  if (!candidate) {
    maybeBootstrapBoatWater(true);
    return false;
  }

  const requestedEntryMode = options.entryMode === 'drive' ? 'drive' : options.entryMode === 'walk' ? 'walk' : null;
  appCtx.boatMode.lastEntryMode = requestedEntryMode || (ref.mode === 'drive' ? 'drive' : 'walk');
  appCtx.boatMode.entryPosition = {
    x: ref.x,
    z: ref.z,
    angle: ref.angle || 0
  };
  if (!Number.isFinite(appCtx.boatMode.waveIntensity)) {
    appCtx.boatMode.waveIntensity = intensityFromSeaState(appCtx.boatMode.seaState || 'moderate');
  }
  appCtx.boatMode.seaState = seaStateFromIntensity(getWaveIntensity());
  appCtx.droneMode = false;
  if (appCtx.Walk?.state?.mode === 'walk') appCtx.Walk.setModeDrive();
  if (appCtx.activeInterior && typeof appCtx.clearActiveInterior === 'function') {
    appCtx.clearActiveInterior({ restorePlayer: true, preserveCache: true });
  }
  if (typeof appCtx.updateInteriorInteraction === 'function') {
    appCtx.updateInteriorInteraction();
  }
  appCtx.boatMode.active = true;
  appCtx.boatMode.available = true;

  const startAngle = Number.isFinite(options.yaw) ?
    options.yaw :
    resolveBoatHeading(candidate, Number.isFinite(ref.angle) ? ref.angle : 0);
  const spawnPoint = resolveBoatSpawnPoint(candidate, ref.x, ref.z) || {
    x: candidate.spawnX,
    z: candidate.spawnZ,
    shorelineDistance: candidate.shorelineDistance || 0
  };
  const activeCandidate = localizeBoatCandidate(candidate, spawnPoint.shorelineDistance || candidate.shorelineDistance || 0);
  appCtx.boatMode.currentWater = activeCandidate;
  appCtx.boatMode.waterKind = activeCandidate?.waterKind || candidate.waterKind;
  appCtx.boatMode.shorelineDistance = activeCandidate?.shorelineDistance || 0;
  appCtx.boatMode.offshoreDistance = activeCandidate?.shorelineDistance || 0;
  resetBoatDynamics();
  resetBoatFoamFx();
  setBoatActorPose(spawnPoint.x, spawnPoint.z, startAngle, activeCandidate, { forceSnap: true });
  createBoatMesh();
  updateBoatWaterPatch(activeCandidate);
  updateBoatMesh();
  if (appCtx.carMesh) appCtx.carMesh.visible = false;
  if (appCtx.Walk?.state?.characterMesh) appCtx.Walk.state.characterMesh.visible = false;
  updateBoatLodBias();
  syncBoatTerrainSuppression();
  updateWaterWaveVisuals();
  updateBoatMenuUi();
  if (appCtx.camera?.userData) appCtx.camera.userData.boatrig = null;
  if (appCtx.camera?.up?.set) appCtx.camera.up.set(0, 1, 0);
  appCtx.boatMode.promptMessage = `Boat Mode Active • ${boatHudLabel()}`;
  syncBoatPromptState(false);
  if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
  if (typeof appCtx.updateWorldLod === 'function') appCtx.updateWorldLod(true);
  if (typeof appCtx.clearStarSelection === 'function') appCtx.clearStarSelection();
  return true;
}

function enterBoatAtWorldPoint(worldX, worldZ, options = {}) {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return false;
  const candidate =
    options.candidate ||
    findNearestBoatCandidate(
      worldX,
      worldZ,
      Number.isFinite(options.maxDistance) ? options.maxDistance : BOAT_MAX_CANDIDATE_DISTANCE * 1.9,
      { allowSynthetic: options.allowSynthetic === true, waterKind: options.waterKind || 'open_ocean' }
    );
  if (!candidate) {
    maybeBootstrapBoatWater(true);
    return false;
  }

  if (appCtx.boatMode?.active) {
    const yaw = Number.isFinite(options.yaw) ? options.yaw : resolveBoatHeading(candidate, appCtx.boat.angle || 0);
    const spawnPoint = resolveBoatSpawnPoint(candidate, worldX, worldZ) || {
      x: candidate.spawnX,
      z: candidate.spawnZ,
      shorelineDistance: candidate.shorelineDistance || 0
    };
    const activeCandidate = localizeBoatCandidate(candidate, spawnPoint.shorelineDistance || candidate.shorelineDistance || 0);
    appCtx.boatMode.currentWater = activeCandidate;
    appCtx.boatMode.waterKind = activeCandidate?.waterKind || candidate.waterKind;
    appCtx.boatMode.shorelineDistance = activeCandidate?.shorelineDistance || 0;
    appCtx.boatMode.offshoreDistance = activeCandidate?.shorelineDistance || 0;
    resetBoatDynamics();
    resetBoatFoamFx();
    setBoatActorPose(spawnPoint.x, spawnPoint.z, yaw, activeCandidate, { forceSnap: true });
    updateBoatWaterPatch(activeCandidate);
    updateBoatLodBias();
    syncBoatTerrainSuppression();
    updateBoatMesh();
    updateWaterWaveVisuals();
    appCtx.boatMode.promptMessage = `Boat Mode Active • ${boatHudLabel()}`;
    syncBoatPromptState(false);
    if (typeof appCtx.updateWorldLod === 'function') appCtx.updateWorldLod(true);
    return true;
  }

  if (typeof appCtx.setTravelMode === 'function') {
    return appCtx.setTravelMode('boat', {
      source: options.source || 'water_target',
      force: true,
      emitTutorial: options.emitTutorial !== false,
      spawnX: candidate.spawnX,
      spawnZ: candidate.spawnZ,
      yaw: Number.isFinite(options.yaw) ? options.yaw : undefined,
      candidate,
      allowSynthetic: options.allowSynthetic === true,
      waterKind: options.waterKind || 'open_ocean',
      entryMode: options.entryMode || 'walk'
    }) === 'boat';
  }

  return startBoatMode({
    source: options.source || 'water_target',
    spawnX: candidate.spawnX,
    spawnZ: candidate.spawnZ,
    yaw: Number.isFinite(options.yaw) ? options.yaw : undefined,
    candidate,
    allowSynthetic: options.allowSynthetic === true,
    waterKind: options.waterKind || 'open_ocean',
    entryMode: options.entryMode || 'walk'
  });
}

function stopBoatMode(options = {}) {
  if (!appCtx.boatMode?.active) return false;
  const exitMode = options.targetMode === 'drive' || appCtx.boatMode.lastEntryMode === 'drive' ? 'drive' : 'walk';
  const entry = appCtx.boatMode.entryPosition || {
    x: appCtx.boat.x,
    z: appCtx.boat.z,
    angle: appCtx.boat.angle
  };
  const currentWater = appCtx.boatMode.currentWater || appCtx.boatMode.candidate || null;
  const dockTargetX = Number.isFinite(currentWater?.entryPoint?.x) ? currentWater.entryPoint.x : entry.x;
  const dockTargetZ = Number.isFinite(currentWater?.entryPoint?.z) ? currentWater.entryPoint.z : entry.z;
  const exitModeName = exitMode === 'walk' ? 'walk' : 'drive';
  let resolvedExit = null;
  if (typeof appCtx.resolveSafeWorldSpawn === 'function') {
    resolvedExit = appCtx.resolveSafeWorldSpawn(dockTargetX, dockTargetZ, {
      mode: exitModeName,
      angle: entry.angle,
      source: 'boat_exit',
      maxRoadDistance: exitMode === 'walk' ? 140 : 260,
      maxGroundRadius: 80
    });
  }
  const nearestRoad = !resolvedExit && typeof appCtx.findNearestRoad === 'function' ? appCtx.findNearestRoad(appCtx.boat.x, appCtx.boat.z) : null;
  const exitX = resolvedExit?.x ?? nearestRoad?.pt?.x ?? entry.x;
  const exitZ = resolvedExit?.z ?? nearestRoad?.pt?.z ?? entry.z;
  const exitAngle =
    Number.isFinite(resolvedExit?.angle) ? resolvedExit.angle :
    Number.isFinite(nearestRoad?.road?.angle) ? nearestRoad.road.angle :
    entry.angle;

  appCtx.boatMode.manualExitPending = true;
  try {
    if (exitMode === 'walk' && appCtx.Walk?.state?.mode !== 'walk') {
      appCtx.Walk.setModeWalk();
    } else if (exitMode !== 'walk' && appCtx.Walk?.state?.mode === 'walk') {
      appCtx.Walk.setModeDrive();
    }
  } finally {
    appCtx.boatMode.manualExitPending = false;
  }

  appCtx.boatMode.active = false;
  appCtx.boatMode.available = false;
  appCtx.boatMode.candidate = null;
  appCtx.boatMode.currentWater = null;
  appCtx.boatMode.shorelineDistance = 0;
  appCtx.boatMode.offshoreDistance = 0;
  appCtx.boatMode.detailBias = 1;
  appCtx.boatMode.waveDirectionX = 0;
  appCtx.boatMode.waveDirectionZ = 1;
  resetBoatDynamics();
  resetBoatFoamFx();
  if (appCtx.camera?.userData) appCtx.camera.userData.boatrig = null;
  if (appCtx.camera?.up?.set) appCtx.camera.up.set(0, 1, 0);
  if (appCtx.boatMode.mesh) appCtx.boatMode.mesh.visible = false;
  if (appCtx.boatMode.waterPatch) appCtx.boatMode.waterPatch.visible = false;
  if (resolvedExit && typeof appCtx.applyResolvedWorldSpawn === 'function') {
    appCtx.applyResolvedWorldSpawn(resolvedExit, { mode: exitModeName });
  } else {
    if (exitMode === 'walk' && appCtx.Walk?.state?.walker) {
      const walker = appCtx.Walk.state.walker;
      walker.x = exitX;
      walker.z = exitZ;
      walker.y = appCtx.GroundHeight?.walkSurfaceY ? appCtx.GroundHeight.walkSurfaceY(exitX, exitZ) : appCtx.elevationWorldYAtWorldXZ(exitX, exitZ) + 1.7;
      walker.vy = 0;
      walker.angle = exitAngle;
      walker.yaw = exitAngle;
      if (appCtx.Walk.state.characterMesh) {
        appCtx.Walk.state.characterMesh.position.set(walker.x, walker.y - 1.7, walker.z);
        appCtx.Walk.state.characterMesh.rotation.y = exitAngle;
        appCtx.Walk.state.characterMesh.visible = true;
      }
    }

    appCtx.car.x = exitX;
    appCtx.car.z = exitZ;
    appCtx.car.angle = exitAngle;
    appCtx.car.speed = 0;
    appCtx.car.vx = 0;
    appCtx.car.vz = 0;
    appCtx.car.y = (appCtx.GroundHeight?.roadSurfaceY ? appCtx.GroundHeight.roadSurfaceY(exitX, exitZ) : appCtx.elevationWorldYAtWorldXZ(exitX, exitZ)) + 1.1;
    if (appCtx.carMesh) {
      appCtx.carMesh.position.set(appCtx.car.x, appCtx.car.y, appCtx.car.z);
      appCtx.carMesh.rotation.y = appCtx.car.angle;
      appCtx.carMesh.visible = exitMode !== 'walk';
    }
  }
  if (appCtx.carMesh) appCtx.carMesh.visible = exitMode !== 'walk';
  if (appCtx.Walk?.state?.characterMesh) {
    appCtx.Walk.state.characterMesh.visible = exitMode === 'walk';
  }
  syncBoatTerrainSuppression();
  updateWaterWaveVisuals();
  updateBoatMenuUi();
  hideBoatPrompt();
  if (typeof appCtx.updateInteriorInteraction === 'function') {
    appCtx.updateInteriorInteraction();
  }
  if (typeof appCtx.updateWorldLod === 'function') appCtx.updateWorldLod(true);
  syncBoatPromptState(true);
  return true;
}

function handleBoatAction() {
  if (appCtx.oceanMode?.active) {
    void transferSubmarineToBoat({ source: 'submarine_prompt_entry' });
    return true;
  }
  if (appCtx.boatMode?.active) {
    if (typeof appCtx.setTravelMode === 'function') {
      appCtx.setTravelMode(appCtx.boatMode.lastEntryMode || 'walk', { source: 'boat_prompt_exit', force: true });
    } else {
      stopBoatMode({ targetMode: appCtx.boatMode.lastEntryMode || 'walk' });
    }
    return true;
  }
  const candidate = syncBoatPromptState(true);
  if (!candidate) return false;
  if (typeof appCtx.setTravelMode === 'function') {
    const resolved = appCtx.setTravelMode('boat', {
      source: 'boat_prompt_entry',
      force: true,
      candidate,
      spawnX: candidate.spawnX,
      spawnZ: candidate.spawnZ
    });
    return resolved === 'boat';
  } else {
    return startBoatMode({ candidate, source: 'boat_prompt_entry' });
  }
}

function cycleBoatSeaState() {
  const idx = SEA_STATE_SEQUENCE.indexOf(appCtx.boatMode?.seaState || 'moderate');
  const nextState = SEA_STATE_SEQUENCE[(idx + 1 + SEA_STATE_SEQUENCE.length) % SEA_STATE_SEQUENCE.length];
  setBoatWaveIntensity(intensityFromSeaState(nextState));
  return nextState;
}

function updateWaterWaveVisuals() {
  const materials = Array.isArray(appCtx.waterWaveVisuals) ? [...appCtx.waterWaveVisuals] : [];
  const patchMaterial = appCtx.boatMode?.waterPatch?.material || null;
  if (patchMaterial && !materials.includes(patchMaterial)) materials.push(patchMaterial);
  if (materials.length === 0) return false;
  const time = performance.now() * 0.001;
  const runtimeIntensity = getWaveIntensity();

  for (let i = 0; i < materials.length; i++) {
    const material = materials[i];
    const bundle = buildBoatWaveProfile(material, runtimeIntensity, time);
    if (!applyWaveUniformsToMaterial(material, bundle)) {
      if (material === patchMaterial && appCtx.boatMode?.waterPatch?.visible) material.needsUpdate = true;
      continue;
    }
    if (material === patchMaterial) updateBoatPatchWakeUniforms(bundle.profile);
  }
  return true;
}

function updateBoatMode(dt) {
  if (!appCtx.boatMode?.active) return false;
  const cfg = getSeaStateConfig();
  const profile = getBoatWaveProfile(appCtx.boatMode.currentWater || null);
  const left = !!(appCtx.keys.KeyA || appCtx.keys.ArrowLeft);
  const right = !!(appCtx.keys.KeyD || appCtx.keys.ArrowRight);
  const throttle = !!(appCtx.keys.KeyW || appCtx.keys.ArrowUp);
  const reverse = !!(appCtx.keys.KeyS || appCtx.keys.ArrowDown);
  const brake = !!appCtx.keys.Space;

  if (!Number.isFinite(appCtx.boat.forwardSpeed)) appCtx.boat.forwardSpeed = Number(appCtx.boat.speed) || 0;
  if (!Number.isFinite(appCtx.boat.lateralSpeed)) appCtx.boat.lateralSpeed = 0;
  if (!Number.isFinite(appCtx.boat.throttle)) appCtx.boat.throttle = 0;

  const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
  const throttleTarget = throttle ? 1 : reverse ? -0.58 : 0;
  appCtx.boat.throttle += (throttleTarget - appCtx.boat.throttle) * clamp(dt * 3.6, 0.06, 0.24);

  const maxForwardSpeed = Math.max(1, cfg.speedMax || 1);
  const speedNorm = clamp(Math.abs(appCtx.boat.forwardSpeed) / maxForwardSpeed, 0, 1.4);
  const waveDirX = Number.isFinite(appCtx.boatMode.waveDirectionX) ? appCtx.boatMode.waveDirectionX : Math.sin(appCtx.boat.angle);
  const waveDirZ = Number.isFinite(appCtx.boatMode.waveDirectionZ) ? appCtx.boatMode.waveDirectionZ : Math.cos(appCtx.boat.angle);
  const forwardDotWave = Math.sin(appCtx.boat.angle) * waveDirX + Math.cos(appCtx.boat.angle) * waveDirZ;
  const headSea = clamp(-forwardDotWave, 0, 1);
  const followingSea = clamp(forwardDotWave, 0, 1);
  const driveAccel = appCtx.boat.throttle >= 0 ?
    appCtx.boat.throttle * cfg.accel * (1 - speedNorm * 0.14) :
    appCtx.boat.throttle * cfg.accel * 0.68;
  const hullDrag =
    (0.26 + profile.intensity * 0.22 + headSea * 0.12) *
    appCtx.boat.forwardSpeed * Math.abs(appCtx.boat.forwardSpeed) /
    Math.max(26, maxForwardSpeed * 0.9);
  const idleBrake = throttle || reverse ? 0 : Math.sign(appCtx.boat.forwardSpeed) * (1.4 + profile.intensity * 0.5);
  const slamDrag = Number(appCtx.boatMode.slamStrength || 0) * 1.2 + Math.abs(appCtx.boat.verticalVelocity || 0) * 0.08;
  appCtx.boat.forwardSpeed += (driveAccel - hullDrag - idleBrake - slamDrag) * dt;
  if (brake) appCtx.boat.forwardSpeed *= Math.exp(-4.4 * dt);
  else appCtx.boat.forwardSpeed *= Math.pow(cfg.drag, Math.max(1, dt * 60));
  appCtx.boat.forwardSpeed = clamp(appCtx.boat.forwardSpeed, -maxForwardSpeed * 0.28, maxForwardSpeed);

  const lateralDamper =
    profile.waterKind === 'harbor' || profile.waterKind === 'channel' ? 4.8 :
    profile.waterKind === 'open_ocean' ? 2.3 :
    3.2;
  const rudderSlide = steerInput * appCtx.boat.forwardSpeed * 0.018;
  appCtx.boat.lateralSpeed += (-appCtx.boat.lateralSpeed * lateralDamper + rudderSlide) * dt;
  if (brake) appCtx.boat.lateralSpeed *= Math.exp(-3.6 * dt);
  appCtx.boat.lateralSpeed = clamp(appCtx.boat.lateralSpeed, -maxForwardSpeed * 0.18, maxForwardSpeed * 0.18);

  const steerAuthority = clamp(0.12 + Math.abs(appCtx.boat.forwardSpeed) / maxForwardSpeed * 1.12, 0.12, 1.24);
  const desiredTurn = steerInput * (0.2 + steerAuthority * 1.12) * (1 - profile.intensity * 0.04);
  const turnBlend = clamp(dt * (2.2 + steerAuthority * 1.6 + Math.abs(appCtx.boat.lateralSpeed) * 0.08), 0.04, 0.26);
  appCtx.boat.turnRate += (desiredTurn - appCtx.boat.turnRate) * turnBlend;
  appCtx.boat.turnRate -= appCtx.boat.lateralSpeed * 0.008 * dt;
  appCtx.boat.angle += appCtx.boat.turnRate * dt * (0.42 + steerAuthority * 0.84);

  const forwardX = Math.sin(appCtx.boat.angle);
  const forwardZ = Math.cos(appCtx.boat.angle);
  const rightX = Math.cos(appCtx.boat.angle);
  const rightZ = -Math.sin(appCtx.boat.angle);
  const driftStrength = profile.driftSpeed * (0.28 + profile.intensity * 0.78) * (0.7 + followingSea * 0.22);
  const desiredVX = forwardX * appCtx.boat.forwardSpeed + rightX * appCtx.boat.lateralSpeed + waveDirX * driftStrength;
  const desiredVZ = forwardZ * appCtx.boat.forwardSpeed + rightZ * appCtx.boat.lateralSpeed + waveDirZ * driftStrength;
  const velocityBlend =
    profile.waterKind === 'harbor' || profile.waterKind === 'channel' ? clamp(dt * 6.2, 0.08, 0.26) :
    profile.waterKind === 'open_ocean' ? clamp(dt * 3.4, 0.05, 0.18) :
    clamp(dt * 4.4, 0.06, 0.2);
  appCtx.boat.vx += (desiredVX - appCtx.boat.vx) * velocityBlend;
  appCtx.boat.vz += (desiredVZ - appCtx.boat.vz) * velocityBlend;
  if (brake) {
    appCtx.boat.vx *= Math.exp(-2.4 * dt);
    appCtx.boat.vz *= Math.exp(-2.4 * dt);
  }
  appCtx.boat.speed = appCtx.boat.forwardSpeed;

  const nextX = appCtx.boat.x + appCtx.boat.vx * dt;
  const nextZ = appCtx.boat.z + appCtx.boat.vz * dt;
  const nextCandidate = findNearestBoatCandidate(nextX, nextZ, 24);
  if (!nextCandidate) {
    appCtx.boat.speed *= 0.45;
    appCtx.boat.forwardSpeed *= 0.45;
    appCtx.boat.lateralSpeed *= 0.42;
    appCtx.boat.vx *= 0.42;
    appCtx.boat.vz *= 0.42;
    applyBoatWavePose(appCtx.boat.x, appCtx.boat.z, appCtx.boat.angle, appCtx.boatMode.currentWater || null, dt, false);
  } else {
    const nextShorelineDistance = nextCandidate.inside ? measureBoatShorelineDistance(nextCandidate, nextX, nextZ) : 0;
    const desiredDepth = minimumBoatShorelineDistance(nextCandidate.waterKind);
    const shouldCorrectShallowArea =
      nextCandidate.type === 'area' &&
      nextCandidate.inside &&
      (nextCandidate.waterKind === 'open_ocean' || nextCandidate.waterKind === 'coastal') &&
      nextShorelineDistance < desiredDepth * 0.72;
    const spawnPoint =
      shouldCorrectShallowArea ?
        resolveBoatSpawnPoint(nextCandidate, nextX, nextZ) :
      nextCandidate.inside ?
        {
          x: nextX,
          z: nextZ,
          shorelineDistance: nextShorelineDistance
        } :
        resolveBoatSpawnPoint(nextCandidate, nextX, nextZ);
    const activeCandidate = localizeBoatCandidate(
      nextCandidate,
      Number(spawnPoint?.shorelineDistance || nextCandidate.shorelineDistance || nextShorelineDistance || 0)
    );
    const correctedX = Number.isFinite(spawnPoint?.x) ? spawnPoint.x : nextCandidate.spawnX;
    const correctedZ = Number.isFinite(spawnPoint?.z) ? spawnPoint.z : nextCandidate.spawnZ;
    appCtx.boatMode.currentWater = activeCandidate;
    appCtx.boatMode.waterKind = activeCandidate?.waterKind || nextCandidate.waterKind;
    appCtx.boatMode.shorelineDistance = Number(activeCandidate?.shorelineDistance || 0);
    appCtx.boatMode.offshoreDistance = Number(activeCandidate?.shorelineDistance || 0);
    setBoatActorPose(correctedX, correctedZ, appCtx.boat.angle, activeCandidate, { dt });
  }

  updateBoatLodBias();
  syncBoatTerrainSuppression();
  updateBoatWaterPatch(appCtx.boatMode.currentWater || null);
  updateBoatMesh();
  updateBoatFoamFx(dt, profile);

  if (!Number.isFinite(appCtx.boatMode._terrainTimer)) appCtx.boatMode._terrainTimer = 0;
  if (!Number.isFinite(appCtx.boatMode._lodTimer)) appCtx.boatMode._lodTimer = 0;
  if (!appCtx.boatMode._lastTerrainStreamPos) appCtx.boatMode._lastTerrainStreamPos = { x: appCtx.boat.x, z: appCtx.boat.z };
  if (!appCtx.boatMode._lastLodStreamPos) appCtx.boatMode._lastLodStreamPos = { x: appCtx.boat.x, z: appCtx.boat.z };
  appCtx.boatMode._terrainTimer += dt;
  appCtx.boatMode._lodTimer += dt;
  const terrainInterval =
    appCtx.boatMode.detailBias <= 0.4 ? 3.4 :
    appCtx.boatMode.detailBias <= 0.58 ? 2.6 :
    appCtx.boatMode.detailBias <= 0.76 ? 1.9 : 1.35;
  const terrainMoved = Math.hypot(
    appCtx.boat.x - appCtx.boatMode._lastTerrainStreamPos.x,
    appCtx.boat.z - appCtx.boatMode._lastTerrainStreamPos.z
  );
  if (appCtx.boatMode._terrainTimer > terrainInterval && terrainMoved > 55) {
    appCtx.boatMode._terrainTimer = 0;
    if (typeof appCtx.updateTerrainAround === 'function' && !appCtx.worldLoading) {
      appCtx.updateTerrainAround(appCtx.boat.x, appCtx.boat.z);
      appCtx.boatMode._lastTerrainStreamPos = { x: appCtx.boat.x, z: appCtx.boat.z };
    }
  }
  const shorelineDistance = Number(appCtx.boatMode?.shorelineDistance || 0);
  const lodInterval =
    shorelineDistance > 1400 ? 3.2 :
    shorelineDistance > 700 ? 2.4 :
    1.6;
  const lodMoved = Math.hypot(
    appCtx.boat.x - appCtx.boatMode._lastLodStreamPos.x,
    appCtx.boat.z - appCtx.boatMode._lastLodStreamPos.z
  );
  if (appCtx.boatMode._lodTimer > lodInterval && lodMoved > 42) {
    appCtx.boatMode._lodTimer = 0;
    if (typeof appCtx.updateWorldLod === 'function') {
      appCtx.updateWorldLod(false);
      appCtx.boatMode._lastLodStreamPos = { x: appCtx.boat.x, z: appCtx.boat.z };
    }
  }

  if (appCtx.isRecording) {
    const last = appCtx.customTrack[appCtx.customTrack.length - 1];
    if (!last || Math.hypot(appCtx.boat.x - last.x, appCtx.boat.z - last.z) > 10) {
      appCtx.customTrack.push({ x: appCtx.boat.x, z: appCtx.boat.z });
    }
  }

  return true;
}

function initBoatMode() {
  ensureBoatPromptRefs();
  syncWaterMeshCache();
  ensureBoatWaterPatch();
  if (!Number.isFinite(appCtx.boatMode.waveIntensity)) {
    appCtx.boatMode.waveIntensity = DEFAULT_WAVE_INTENSITY;
    appCtx.boatMode.seaState = seaStateFromIntensity(DEFAULT_WAVE_INTENSITY);
  }
  if (_boatWaveSliderEl && !_boatWaveSliderEl.dataset.bound) {
    _boatWaveSliderEl.dataset.bound = 'true';
    _boatWaveSliderEl.value = String(Math.round(getWaveIntensity() * 100));
    _boatWaveSliderEl.addEventListener('input', (event) => {
      const nextValue = Number(event?.target?.value);
      if (!Number.isFinite(nextValue)) return;
      setBoatWaveIntensity(nextValue / 100, { skipUi: true });
      updateBoatMenuUi();
    });
    const blurWaveSlider = () => {
      if (!_boatWaveSliderEl) return;
      window.requestAnimationFrame(() => {
        if (document.activeElement === _boatWaveSliderEl) {
          _boatWaveSliderEl.blur();
        }
      });
    };
    _boatWaveSliderEl.addEventListener('pointerup', blurWaveSlider);
    _boatWaveSliderEl.addEventListener('mouseup', blurWaveSlider);
    _boatWaveSliderEl.addEventListener('touchend', blurWaveSlider, { passive: true });
  }
  updateBoatMenuUi();
}

Object.assign(appCtx, {
  boatHudLabel,
  canExitBoatMode,
  cycleBoatSeaState,
  handleBoatAction,
  enterBoatAtWorldPoint,
  inspectBoatCandidate: findNearestBoatCandidate,
  getBoatModeSnapshot,
  getBoatWaveIntensity: getWaveIntensity,
  initBoatMode,
  refreshBoatAvailability: syncBoatPromptState,
  sampleDynamicWaterAt,
  setBoatWaveIntensity,
  transferSubmarineToBoat,
  syncBoatTerrainSuppression,
  startBoatMode,
  stopBoatMode,
  waterSurfaceYAt,
  updateBoatMode,
  updateWaterWaveVisuals,
  updateBoatMenuUi
});

export {
  boatHudLabel,
  canExitBoatMode,
  cycleBoatSeaState,
  handleBoatAction,
  enterBoatAtWorldPoint,
  findNearestBoatCandidate as inspectBoatCandidate,
  getBoatModeSnapshot,
  getWaveIntensity as getBoatWaveIntensity,
  initBoatMode,
  syncBoatPromptState as refreshBoatAvailability,
  sampleDynamicWaterAt,
  setBoatWaveIntensity,
  transferSubmarineToBoat,
  syncBoatTerrainSuppression,
  startBoatMode,
  stopBoatMode,
  waterSurfaceYAt,
  updateBoatMode,
  updateWaterWaveVisuals,
  updateBoatMenuUi
};
