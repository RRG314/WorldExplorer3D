import { ctx as appCtx } from '../shared-context.js?v=55';
import { clamp } from './dynamics.js?v=1';
import { normalizeWaterKind, waterKindLabel } from '../world/water-body-contract.js?v=3';

const BOAT_ENTRY_OFFSET = 9;
const BOAT_MAX_CANDIDATE_DISTANCE = 58;
const BOAT_WATERWAY_MIN_WIDTH = 12;
const BOAT_WATERWAY_MIN_LENGTH = 120;
const BOAT_AREA_MIN_AREA = 18000;
const BOAT_AREA_MIN_SPAN = 120;
const BOAT_EDGE_BUFFER_MIN = 1.2;

function normalizeAngle(angle = 0) {
  let value = Number(angle) || 0;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

function shortestAngleDelta(target = 0, current = 0) {
  return normalizeAngle(target - current);
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
  const declaredKind = normalizeWaterKind(area.waterKind || area.kind);
  if (declaredKind) return { kind: declaredKind, label: waterKindLabel(declaredKind) };
  const elevatedInlandWater = Number.isFinite(area.surfaceY) && area.surfaceY > 12;
  const broadOpenWater =
    stats.area > 900000 ||
    (stats.span > 1500 && stats.avgWidth > 120) ||
    (stats.span > 900 && stats.avgWidth > 180);
  if (broadOpenWater && !elevatedInlandWater) return { kind: 'open_ocean', label: 'Open Water' };
  if (elevatedInlandWater) return { kind: 'lake', label: 'Lake Water' };
  if (stats.area > 240000 || stats.span > 650 || stats.avgWidth > 70 || stats.minSpan > 85) {
    return { kind: 'coastal', label: 'Coastal Water' };
  }
  if (stats.area > 70000 || stats.span > 260 || stats.avgWidth > 28 || stats.minSpan > 34) {
    return { kind: 'harbor', label: 'Harbor Water' };
  }
  return { kind: 'lake', label: 'Lake Water' };
}

function classifyWaterway(way) {
  if (way?.navigable === false || way?.structureSemantics?.terrainMode === 'subgrade') return null;
  const width = Number(way?.width) || 0;
  const pts = Array.isArray(way?.pts) ? way.pts : [];
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    length += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  }
  way._boatLength = length;
  if (width < BOAT_WATERWAY_MIN_WIDTH || length < BOAT_WATERWAY_MIN_LENGTH) return null;
  const declaredKind = normalizeWaterKind(way.waterKind || way.kind || way.type);
  if (declaredKind) return { kind: declaredKind, label: waterKindLabel(declaredKind) };
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

function isPointInsideWaterAreaFootprint(area, x, z, edgeBuffer = 0) {
  const pts = Array.isArray(area?.pts) ? area.pts : [];
  if (pts.length < 3 || typeof appCtx.pointInPolygon !== 'function') return false;
  if (!appCtx.pointInPolygon(x, z, pts)) return false;
  const buffer = Math.max(0, Number(edgeBuffer) || 0);
  if (buffer <= 0) return true;
  const edge = nearestPointOnPolygon(x, z, pts);
  return !!edge && edge.dist >= buffer;
}

function isPointInsideWaterwayFootprint(way, x, z, edgeBuffer = 0) {
  if (way?.navigable === false || way?.structureSemantics?.terrainMode === 'subgrade') return false;
  const pts = Array.isArray(way?.pts) ? way.pts : [];
  if (pts.length < 2) return false;
  const nearest = nearestPointOnPolyline(x, z, pts);
  if (!nearest) return false;
  const halfWidth = Math.max(3, (Number(way?.width) || 8) * 0.5);
  const buffer = Math.max(0, Number(edgeBuffer) || 0);
  return nearest.dist <= Math.max(0.8, halfWidth - buffer);
}

function isPointInsideWaterFootprint(x, z, options = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const includeWaterways = options?.includeWaterways !== false;
  const edgeBuffer = Math.max(0, Number(options?.edgeBuffer) || 0);
  const areas = Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas : [];
  for (let i = 0; i < areas.length; i++) {
    if (isPointInsideWaterAreaFootprint(areas[i], x, z, edgeBuffer)) return true;
  }
  if (!includeWaterways) return false;
  const ways = Array.isArray(appCtx.waterways) ? appCtx.waterways : [];
  for (let i = 0; i < ways.length; i++) {
    if (isPointInsideWaterwayFootprint(ways[i], x, z, edgeBuffer)) return true;
  }
  return false;
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
  if (value === 'harbor') return 20;
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
      const deeper = findBestAreaInteriorSpawn(candidate, preferredX, preferredZ, minEdge);
      if (deeper && deeper.shorelineDistance >= Math.max(minEdge, shorelineDistance + 4)) {
        return {
          x: deeper.x,
          z: deeper.z,
          shorelineDistance: deeper.shorelineDistance
        };
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


export {
  BOAT_ENTRY_OFFSET,
  BOAT_MAX_CANDIDATE_DISTANCE,
  BOAT_WATERWAY_MIN_WIDTH,
  BOAT_WATERWAY_MIN_LENGTH,
  BOAT_AREA_MIN_AREA,
  BOAT_AREA_MIN_SPAN,
  BOAT_EDGE_BUFFER_MIN,
  normalizeAngle,
  shortestAngleDelta,
  segmentDistanceInfo,
  polygonStats,
  classifyWaterArea,
  classifyWaterway,
  nearestPointOnPolygon,
  nearestPointOnPolyline,
  isPointInsideWaterAreaFootprint,
  isPointInsideWaterwayFootprint,
  isPointInsideWaterFootprint,
  candidateDistanceScore,
  candidateMaxDistance,
  preferredBoatEntryOffset,
  minimumBoatShorelineDistance,
  pointInsideBoatCandidate,
  measureBoatShorelineDistance,
  findBestAreaInteriorSpawn,
  resolveBoatSpawnPoint
};
