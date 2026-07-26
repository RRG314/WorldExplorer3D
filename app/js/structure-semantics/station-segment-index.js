const DEFAULT_CELL_SIZE = 64;
const indexCache = new WeakMap();

function createSegmentIndex(feature, cellSize = DEFAULT_CELL_SIZE) {
  const points = Array.isArray(feature?.pts) ? feature.pts : [];
  const segmentCount = Math.max(0, points.length - 1);
  const cached = indexCache.get(feature);
  if (cached?.points === points && cached.segmentCount === segmentCount && cached.cellSize === cellSize) {
    return cached;
  }

  const grid = new Map();
  for (let index = 0; index < segmentCount; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    const bounds = {
      minX: Math.min(start.x, end.x),
      maxX: Math.max(start.x, end.x),
      minZ: Math.min(start.z, end.z),
      maxZ: Math.max(start.z, end.z)
    };
    const segment = { index, start, end, bounds };
    const minCellX = Math.floor(bounds.minX / cellSize);
    const maxCellX = Math.floor(bounds.maxX / cellSize);
    const minCellZ = Math.floor(bounds.minZ / cellSize);
    const maxCellZ = Math.floor(bounds.maxZ / cellSize);
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        const key = `${cellX},${cellZ}`;
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(segment);
      }
    }
  }

  const result = { points, segmentCount, cellSize, grid };
  indexCache.set(feature, result);
  return result;
}

function querySegmentIndex(index, bounds) {
  const candidates = new Set();
  if (!index?.grid || !bounds) return candidates;
  const cellSize = index.cellSize || DEFAULT_CELL_SIZE;
  const minCellX = Math.floor(bounds.minX / cellSize);
  const maxCellX = Math.floor(bounds.maxX / cellSize);
  const minCellZ = Math.floor(bounds.minZ / cellSize);
  const maxCellZ = Math.floor(bounds.maxZ / cellSize);
  for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      const bucket = index.grid.get(`${cellX},${cellZ}`) || [];
      for (let i = 0; i < bucket.length; i++) candidates.add(bucket[i]);
    }
  }
  return candidates;
}

export { createSegmentIndex, querySegmentIndex };
