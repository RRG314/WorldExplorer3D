const DEFAULT_CELL_SIZE = 192;
const DEFAULT_MAX_CELLS_PER_ITEM = 4096;

function finiteBounds(bounds) {
  if (!bounds) return null;
  const minX = Number(bounds.minX);
  const maxX = Number(bounds.maxX);
  const minZ = Number(bounds.minZ);
  const maxZ = Number(bounds.maxZ);
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
  if (maxX < minX || maxZ < minZ) return null;
  return { minX, maxX, minZ, maxZ };
}

export function createSpatialBoundsIndex(items = [], options = {}) {
  const cellSize = Math.max(8, Number(options.cellSize) || DEFAULT_CELL_SIZE);
  const maxCellsPerItem = Math.max(
    1,
    Math.floor(Number(options.maxCellsPerItem) || DEFAULT_MAX_CELLS_PER_ITEM)
  );
  const boundsForItem = typeof options.boundsForItem === "function"
    ? options.boundsForItem
    : (item) => item?.bounds;
  const cells = new Map();
  const overflow = [];
  const allItems = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const bounds = finiteBounds(boundsForItem(item));
    if (!bounds) continue;
    allItems.push(item);
    const minCellX = Math.floor(bounds.minX / cellSize);
    const maxCellX = Math.floor(bounds.maxX / cellSize);
    const minCellZ = Math.floor(bounds.minZ / cellSize);
    const maxCellZ = Math.floor(bounds.maxZ / cellSize);
    const cellCount = (maxCellX - minCellX + 1) * (maxCellZ - minCellZ + 1);
    if (!Number.isFinite(cellCount) || cellCount > maxCellsPerItem) {
      overflow.push(item);
      continue;
    }
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        const key = `${cellX},${cellZ}`;
        const bucket = cells.get(key);
        if (bucket) bucket.push(item);
        else cells.set(key, [item]);
      }
    }
  }

  return {
    cellSize,
    maxCellsPerItem,
    cells,
    overflow,
    allItems
  };
}

export function querySpatialBoundsIndex(index, queryBounds) {
  const bounds = finiteBounds(queryBounds);
  if (!index?.cells || !bounds) return [];
  const cellSize = Math.max(8, Number(index.cellSize) || DEFAULT_CELL_SIZE);
  const minCellX = Math.floor(bounds.minX / cellSize);
  const maxCellX = Math.floor(bounds.maxX / cellSize);
  const minCellZ = Math.floor(bounds.minZ / cellSize);
  const maxCellZ = Math.floor(bounds.maxZ / cellSize);
  const cellCount = (maxCellX - minCellX + 1) * (maxCellZ - minCellZ + 1);
  if (!Number.isFinite(cellCount) || cellCount > (Number(index.maxCellsPerItem) || DEFAULT_MAX_CELLS_PER_ITEM)) {
    return Array.isArray(index.allItems) ? index.allItems.slice() : [];
  }

  const result = Array.isArray(index.overflow) ? index.overflow.slice() : [];
  const seen = new Set(result);
  for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      const bucket = index.cells.get(`${cellX},${cellZ}`) || [];
      for (let i = 0; i < bucket.length; i++) {
        const item = bucket[i];
        if (seen.has(item)) continue;
        seen.add(item);
        result.push(item);
      }
    }
  }
  return result;
}

export function querySpatialBoundsPoint(index, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
  return querySpatialBoundsIndex(index, {
    minX: x,
    maxX: x,
    minZ: z,
    maxZ: z
  });
}
