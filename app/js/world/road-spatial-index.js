const ROAD_INDEX_CELL_SIZE = 220;

let cache = {
  base: null,
  overlay: null,
  baseLength: -1,
  overlayLength: -1,
  baseFirst: null,
  baseLast: null,
  overlayFirst: null,
  overlayLast: null,
  cells: new Map(),
  rebuilds: 0,
  incrementalAdds: 0
};

function sourceChanged(base, overlay) {
  return (
    cache.base !== base ||
    cache.overlay !== overlay ||
    cache.baseLength !== base.length ||
    cache.overlayLength !== overlay.length ||
    cache.baseFirst !== base[0] ||
    cache.baseLast !== base[base.length - 1] ||
    cache.overlayFirst !== overlay[0] ||
    cache.overlayLast !== overlay[overlay.length - 1]
  );
}

function roadBounds(road) {
  const points = Array.isArray(road?.pts) ? road.pts : [];
  if (points.length < 2) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const x = Number(points[i]?.x);
    const z = Number(points[i]?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return Number.isFinite(minX) ? { minX, maxX, minZ, maxZ } : null;
}

function addRoad(cells, road) {
  const bounds = roadBounds(road);
  if (!bounds) return;
  const minCellX = Math.floor(bounds.minX / ROAD_INDEX_CELL_SIZE);
  const maxCellX = Math.floor(bounds.maxX / ROAD_INDEX_CELL_SIZE);
  const minCellZ = Math.floor(bounds.minZ / ROAD_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor(bounds.maxZ / ROAD_INDEX_CELL_SIZE);
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      const key = `${cellX},${cellZ}`;
      const bucket = cells.get(key) || [];
      bucket.push(road);
      cells.set(key, bucket);
    }
  }
}

function rebuild(base, overlay) {
  const cells = new Map();
  base.forEach((road) => addRoad(cells, road));
  overlay.forEach((road) => addRoad(cells, road));
  cache = {
    base,
    overlay,
    baseLength: base.length,
    overlayLength: overlay.length,
    baseFirst: base[0] || null,
    baseLast: base[base.length - 1] || null,
    overlayFirst: overlay[0] || null,
    overlayLast: overlay[overlay.length - 1] || null,
    cells,
    rebuilds: cache.rebuilds + 1,
    incrementalAdds: cache.incrementalAdds
  };
}

function isAppendOnly(source, cachedSource, cachedLength, cachedFirst, cachedLast) {
  if (source !== cachedSource || cachedLength < 0 || source.length < cachedLength) return false;
  if (cachedLength === 0) return true;
  return source[0] === cachedFirst && source[cachedLength - 1] === cachedLast;
}

function appendNewRoads(base, overlay) {
  const baseStart = cache.baseLength;
  const overlayStart = cache.overlayLength;
  for (let i = baseStart; i < base.length; i += 1) addRoad(cache.cells, base[i]);
  for (let i = overlayStart; i < overlay.length; i += 1) addRoad(cache.cells, overlay[i]);
  cache.incrementalAdds += Math.max(0, base.length - baseStart) + Math.max(0, overlay.length - overlayStart);
  cache.baseLength = base.length;
  cache.overlayLength = overlay.length;
  cache.baseFirst = base[0] || null;
  cache.baseLast = base[base.length - 1] || null;
  cache.overlayFirst = overlay[0] || null;
  cache.overlayLast = overlay[overlay.length - 1] || null;
}

function syncIndex(base, overlay) {
  if (!sourceChanged(base, overlay)) return;
  const baseAppendOnly = isAppendOnly(base, cache.base, cache.baseLength, cache.baseFirst, cache.baseLast);
  const overlayAppendOnly = isAppendOnly(overlay, cache.overlay, cache.overlayLength, cache.overlayFirst, cache.overlayLast);
  if (baseAppendOnly && overlayAppendOnly) {
    appendNewRoads(base, overlay);
    return;
  }
  rebuild(base, overlay);
}

export function queryNearbyRoads(baseRoads, overlayRoads, x, z, radius = 260) {
  const base = Array.isArray(baseRoads) ? baseRoads : [];
  const overlay = Array.isArray(overlayRoads) ? overlayRoads : [];
  syncIndex(base, overlay);
  if (!Number.isFinite(x) || !Number.isFinite(z) || cache.cells.size === 0) return base.concat(overlay);

  const queryRadius = Math.max(ROAD_INDEX_CELL_SIZE, Number(radius) || 0);
  const minCellX = Math.floor((x - queryRadius) / ROAD_INDEX_CELL_SIZE);
  const maxCellX = Math.floor((x + queryRadius) / ROAD_INDEX_CELL_SIZE);
  const minCellZ = Math.floor((z - queryRadius) / ROAD_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor((z + queryRadius) / ROAD_INDEX_CELL_SIZE);
  const result = [];
  const seen = new Set();
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      const bucket = cache.cells.get(`${cellX},${cellZ}`) || [];
      for (let i = 0; i < bucket.length; i += 1) {
        const road = bucket[i];
        if (!road || seen.has(road)) continue;
        seen.add(road);
        result.push(road);
      }
    }
  }
  return result;
}

export function roadSpatialIndexSnapshot() {
  return {
    cellSize: ROAD_INDEX_CELL_SIZE,
    cells: cache.cells.size,
    roads: Math.max(0, cache.baseLength) + Math.max(0, cache.overlayLength),
    rebuilds: cache.rebuilds,
    incrementalAdds: cache.incrementalAdds
  };
}
