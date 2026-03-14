import { ctx as appCtx } from "./shared-context.js?v=55";

const ENTRY_EXCLUDED_BUILDING_TYPES = new Set(['roof', 'canopy', 'carport', 'bridge']);
const DEFAULT_DESTINATION_MATCH_RADIUS = 42;
const DEFAULT_ENTRY_RADIUS = 8.5;
const SYNTHETIC_INTERIOR_HEIGHT = 3.4;

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pointToSegmentDistance(x, z, p1, p2) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-9) {
    return { dist: Math.hypot(x - p1.x, z - p1.z), x: p1.x, z: p1.z, t: 0 };
  }
  let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = p1.x + dx * t;
  const pz = p1.z + dz * t;
  return { dist: Math.hypot(x - px, z - pz), x: px, z: pz, t };
}

function polygonCentroid(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let sumX = 0;
  let sumZ = 0;
  for (let i = 0; i < points.length; i++) {
    sumX += points[i].x;
    sumZ += points[i].z;
  }
  return {
    x: sumX / points.length,
    z: sumZ / points.length
  };
}

function footprintBounds(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return {
      minX: 0,
      maxX: 0,
      minZ: 0,
      maxZ: 0,
      width: 0,
      depth: 0
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(0, maxX - minX),
    depth: Math.max(0, maxZ - minZ)
  };
}

function cloneFootprint(points = []) {
  return points
    .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.z))
    .map((point) => ({ x: Number(point.x), z: Number(point.z) }));
}

function pointInPolygonSafe(x, z, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  if (typeof appCtx.pointInPolygon === 'function') {
    return appCtx.pointInPolygon(x, z, polygon) === true;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersect = zi > z !== zj > z && x < (xj - xi) * (z - zi) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToFootprint(x, z, buildingLike) {
  if (!buildingLike) return { dist: Infinity, point: null, inside: false };
  if (Array.isArray(buildingLike.pts) && buildingLike.pts.length >= 3) {
    let best = null;
    for (let i = 0; i < buildingLike.pts.length; i++) {
      const p1 = buildingLike.pts[i];
      const p2 = buildingLike.pts[(i + 1) % buildingLike.pts.length];
      const hit = pointToSegmentDistance(x, z, p1, p2);
      if (!best || hit.dist < best.dist) best = hit;
    }
    const inside = pointInPolygonSafe(x, z, buildingLike.pts);
    return {
      dist: inside ? 0 : (best?.dist ?? Infinity),
      point: best ? { x: best.x, z: best.z } : null,
      inside
    };
  }

  const minX = finiteNumber(buildingLike.minX, 0);
  const maxX = finiteNumber(buildingLike.maxX, 0);
  const minZ = finiteNumber(buildingLike.minZ, 0);
  const maxZ = finiteNumber(buildingLike.maxZ, 0);
  const nearestX = Math.max(minX, Math.min(x, maxX));
  const nearestZ = Math.max(minZ, Math.min(z, maxZ));
  const inside = x >= minX && x <= maxX && z >= minZ && z <= maxZ;
  return {
    dist: inside ? 0 : Math.hypot(x - nearestX, z - nearestZ),
    point: { x: nearestX, z: nearestZ },
    inside
  };
}

function buildingKey(building) {
  if (!building) return '';
  return String(
    building.sourceBuildingId ||
    `${Math.round(finiteNumber(building.centerX, 0))}:${Math.round(finiteNumber(building.centerZ, 0))}`
  );
}

function buildingLabel(buildingLike) {
  const explicit = String(
    buildingLike?.name ||
    buildingLike?.address ||
    buildingLike?.title ||
    ''
  ).trim();
  if (explicit) return explicit;

  const kind =
    String(buildingLike?.buildingType || '').trim() ||
    String(buildingLike?.propertyType || '').trim() ||
    String(buildingLike?.category || '').trim() ||
    'building';

  const normalized = kind.replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildingFootprintPoints(buildingLike) {
  if (Array.isArray(buildingLike?.pts) && buildingLike.pts.length >= 3) {
    return cloneFootprint(buildingLike.pts);
  }
  if (!buildingLike) return [];
  return [
    { x: finiteNumber(buildingLike.minX, 0), z: finiteNumber(buildingLike.minZ, 0) },
    { x: finiteNumber(buildingLike.maxX, 0), z: finiteNumber(buildingLike.minZ, 0) },
    { x: finiteNumber(buildingLike.maxX, 0), z: finiteNumber(buildingLike.maxZ, 0) },
    { x: finiteNumber(buildingLike.minX, 0), z: finiteNumber(buildingLike.maxZ, 0) }
  ];
}

function hasFullBuildingFootprint(building) {
  return !!(
    building &&
    building.colliderDetail === 'full' &&
    Array.isArray(building.pts) &&
    building.pts.length >= 3
  );
}

function isEnterableBuildingCandidate(building) {
  if (!hasFullBuildingFootprint(building)) return false;
  const buildingType = String(building?.buildingType || '').toLowerCase();
  if (!buildingType || ENTRY_EXCLUDED_BUILDING_TYPES.has(buildingType)) return false;
  return !building.isInteriorCollider && !building.collisionDisabled;
}

function destinationKey(destination) {
  if (!destination || typeof destination !== 'object') return '';
  return String(
    destination.id ||
    destination.name ||
    destination.address ||
    `${Math.round(finiteNumber(destination.x, 0))}:${Math.round(finiteNumber(destination.z, 0))}`
  );
}

function destinationKind(destination) {
  if (!destination || typeof destination !== 'object') return 'destination';
  if (Object.prototype.hasOwnProperty.call(destination, 'price') || Object.prototype.hasOwnProperty.call(destination, 'priceType')) {
    return 'property';
  }
  if (destination.category || destination.icon) return 'historic';
  return 'destination';
}

function estimateSyntheticFootprint(destination) {
  const sqftMeters = Math.max(0, finiteNumber(destination?.sqft, 0) * 0.092903);
  const targetArea = Math.max(64, Math.min(260, sqftMeters || 110));
  const baseWidth = Math.sqrt(targetArea);
  let width = Math.max(8, Math.min(24, baseWidth * 1.1));
  let depth = Math.max(8, Math.min(24, targetArea / width));
  if (destinationKind(destination) === 'historic') {
    width = Math.max(width, 12);
    depth = Math.max(depth, 10);
  }
  return { width, depth };
}

function createSyntheticDestinationBuilding(destination, options = {}) {
  const cx = finiteNumber(destination?.x, 0);
  const cz = finiteNumber(destination?.z, 0);
  const size = estimateSyntheticFootprint(destination);
  const width = Math.max(8, finiteNumber(options.width, size.width));
  const depth = Math.max(8, finiteNumber(options.depth, size.depth));
  const levels = Math.max(1, Math.round(finiteNumber(destination?.levels, destination?.beds > 3 ? 2 : 1)));
  const height = Math.max(SYNTHETIC_INTERIOR_HEIGHT + 0.6, levels * SYNTHETIC_INTERIOR_HEIGHT);
  const pts = [
    { x: cx - width * 0.5, z: cz - depth * 0.5 },
    { x: cx + width * 0.5, z: cz - depth * 0.5 },
    { x: cx + width * 0.5, z: cz + depth * 0.5 },
    { x: cx - width * 0.5, z: cz + depth * 0.5 }
  ];
  const bounds = footprintBounds(pts);
  return {
    pts,
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    height,
    levels,
    centerX: cx,
    centerZ: cz,
    colliderDetail: 'full',
    sourceBuildingId: `destination:${destinationKey(destination)}`,
    name: buildingLabel(destination),
    buildingType: String(destination?.propertyType || destination?.category || 'listing').toLowerCase().replace(/\s+/g, '_'),
    collisionDisabled: false,
    syntheticInteriorOnly: true
  };
}

function buildEntryAnchor(building, originPoint = null) {
  const footprint = buildingFootprintPoints(building);
  const centroid = polygonCentroid(footprint) || {
    x: finiteNumber(building?.centerX, 0),
    z: finiteNumber(building?.centerZ, 0)
  };
  const desired = originPoint && Number.isFinite(originPoint.x) && Number.isFinite(originPoint.z) ?
    originPoint :
    centroid;
  const footprintHit = distanceToFootprint(desired.x, desired.z, building);
  const edgePoint = footprintHit.point || centroid;
  const dx = centroid.x - edgePoint.x;
  const dz = centroid.z - edgePoint.z;
  const len = Math.hypot(dx, dz) || 1;
  return {
    x: edgePoint.x + dx / len * 1.8,
    z: edgePoint.z + dz / len * 1.8
  };
}

function supportDistanceToActor(x, z, support) {
  if (!support) return Infinity;
  return distanceToFootprint(x, z, support.building || support).dist;
}

function summarizeSupportType(support, mappedState = 'unknown') {
  if (!support) return 'Unavailable';
  if (mappedState === 'mapped') return 'Mapped';
  if (support.synthetic) return 'Generated';
  if (support.destinationKind === 'property') return 'Listing';
  if (support.destinationKind === 'historic') return 'Historic';
  return 'Generated';
}

function resolveSupportRecord(building, options = {}) {
  if (!building || !isEnterableBuildingCandidate(building)) {
    return {
      enterable: false,
      reason: 'missing_footprint',
      building: null,
      destination: options.destination || null
    };
  }

  const footprint = buildingFootprintPoints(building);
  const bounds = footprintBounds(footprint);
  const center = polygonCentroid(footprint) || {
    x: finiteNumber(building.centerX, (bounds.minX + bounds.maxX) * 0.5),
    z: finiteNumber(building.centerZ, (bounds.minZ + bounds.maxZ) * 0.5)
  };
  const destination = options.destination || null;
  const originPoint = destination && Number.isFinite(destination.x) && Number.isFinite(destination.z) ?
    { x: Number(destination.x), z: Number(destination.z) } :
    center;

  return {
    key: buildingKey(building),
    label: options.label || buildingLabel(destination || building),
    enterable: true,
    synthetic: !!building.syntheticInteriorOnly,
    building,
    destination,
    destinationKind: destinationKind(destination),
    footprint,
    bounds,
    center,
    entryAnchor: buildEntryAnchor(building, originPoint),
    allowMappedData: !building.syntheticInteriorOnly,
    allowGeneratedInterior: true
  };
}

function resolveDestinationBuilding(destination, options = {}) {
  const x = finiteNumber(destination?.x, NaN);
  const z = finiteNumber(destination?.z, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

  const matchRadius = Math.max(10, finiteNumber(options.maxDistance, DEFAULT_DESTINATION_MATCH_RADIUS));
  const nearby = typeof appCtx.getNearbyBuildings === 'function' ?
    appCtx.getNearbyBuildings(x, z, matchRadius + 10) :
    (Array.isArray(appCtx.buildings) ? appCtx.buildings : []);

  let best = null;
  for (let i = 0; i < nearby.length; i++) {
    const building = nearby[i];
    if (!isEnterableBuildingCandidate(building)) continue;
    const footprintHit = distanceToFootprint(x, z, building);
    if (!Number.isFinite(footprintHit.dist) || footprintHit.dist > matchRadius) continue;
    const type = String(building?.buildingType || '').toLowerCase();
    const priority =
      /^(commercial|retail|office|hotel|apartments|residential|house|museum|civic|public|station|yes)$/.test(type) ? 2 : 1;
    const score = footprintHit.dist - priority * 2;
    if (!best || score < best.score) {
      best = { building, score, footprintHit };
    }
  }

  return best;
}

function cacheDestinationSupport(destination, support) {
  if (!destination || typeof destination !== 'object') return support;
  const signature = `${finiteNumber(appCtx.LOC?.lat, 0).toFixed(4)},${finiteNumber(appCtx.LOC?.lon, 0).toFixed(4)}:${Array.isArray(appCtx.buildings) ? appCtx.buildings.length : 0}`;
  destination._buildingEntrySupport = support;
  destination._buildingEntrySignature = signature;
  destination.entryBuildingKey = support?.enterable ? support.key : '';
  destination.entryBuildingLabel = support?.enterable ? support.label : '';
  destination.entryBuildingKind = support?.enterable ? summarizeSupportType(support) : '';
  destination.entryBuildingPoint = support?.enterable && support.entryAnchor ? { ...support.entryAnchor } : null;
  return support;
}

function readCachedDestinationSupport(destination) {
  if (!destination || typeof destination !== 'object') return null;
  const cached = destination._buildingEntrySupport || null;
  const signature = `${finiteNumber(appCtx.LOC?.lat, 0).toFixed(4)},${finiteNumber(appCtx.LOC?.lon, 0).toFixed(4)}:${Array.isArray(appCtx.buildings) ? appCtx.buildings.length : 0}`;
  if (!cached || destination._buildingEntrySignature !== signature) return null;
  return cached;
}

function resolveBuildingEntrySupport(input, options = {}) {
  if (!input) {
    return { enterable: false, reason: 'missing_input', building: null, destination: null };
  }

  if (Object.prototype.hasOwnProperty.call(input, 'minX') || Object.prototype.hasOwnProperty.call(input, 'pts')) {
    return resolveSupportRecord(input, options);
  }

  const cached = options.forceRefresh ? null : readCachedDestinationSupport(input);
  if (cached) return cached;

  const matched = resolveDestinationBuilding(input, options);
  if (matched?.building) {
    return cacheDestinationSupport(input, resolveSupportRecord(matched.building, {
      ...options,
      destination: input
    }));
  }

  if (options.allowSynthetic === true) {
    const synthetic = createSyntheticDestinationBuilding(input, options);
    return cacheDestinationSupport(input, resolveSupportRecord(synthetic, {
      ...options,
      destination: input
    }));
  }

  return cacheDestinationSupport(input, {
    enterable: false,
    reason: 'no_destination_building',
    building: null,
    destination: input
  });
}

function resolveActiveDestinationBuildingSupport(options = {}) {
  const destination = appCtx.selectedProperty || appCtx.selectedHistoric || null;
  if (!destination) return null;
  return resolveBuildingEntrySupport(destination, {
    allowSynthetic: true,
    ...options
  });
}

function pickNearbyEnterableBuildingSupport(x, z, options = {}) {
  const radius = Math.max(2, finiteNumber(options.radius, DEFAULT_ENTRY_RADIUS));
  const nearby = typeof appCtx.getNearbyBuildings === 'function' ?
    appCtx.getNearbyBuildings(x, z, radius + 10) :
    (Array.isArray(appCtx.buildings) ? appCtx.buildings : []);

  let best = null;
  for (let i = 0; i < nearby.length; i++) {
    const building = nearby[i];
    const support = resolveBuildingEntrySupport(building, options);
    if (!support.enterable) continue;
    const footprintHit = distanceToFootprint(x, z, support.building);
    if (!Number.isFinite(footprintHit.dist) || footprintHit.dist > radius) continue;
    const score = footprintHit.dist + (footprintHit.inside ? 0.35 : 0);
    if (!best || score < best.score) {
      best = {
        support,
        score,
        distance: footprintHit.dist,
        point: footprintHit.point,
        inside: footprintHit.inside
      };
    }
  }

  const destinationSupport = resolveActiveDestinationBuildingSupport(options);
  if (destinationSupport?.enterable) {
    const destinationDist = supportDistanceToActor(x, z, destinationSupport);
    if (Number.isFinite(destinationDist) && destinationDist <= radius + 1.5) {
      const destinationHit = distanceToFootprint(x, z, destinationSupport.building);
      const score = destinationDist - (destinationSupport.synthetic ? 0.1 : 0.35);
      if (!best || score < best.score) {
        best = {
          support: destinationSupport,
          score,
          distance: destinationDist,
          point: destinationHit.point,
          inside: destinationHit.inside
        };
      }
    }
  }

  return best;
}

function listEnterableBuildingSupportsNear(x, z, radius = 220, limit = 8, options = {}) {
  const nearby = typeof appCtx.getNearbyBuildings === 'function' ?
    appCtx.getNearbyBuildings(x, z, radius + 20) :
    (Array.isArray(appCtx.buildings) ? appCtx.buildings : []);
  const seen = new Set();
  const supports = [];

  for (let i = 0; i < nearby.length; i++) {
    const support = resolveBuildingEntrySupport(nearby[i], options);
    if (!support.enterable || !support.key || seen.has(support.key)) continue;
    const dist = supportDistanceToActor(x, z, support);
    if (!Number.isFinite(dist) || dist > radius) continue;
    seen.add(support.key);
    supports.push({
      ...support,
      distance: dist
    });
  }

  const activeDestination = resolveActiveDestinationBuildingSupport(options);
  if (activeDestination?.enterable && !seen.has(activeDestination.key)) {
    const dist = supportDistanceToActor(x, z, activeDestination);
    if (Number.isFinite(dist) && dist <= radius) {
      supports.push({
        ...activeDestination,
        distance: dist
      });
    }
  }

  supports.sort((a, b) => a.distance - b.distance);
  return supports.slice(0, Math.max(1, limit));
}

Object.assign(appCtx, {
  buildingKey,
  buildingLabel,
  buildingFootprintPoints,
  distanceToFootprint,
  hasFullBuildingFootprint,
  isEnterableBuildingCandidate,
  listEnterableBuildingSupportsNear,
  pickNearbyEnterableBuildingSupport,
  pointToSegmentDistance,
  resolveActiveDestinationBuildingSupport,
  resolveBuildingEntrySupport,
  summarizeBuildingEntrySupport: summarizeSupportType
});

export {
  buildingKey,
  buildingLabel,
  buildingFootprintPoints,
  distanceToFootprint,
  hasFullBuildingFootprint,
  isEnterableBuildingCandidate,
  listEnterableBuildingSupportsNear,
  pickNearbyEnterableBuildingSupport,
  pointToSegmentDistance,
  resolveActiveDestinationBuildingSupport,
  resolveBuildingEntrySupport,
  summarizeSupportType
};
