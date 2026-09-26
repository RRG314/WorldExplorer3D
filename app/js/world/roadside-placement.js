import { roadWidthAtSegment } from './road-cross-section-profile.js?v=1';

const CELL_SIZE = 64;
const clearance = 1.1; // Pole/bin footprint plus a margin outside the travel surface.
const enabledTag = value => value === true || ['yes', 'true', '1'].includes(String(value).toLowerCase());
export function isGroundRoad(road) {
  return !enabledTag(road?.bridge) && !enabledTag(road?.tunnel) &&
    !enabledTag(road?.isBridge) && !enabledTag(road?.isTunnel) &&
    !['elevated', 'subgrade'].includes(road?.structureSemantics?.terrainMode || road?.structure?.terrainMode || road?.transportRecord?.structure?.terrainMode);
}

// Build once per publication. Every proposed fixture is tested against ALL
// intersecting road envelopes, including the other arm of a junction.
export function createRoadsidePlacementResolver(roads = [], { blocked = () => false } = {}) {
  const cells = new Map(), broad = [], occupied = [], gradeSeparated = [];
  const key = (x, z) => `${Math.floor(x / CELL_SIZE)}:${Math.floor(z / CELL_SIZE)}`;
  for (const road of roads) {
    const points = road.pts || [];
    for (let index = 0; index + 1 < points.length; index++) {
      const a = points[index], b = points[index + 1];
      if (![a.x, a.z, b.x, b.z].every(Number.isFinite)) continue;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < .01) continue;
      const width = Math.max(...[0, .5, 1].map(t => roadWidthAtSegment(road, index, t)));
      const segment = { road, index, a, b, length, width };
      if (!isGroundRoad(road)) { gradeSeparated.push(segment); continue; }
      const padding = width / 2 + clearance;
      const minX = Math.floor((Math.min(a.x, b.x) - padding) / CELL_SIZE), maxX = Math.floor((Math.max(a.x, b.x) + padding) / CELL_SIZE);
      const minZ = Math.floor((Math.min(a.z, b.z) - padding) / CELL_SIZE), maxZ = Math.floor((Math.max(a.z, b.z) + padding) / CELL_SIZE);
      if ((maxX - minX + 1) * (maxZ - minZ + 1) > 1024) { broad.push(segment); continue; }
      for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        const k = `${x}:${z}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(segment);
      }
    }
  }
  function projection(point, segment, along = 0) {
    const { a, b, length, road, index } = segment;
    const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * ux + (point.z - a.z) * uz + along) / length));
    const x = a.x + ux * length * t, z = a.z + uz * length * t;
    return { x, z, ux, uz, t, width: roadWidthAtSegment(road, index, t), distance: Math.hypot(point.x - x, point.z - z) };
  }
  function roadBlocked(point) {
    return [...(cells.get(key(point.x, point.z)) || []), ...broad].some(segment => {
      const p = projection(point, segment);
      return p.distance < p.width / 2 + clearance;
    });
  }
  function safe(point) {
    // This builder owns ground fixtures. A mapped bridge/tunnel pole requires
    // a structure-local anchor, not the unrelated ground underneath it.
    const unsupportedStructure = gradeSeparated.some(segment => {
      const p = projection(point, segment);
      return p.distance < p.width / 2 + 3;
    });
    return !unsupportedStructure && !roadBlocked(point) && !blocked(point.x, point.z) &&
      !occupied.some(other => Math.hypot(point.x - other.x, point.z - other.z) < 2.2);
  }
  function resolve(point, { preferOriginal = false, maxMove = 26 } = {}) {
    if (![point?.x, point?.z].every(Number.isFinite)) return null;
    const nearby = new Set(broad);
    for (let x = point.x - 64; x <= point.x + 64; x += CELL_SIZE) for (let z = point.z - 64; z <= point.z + 64; z += CELL_SIZE) {
      for (const s of cells.get(key(x, z)) || []) nearby.add(s);
    }
    const choices = [...nearby].map(segment => ({ segment, p: projection(point, segment) }))
      .filter(({ segment, p }) => p.distance <= 42 && segment.road.driveable !== false)
      .sort((a, b) => a.p.distance - b.p.distance).slice(0, 6);
    if (!choices.length) return preferOriginal && safe(point) ? { ...point, centerX: point.x, centerZ: point.z, yaw: 0 } : null;
    const finish = (candidate, p, segment) => ({ ...candidate, centerX: p.x, centerZ: p.z, yaw: Math.atan2(p.ux, p.uz), road: segment.road, segmentIndex: segment.index });
    if (preferOriginal && safe(point)) return finish(point, choices[0].p, choices[0].segment);
    let best = null, bestDistance = Infinity;
    for (const { segment, p: initial } of choices) {
      const preferredSide = (point.x - initial.x) * -initial.uz + (point.z - initial.z) * initial.ux < 0 ? -1 : 1;
      for (const along of [0, -4, 4, -8, 8, -12, 12, -20, 20]) for (const side of [preferredSide, -preferredSide]) {
        const p = projection(point, segment, along), offset = p.width / 2 + 1.6;
        const candidate = { x: p.x - p.uz * offset * side, z: p.z + p.ux * offset * side };
        const distance = Math.hypot(candidate.x - point.x, candidate.z - point.z);
        if (distance > maxMove || distance >= bestDistance || !safe(candidate)) continue;
        best = finish(candidate, p, segment); bestDistance = distance;
      }
    }
    return best;
  }
  return Object.freeze({ resolve, roadBlocked, reserve(point) { if (point) occupied.push({ x: point.x, z: point.z }); } });
}
