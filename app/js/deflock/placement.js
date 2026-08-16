const OVERHEAD_MOUNTS = new Set(['bridge', 'gantry', 'overhead_wire', 'traffic_signal']);

function normalizeCameraMount(value) {
  const text = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!text) return 'unknown';
  if (text.includes('traffic_signal')) return 'traffic_signal';
  if (text.includes('bridge')) return 'bridge';
  if (text.includes('gantry')) return 'gantry';
  if (text.includes('wire') || text.includes('cable')) return 'overhead_wire';
  if (text.includes('street_lamp') || text.includes('lamp')) return 'street_lamp';
  if (text.includes('wall')) return 'wall';
  if (text.includes('ceiling')) return 'ceiling';
  if (text.includes('pole') || text.includes('mast')) return 'pole';
  return 'unknown';
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || 'camera')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mountHeightFor(feature, mountKind) {
  const rawHeight = feature?.cameraHeightMeters;
  const explicitHeight = rawHeight === null || rawHeight === undefined || rawHeight === '' ? NaN : Number(rawHeight);
  if (Number.isFinite(explicitHeight)) return Math.max(1.5, Math.min(20, explicitHeight));
  if (mountKind === 'bridge' || mountKind === 'gantry') return 6.2;
  if (mountKind === 'traffic_signal' || mountKind === 'overhead_wire') return 5.4;
  if (mountKind === 'street_lamp') return 4.6;
  if (mountKind === 'pole') return 3.8;
  if (mountKind === 'wall' || mountKind === 'ceiling') return 3.4;
  return 3.15;
}

function roadEdgePlacement(feature, point, bearingRadians, authorities, mountKind) {
  const nearest = authorities.nearestRoadAt?.(point.x, point.z);
  const road = nearest?.road;
  const points = Array.isArray(road?.pts) ? road.pts : null;
  const segmentIndex = Math.max(0, Math.min(points?.length - 2, Number(nearest?.segIndex) || 0));
  const start = points?.[segmentIndex];
  const end = points?.[segmentIndex + 1];
  if (!start || !end || !Number.isFinite(nearest?.dist) || !Number.isFinite(nearest?.pt?.x) || !Number.isFinite(nearest?.pt?.z)) {
    return { x: point.x, z: point.z, curbAdjusted: false, road: null };
  }
  const segmentLength = Math.hypot(end.x - start.x, end.z - start.z);
  if (!(segmentLength > 0.01)) return { x: point.x, z: point.z, curbAdjusted: false, road: null };
  const tangentX = (end.x - start.x) / segmentLength;
  const tangentZ = (end.z - start.z) / segmentLength;
  const halfWidth = Math.max(1.8, Math.min(18, Number(road.width) * 0.5 || 4));
  const roadIsLocal = nearest.dist <= Math.max(18, halfWidth + 6);
  if (OVERHEAD_MOUNTS.has(mountKind) || mountKind === 'wall' || mountKind === 'ceiling') {
    return roadIsLocal
      ? { x: point.x, z: point.z, curbAdjusted: false, road, roadY: Number(nearest.y), tangentX, tangentZ }
      : { x: point.x, z: point.z, curbAdjusted: false, road: null };
  }
  const normalX = -tangentZ;
  const normalZ = tangentX;
  const curbDistance = halfWidth + 1.35;
  if (!roadIsLocal || nearest.dist >= halfWidth + 0.8) {
    return { x: point.x, z: point.z, curbAdjusted: false, road };
  }

  const sourceSide = (point.x - nearest.pt.x) * normalX + (point.z - nearest.pt.z) * normalZ;
  let side = Math.abs(sourceSide) > 0.25 ? Math.sign(sourceSide) : 0;
  if (!side && Number.isFinite(feature?.direction)) {
    const viewX = Math.sin(bearingRadians);
    const viewZ = -Math.cos(bearingRadians);
    side = viewX * normalX + viewZ * normalZ < 0 ? 1 : -1;
  }
  const hash = stableHash(feature?.sourceId);
  if (!side) side = hash % 2 ? 1 : -1;
  const tangentStagger = ((hash >>> 1) % 5 - 2) * 0.7;
  return {
    x: nearest.pt.x + normalX * curbDistance * side + tangentX * tangentStagger,
    z: nearest.pt.z + normalZ * curbDistance * side + tangentZ * tangentStagger,
    curbAdjusted: true,
    road
  };
}

function computeCameraPlacement(feature, authorities = {}) {
  const point = authorities.geoToWorld?.(Number(feature?.lat), Number(feature?.lon));
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) return null;
  const rawDirection = feature?.direction;
  const direction = rawDirection === null || rawDirection === undefined || rawDirection === '' ? NaN : Number(rawDirection);
  const bearingDegrees = Number.isFinite(direction) ? ((direction % 360) + 360) % 360 : null;
  const bearingRadians = Number.isFinite(bearingDegrees) ? bearingDegrees * Math.PI / 180 : 0;
  const mountKind = normalizeCameraMount(feature?.cameraMount);
  const anchor = roadEdgePlacement(feature, point, bearingRadians, authorities, mountKind);
  const groundSample = authorities.terrainAt?.(anchor.x, anchor.z);
  const terrainY = Number(groundSample?.position?.y);
  const groundY = OVERHEAD_MOUNTS.has(mountKind) && Number.isFinite(anchor.roadY) ? anchor.roadY : terrainY;
  return {
    sourceX: point.x,
    sourceZ: point.z,
    x: anchor.x,
    z: anchor.z,
    groundY: Number.isFinite(groundY) ? groundY : 0,
    bearingDegrees,
    bearingRadians,
    mountKind,
    mountHeight: mountHeightFor(feature, mountKind),
    overhead: OVERHEAD_MOUNTS.has(mountKind),
    curbAdjusted: anchor.curbAdjusted,
    roadWidth: Number.isFinite(Number(anchor.road?.width)) ? Number(anchor.road.width) : null,
    roadSurfaceY: Number.isFinite(anchor.roadY) ? anchor.roadY : null,
    roadTangentX: Number.isFinite(anchor.tangentX) ? anchor.tangentX : null,
    roadTangentZ: Number.isFinite(anchor.tangentZ) ? anchor.tangentZ : null
  };
}

export { computeCameraPlacement, normalizeCameraMount };
