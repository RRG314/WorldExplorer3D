const EXCLUDED_BUILDING_TYPES = new Set([
  'roof', 'canopy', 'carport', 'bridge', 'bridge_guardrail', 'shed'
]);

const COMMERCIAL_BUILDING_TYPES = new Set([
  'commercial', 'retail', 'office', 'hotel', 'supermarket', 'mall', 'civic',
  'public', 'hospital', 'school', 'university', 'train_station'
]);

const ENTRANCE_LIMIT_BY_TIER = Object.freeze({
  low: 24,
  performance: 40,
  balanced: 72,
  quality: 112
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanPoints(points) {
  if (!Array.isArray(points)) return [];
  const result = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) continue;
    result.push({ x: Number(point.x), z: Number(point.z) });
  }
  if (
    result.length > 3 &&
    result[0].x === result[result.length - 1].x &&
    result[0].z === result[result.length - 1].z
  ) result.pop();
  return result;
}

function polygonCentroid(points) {
  let signedArea = 0;
  let sumX = 0;
  let sumZ = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.z - next.x * current.z;
    signedArea += cross;
    sumX += (current.x + next.x) * cross;
    sumZ += (current.z + next.z) * cross;
  }
  if (Math.abs(signedArea) > 1e-6) {
    return { x: sumX / (3 * signedArea), z: sumZ / (3 * signedArea) };
  }
  return points.reduce((center, point) => ({
    x: center.x + point.x / points.length,
    z: center.z + point.z / points.length
  }), { x: 0, z: 0 });
}

function projectToSegment(point, start, end, insetMeters = 0.3) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const length = Math.sqrt(lengthSquared);
  const minimumT = length > 1e-6
    ? Math.min(0.45, Math.max(0.04, finite(insetMeters, 0.3) / length))
    : 0.5;
  const t = lengthSquared > 1e-9
    ? Math.max(minimumT, Math.min(1 - minimumT, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared))
    : 0.5;
  return {
    x: start.x + dx * t,
    z: start.z + dz * t,
    t,
    distance: Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t))
  };
}

function pointInPolygon(x, z, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const a = points[index];
    const b = points[previous];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function outwardNormalForEdge(candidate, edge) {
  const dx = edge.end.x - edge.start.x;
  const dz = edge.end.z - edge.start.z;
  const length = Math.hypot(dx, dz) || 1;
  const options = [
    { x: -dz / length, z: dx / length },
    { x: dz / length, z: -dx / length }
  ];
  const outside = options.find((normal) => !pointInPolygon(
    edge.projection.x + normal.x * 0.45,
    edge.projection.z + normal.z * 0.45,
    candidate.points
  ));
  if (outside) return outside;
  const fallbackX = edge.projection.x - candidate.center.x;
  const fallbackZ = edge.projection.z - candidate.center.z;
  const fallbackLength = Math.hypot(fallbackX, fallbackZ) || 1;
  return { x: fallbackX / fallbackLength, z: fallbackZ / fallbackLength };
}

function stableBuildingId(building, index) {
  return String(
    building?.sourceBuildingId ||
    building?.id ||
    `footprint:${Math.round(finite(building?.centerX))}:${Math.round(finite(building?.centerZ))}:${index}`
  );
}

function stableStringHash(value = '') {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function entranceArchetype(candidate) {
  const type = String(candidate?.buildingType || '').toLowerCase();
  if (/house|residential|detached|terrace|townhouse|apartments/.test(type)) return 'residential';
  if (/church|cathedral|chapel|civic|public|museum|school|university|hospital/.test(type)) return 'civic';
  if (/industrial|warehouse|hangar|service|garage|transportation/.test(type)) return 'industrial';
  if (/retail|commercial|supermarket|mall|hotel/.test(type)) return 'storefront';
  if (/office|skyscraper/.test(type)) return 'office';
  const levels = Math.max(1, Math.round(finite(candidate?.building?.levels, 1)));
  const height = Math.max(2.7, finite(candidate?.building?.height, 3.2));
  if (levels >= 5 || height >= 18) return 'office';
  const mixedUseVariant = stableStringHash(candidate?.buildingId) % 10;
  if (mixedUseVariant <= 1) return 'residential';
  if (mixedUseVariant === 2) return 'storefront';
  if (mixedUseVariant === 3 && (levels >= 3 || height >= 10)) return 'office';
  return 'urban';
}

function entranceVisualFields(candidate) {
  const archetype = entranceArchetype(candidate);
  const visualVariant = stableStringHash(candidate?.buildingId) % 8;
  const doorStyle = archetype === 'storefront' ? 'glass_double' :
    archetype === 'office' ? (visualVariant % 2 === 0 ? 'glass_double' : 'metal_glass') :
      archetype === 'civic' ? 'civic_transom' :
        archetype === 'industrial' ? 'steel_service' :
          visualVariant % 3 === 0 ? 'paneled_glass' : 'paneled';
  return { archetype, visualVariant, doorStyle };
}

function nearestFacadeEdge(candidate, point) {
  let best = null;
  for (let index = 0; index < candidate.points.length; index += 1) {
    const start = candidate.points[index];
    const end = candidate.points[(index + 1) % candidate.points.length];
    const projection = projectToSegment(point, start, end);
    if (!best || projection.distance < best.projection.distance) {
      best = { start, end, projection, edgeIndex: index };
    }
  }
  return best;
}

function candidatePriority(building, index) {
  const points = cleanPoints(building?.pts);
  if (points.length < 3 || building?.collisionKind === 'barrier' || building?.collisionDisabled) return null;
  const buildingType = String(building?.buildingType || 'building').trim().toLowerCase();
  if (EXCLUDED_BUILDING_TYPES.has(buildingType)) return null;
  const center = polygonCentroid(points);
  const distance = Math.hypot(center.x, center.z);
  if (distance > 520) return null;
  const commercial = COMMERCIAL_BUILDING_TYPES.has(buildingType);
  return {
    building,
    buildingId: stableBuildingId(building, index),
    buildingType,
    center,
    distance,
    points,
    commercial,
    score: distance - (commercial ? 95 : 0)
  };
}

function entranceGroundPlacement(sourceY, x, z, normalX, normalZ, sampleGround) {
  if (typeof sampleGround !== 'function') return { y: sourceY, surfaceDelta: 0, usable: true };
  const sampled = Number(sampleGround(x + normalX * 1.8, z + normalZ * 1.8));
  if (!Number.isFinite(sampled)) return { y: sourceY, surfaceDelta: 0, usable: true };
  const surfaceDelta = sampled - sourceY;
  return {
    y: sampled,
    surfaceDelta,
    // A road deck, ramp, retaining wall, or terrain shelf several metres above
    // the facade base cannot be a usable ground-floor approach. Reject it
    // instead of painting a door below an occluding surface.
    usable: Math.abs(surfaceDelta) <= 0.9
  };
}

function normalizeMappedEntrance(mapped, candidate, sampleGround) {
  if (!Number.isFinite(mapped?.x) || !Number.isFinite(mapped?.z)) return null;
  const center = candidate.center;
  let normalX = finite(mapped.normalX, mapped.x - center.x);
  let normalZ = finite(mapped.normalZ, mapped.z - center.z);
  const normalLength = Math.hypot(normalX, normalZ) || 1;
  normalX /= normalLength;
  normalZ /= normalLength;
  const facadeEdge = nearestFacadeEdge(candidate, mapped);
  const facadeWidth = facadeEdge
    ? Math.hypot(facadeEdge.end.x - facadeEdge.start.x, facadeEdge.end.z - facadeEdge.start.z)
    : 7;
  const facadeX = facadeEdge ? facadeEdge.projection.x : Number(mapped.x);
  const facadeZ = facadeEdge ? facadeEdge.projection.z : Number(mapped.z);
  const mappedY = finite(mapped.y, finite(candidate.building?.baseY, finite(candidate.building?.minY, 0)));
  const ground = entranceGroundPlacement(mappedY, facadeX, facadeZ, normalX, normalZ, sampleGround);
  if (!ground.usable) return null;
  const baseY = ground.y;
  return Object.freeze({
    id: `entrance:${candidate.buildingId}:mapped:${String(mapped.id || '0')}`,
    buildingSourceId: candidate.buildingId,
    buildingType: candidate.buildingType,
    commercial: candidate.commercial,
    provenance: 'mapped',
    x: facadeX,
    y: baseY,
    z: facadeZ,
    approachX: facadeX + normalX * 1.8,
    approachY: baseY,
    approachZ: facadeZ + normalZ * 1.8,
    normalX,
    normalZ,
    tangentX: -normalZ,
    tangentZ: normalX,
    yaw: Math.atan2(normalX, normalZ),
    facadeWidth,
    levels: Math.max(1, Math.round(finite(candidate.building?.levels, 1))),
    height: Math.max(2.7, finite(candidate.building?.height, 3.2)),
    facadeBaseY: mappedY,
    approachSurfaceDelta: ground.surfaceDelta,
    ...entranceVisualFields(candidate)
  });
}

function inferEntrance(candidate, nearestRoad, sampleGround) {
  const building = candidate.building;
  const buildingBaseY = finite(building?.baseY, finite(building?.minY, 0));
  const roadHit = typeof nearestRoad === 'function'
    ? nearestRoad(candidate.center.x, candidate.center.z, { y: buildingBaseY, maxVerticalDelta: 5.5 })
    : null;
  const target = Number.isFinite(roadHit?.pt?.x) && Number.isFinite(roadHit?.pt?.z)
    ? { x: Number(roadHit.pt.x), z: Number(roadHit.pt.z) }
    : { x: 0, z: 0 };
  let best = null;
  for (let index = 0; index < candidate.points.length; index += 1) {
    const start = candidate.points[index];
    const end = candidate.points[(index + 1) % candidate.points.length];
    const projection = projectToSegment(target, start, end, candidate.commercial ? 1.3 : 1.08);
    if (!best || projection.distance < best.projection.distance) {
      best = { start, end, projection, edgeIndex: index };
    }
  }
  if (!best) return null;
  const outwardNormal = outwardNormalForEdge(candidate, best);
  const normalX = outwardNormal.x;
  const normalZ = outwardNormal.z;
  const tangentLength = Math.hypot(best.end.x - best.start.x, best.end.z - best.start.z) || 1;
  if (tangentLength < (candidate.commercial ? 2.6 : 2.15)) return null;
  const tangentX = (best.end.x - best.start.x) / tangentLength;
  const tangentZ = (best.end.z - best.start.z) / tangentLength;
  // Keep the entrance origin on the actual footprint edge. The presentation
  // owns millimetre-scale reveal offsets; shifting the catalog outward made the
  // whole assembly read as a prop attached in front of the wall.
  const x = best.projection.x;
  const z = best.projection.z;
  const ground = entranceGroundPlacement(buildingBaseY, x, z, normalX, normalZ, sampleGround);
  if (!ground.usable) return null;
  const baseY = ground.y;
  return Object.freeze({
    id: `entrance:${candidate.buildingId}:inferred:${best.edgeIndex}`,
    buildingSourceId: candidate.buildingId,
    buildingType: candidate.buildingType,
    commercial: candidate.commercial,
    provenance: 'inferred',
    x,
    y: baseY,
    z,
    approachX: x + normalX * 1.8,
    approachY: baseY,
    approachZ: z + normalZ * 1.8,
    normalX,
    normalZ,
    tangentX,
    tangentZ,
    yaw: Math.atan2(normalX, normalZ),
    facadeWidth: tangentLength,
    levels: Math.max(1, Math.round(finite(building?.levels, 1))),
    height: Math.max(2.7, finite(building?.height, 3.2)),
    roadDistance: Number.isFinite(roadHit?.dist) ? Number(roadHit.dist) : null,
    roadSourceId: String(roadHit?.road?.sourceRoadId || roadHit?.road?.sourceWayId || roadHit?.road?.id || ''),
    facadeBaseY: buildingBaseY,
    approachSurfaceDelta: ground.surfaceDelta,
    ...entranceVisualFields(candidate)
  });
}

export function compileEntranceCatalog(options = {}) {
  const tier = String(options.tier || 'balanced').toLowerCase();
  const limit = Math.max(0, Math.floor(finite(options.limit, ENTRANCE_LIMIT_BY_TIER[tier] || ENTRANCE_LIMIT_BY_TIER.balanced)));
  const mappedByBuilding = new Map();
  for (const mapped of Array.isArray(options.mappedEntrances) ? options.mappedEntrances : []) {
    const buildingId = String(mapped?.buildingSourceId || '');
    if (buildingId && !mappedByBuilding.has(buildingId)) mappedByBuilding.set(buildingId, mapped);
  }
  const candidates = (Array.isArray(options.buildings) ? options.buildings : [])
    .map(candidatePriority)
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || a.buildingId.localeCompare(b.buildingId))
    .slice(0, limit);
  const entrances = [];
  for (const candidate of candidates) {
    const mapped = mappedByBuilding.get(candidate.buildingId);
    const entrance = mapped
      ? normalizeMappedEntrance(mapped, candidate, options.sampleGround)
      : inferEntrance(candidate, options.nearestRoad, options.sampleGround);
    if (entrance) entrances.push(entrance);
  }
  return Object.freeze({
    type: 'EntranceCatalog',
    schemaVersion: 1,
    entrances: Object.freeze(entrances),
    diagnostics: Object.freeze({
      tier,
      considered: candidates.length,
      published: entrances.length,
      mapped: entrances.filter((entrance) => entrance.provenance === 'mapped').length,
      inferred: entrances.filter((entrance) => entrance.provenance === 'inferred').length,
      limit
    })
  });
}

export { ENTRANCE_LIMIT_BY_TIER };
