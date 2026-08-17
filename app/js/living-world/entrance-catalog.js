const EXCLUDED_BUILDING_TYPES = new Set([
  'roof', 'canopy', 'carport', 'bridge', 'bridge_guardrail', 'shed'
]);

const COMMERCIAL_BUILDING_TYPES = new Set([
  'commercial', 'retail', 'office', 'hotel', 'supermarket', 'mall', 'civic',
  'public', 'hospital', 'school', 'university', 'train_station'
]);

const ENTRANCE_LIMIT_BY_TIER = Object.freeze({
  low: 36,
  performance: 56,
  balanced: 112,
  quality: 180
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

function projectToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 1e-9
    ? Math.max(0.08, Math.min(0.92, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared))
    : 0.5;
  return {
    x: start.x + dx * t,
    z: start.z + dz * t,
    t,
    distance: Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t))
  };
}

function stableBuildingId(building, index) {
  return String(
    building?.sourceBuildingId ||
    building?.id ||
    `footprint:${Math.round(finite(building?.centerX))}:${Math.round(finite(building?.centerZ))}:${index}`
  );
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

function normalizeMappedEntrance(mapped, candidate) {
  if (!Number.isFinite(mapped?.x) || !Number.isFinite(mapped?.z)) return null;
  const center = candidate.center;
  let normalX = finite(mapped.normalX, mapped.x - center.x);
  let normalZ = finite(mapped.normalZ, mapped.z - center.z);
  const normalLength = Math.hypot(normalX, normalZ) || 1;
  normalX /= normalLength;
  normalZ /= normalLength;
  const baseY = finite(mapped.y, finite(candidate.building?.baseY, finite(candidate.building?.minY, 0)));
  return Object.freeze({
    id: `entrance:${candidate.buildingId}:mapped:${String(mapped.id || '0')}`,
    buildingSourceId: candidate.buildingId,
    buildingType: candidate.buildingType,
    commercial: candidate.commercial,
    provenance: 'mapped',
    x: Number(mapped.x),
    y: baseY,
    z: Number(mapped.z),
    approachX: Number(mapped.x) + normalX * 1.8,
    approachY: baseY,
    approachZ: Number(mapped.z) + normalZ * 1.8,
    normalX,
    normalZ,
    tangentX: -normalZ,
    tangentZ: normalX,
    yaw: Math.atan2(normalX, normalZ),
    levels: Math.max(1, Math.round(finite(candidate.building?.levels, 1))),
    height: Math.max(2.7, finite(candidate.building?.height, 3.2))
  });
}

function inferEntrance(candidate, nearestRoad) {
  const building = candidate.building;
  const baseY = finite(building?.baseY, finite(building?.minY, 0));
  const roadHit = typeof nearestRoad === 'function'
    ? nearestRoad(candidate.center.x, candidate.center.z, { y: baseY, maxVerticalDelta: 5.5 })
    : null;
  const target = Number.isFinite(roadHit?.pt?.x) && Number.isFinite(roadHit?.pt?.z)
    ? { x: Number(roadHit.pt.x), z: Number(roadHit.pt.z) }
    : { x: 0, z: 0 };
  let best = null;
  for (let index = 0; index < candidate.points.length; index += 1) {
    const start = candidate.points[index];
    const end = candidate.points[(index + 1) % candidate.points.length];
    const projection = projectToSegment(target, start, end);
    if (!best || projection.distance < best.projection.distance) {
      best = { start, end, projection, edgeIndex: index };
    }
  }
  if (!best) return null;
  let normalX = best.projection.x - candidate.center.x;
  let normalZ = best.projection.z - candidate.center.z;
  const normalLength = Math.hypot(normalX, normalZ) || 1;
  normalX /= normalLength;
  normalZ /= normalLength;
  const tangentLength = Math.hypot(best.end.x - best.start.x, best.end.z - best.start.z) || 1;
  const tangentX = (best.end.x - best.start.x) / tangentLength;
  const tangentZ = (best.end.z - best.start.z) / tangentLength;
  const x = best.projection.x + normalX * 0.08;
  const z = best.projection.z + normalZ * 0.08;
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
    roadSourceId: String(roadHit?.road?.sourceRoadId || roadHit?.road?.sourceWayId || roadHit?.road?.id || '')
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
      ? normalizeMappedEntrance(mapped, candidate)
      : inferEntrance(candidate, options.nearestRoad);
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
