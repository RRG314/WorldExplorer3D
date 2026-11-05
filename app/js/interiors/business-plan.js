import { pointInPolygonSafe, footprintBounds } from './core.js?v=4';
import { polygonEdgeClearance } from './planner.js?v=6';

export function businessFixtureBounds(fixture) {
  const c = Math.cos(fixture.yaw || 0),
    s = Math.sin(fixture.yaw || 0),
    hw = fixture.width / 2,
    hd = fixture.depth / 2;
  const pts = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([x, z]) => ({ x: fixture.x + x * c - z * s, z: fixture.z + x * s + z * c }));
  return {
    pts,
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minZ: Math.min(...pts.map((p) => p.z)),
    maxZ: Math.max(...pts.map((p) => p.z)),
  };
}

export function businessFixtureFits(fixture, footprint, entry, colliders = [], placed = []) {
  const yaw = fixture.yaw || 0,
    c = Math.cos(yaw),
    s = Math.sin(yaw),
    hw = fixture.width / 2 + 0.15,
    hd = fixture.depth / 2 + 0.15;
  const points = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
    [0, 0],
  ].map(([x, z]) => ({ x: fixture.x + x * c - z * s, z: fixture.z + x * s + z * c }));
  if (
    points.some(
      (p) => !pointInPolygonSafe(p.x, p.z, footprint) || polygonEdgeClearance(p, footprint) < 0.18
    )
  )
    return false;
  const radius = Math.hypot(hw, hd),
    extentX = Math.abs(c) * hw + Math.abs(s) * hd,
    extentZ = Math.abs(s) * hw + Math.abs(c) * hd;
  if (entry && Math.hypot(fixture.x - entry.x, fixture.z - entry.z) < radius + 1.6) return false;
  for (const record of [...colliders, ...placed]) {
    const item = Number.isFinite(record.minX) ? record : businessFixtureBounds(record);
    const minX = item.minX ?? item.x - item.width / 2,
      maxX = item.maxX ?? item.x + item.width / 2,
      minZ = item.minZ ?? item.z - item.depth / 2,
      maxZ = item.maxZ ?? item.z + item.depth / 2;
    if (
      fixture.x + extentX > minX - 0.25 &&
      fixture.x - extentX < maxX + 0.25 &&
      fixture.z + extentZ > minZ - 0.25 &&
      fixture.z - extentZ < maxZ + 0.25
    )
      return false;
  }
  return true;
}

export function createBusinessFixturePlan({
  footprint = [],
  entry,
  colliders = [],
  program = 'general-retail',
} = {}) {
  if (footprint.length < 3) return [];
  const bounds = footprintBounds(footprint),
    cx = (bounds.minX + bounds.maxX) / 2,
    cz = (bounds.minZ + bounds.maxZ) / 2;
  // Reserve a continuous circulation spine from the entrance through the room.
  const axis = entry ? { x: cx - entry.x, z: cz - entry.z } : null;
  const length = axis ? Math.hypot(axis.x, axis.z) : 0;
  const candidates = [];
  const step = 3.4;
  for (let z = bounds.minZ + 2; z <= bounds.maxZ - 2; z += step)
    for (let x = bounds.minX + 2; x <= bounds.maxX - 2; x += step) {
      if (length > 0) {
        const along = ((x - entry.x) * axis.x + (z - entry.z) * axis.z) / length,
          across = Math.abs((x - entry.x) * axis.z - (z - entry.z) * axis.x) / length;
        if (across < 1.1 && along < length + 1) continue;
      }
      candidates.push({ x, z });
    }
  candidates.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
  const furniture = [];
  const add = (kind, p, width, depth, yaw = 0) => {
    const facing = entry
      ? Math.round(Math.atan2(entry.x - cx, entry.z - cz) / (Math.PI / 2)) * (Math.PI / 2)
      : yaw;
    const f = { kind, x: p.x, z: p.z, width, depth, yaw: facing };
    if (businessFixtureFits(f, footprint, entry, colliders, furniture)) {
      furniture.push(f);
      return true;
    }
    return false;
  };
  for (const p of candidates) {
    if (furniture.length >= 18) break;
    const index = furniture.length;
    const kind =
      program === 'food-service'
        ? index === 0
          ? 'reception'
          : index <= 6
            ? 'dining'
            : 'shelves'
        : program === 'education'
          ? index < 6
            ? 'desk'
            : 'books'
          : program === 'office'
            ? 'desk'
            : program === 'banking'
              ? index < 2
                ? 'reception'
                : 'desk'
              : program === 'hotel-lobby'
                ? ['reception', 'lounge', 'lounge', 'planter', 'luggage', 'lounge', 'planter'][
                    index % 7
                  ]
                : program === 'medical-service'
                  ? index < 2
                    ? 'reception'
                    : 'medical'
                  : program === 'automotive-service'
                    ? index < 2
                      ? 'workbench'
                      : 'wheels'
                    : program === 'civic-service'
                      ? index < 2
                        ? 'desk'
                        : 'locker'
                      : program === 'postal'
                        ? index < 2
                          ? 'reception'
                          : 'parcels'
                        : program === 'visitor-gallery'
                          ? 'exhibit'
                          : program === 'library'
                            ? index === 0
                              ? 'desk'
                              : 'books'
                            : index === 0
                              ? 'reception'
                              : 'shelves';
    add(kind, p, kind === 'dining' ? 2.5 : 2, kind === 'dining' ? 2.5 : 1.6);
  }
  return furniture;
}
