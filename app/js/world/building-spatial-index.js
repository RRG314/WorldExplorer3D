const BUILDING_INDEX_CELL_SIZE = 120;
let buildingSpatialIndex = new Map();
let getBuildingsFn = () => [];
let getDynamicCollidersFn = () => [];
let getOverlayCollidersFn = () => [];
let getOverlaySuppressionFn = () => null;
const EMPTY_SUPPRESSION_SET = new Set();
const suppressionArrayCache = new WeakMap();

export function initBuildingSpatialIndex(options = {}) {
  for (const key of ['getBuildings', 'getDynamicColliders', 'getOverlayColliders', 'getOverlaySuppression']) {
    if (typeof options[key] !== 'function') {
      throw new TypeError(`Building spatial index requires ${key}().`);
    }
  }
  getBuildingsFn = options.getBuildings;
  getDynamicCollidersFn = options.getDynamicColliders;
  getOverlayCollidersFn = options.getOverlayColliders;
  getOverlaySuppressionFn = options.getOverlaySuppression;
  clearBuildingSpatialIndex();
}

function overlaySuppressionSet(key = 'roadIds') {
  const source = getOverlaySuppressionFn()?.[key];
  if (source instanceof Set) return source;
  if (Array.isArray(source)) {
    let cached = suppressionArrayCache.get(source);
    if (!cached) {
      cached = new Set(source);
      suppressionArrayCache.set(source, cached);
    }
    return cached;
  }
  return EMPTY_SUPPRESSION_SET;
}

export function isSuppressedBaseRoad(road) {
  if (!road || String(road?.sourceFeatureId || '').startsWith('overlay:')) return false;
  const sourceId = String(road?.sourceFeatureId || '');
  return !!(sourceId && overlaySuppressionSet('roadIds').has(sourceId));
}

export function isSuppressedBaseBuilding(building) {
  if (!building || String(building?.sourceBuildingId || '').startsWith('overlay:')) return false;
  const sourceId = String(building?.sourceBuildingId || '');
  return !!(sourceId && overlaySuppressionSet('buildingIds').has(sourceId));
}

export function clearBuildingSpatialIndex() {
  buildingSpatialIndex = new Map();
}

export function addBuildingToSpatialIndex(building) {
  if (!building) return;
  const minCellX = Math.floor(building.minX / BUILDING_INDEX_CELL_SIZE);
  const maxCellX = Math.floor(building.maxX / BUILDING_INDEX_CELL_SIZE);
  const minCellZ = Math.floor(building.minZ / BUILDING_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor(building.maxZ / BUILDING_INDEX_CELL_SIZE);

  for (let cx = minCellX; cx <= maxCellX; cx++) {
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const key = `${cx},${cz}`;
      let bucket = buildingSpatialIndex.get(key);
      if (!bucket) {
        bucket = [];
        buildingSpatialIndex.set(key, bucket);
      }
      bucket.push(building);
    }
  }
}

export function removeBuildingsFromSpatialIndex(buildings) {
  if (!Array.isArray(buildings) || buildings.length === 0 || buildingSpatialIndex.size === 0) return;
  const removed = new Set(buildings);
  const affectedKeys = new Set();
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!building) continue;
    const minCellX = Math.floor(building.minX / BUILDING_INDEX_CELL_SIZE);
    const maxCellX = Math.floor(building.maxX / BUILDING_INDEX_CELL_SIZE);
    const minCellZ = Math.floor(building.minZ / BUILDING_INDEX_CELL_SIZE);
    const maxCellZ = Math.floor(building.maxZ / BUILDING_INDEX_CELL_SIZE);
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) affectedKeys.add(`${cx},${cz}`);
    }
  }
  affectedKeys.forEach((key) => {
    const bucket = buildingSpatialIndex.get(key);
    if (!bucket) return;
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < bucket.length; readIndex += 1) {
      const building = bucket[readIndex];
      if (removed.has(building)) continue;
      bucket[writeIndex] = building;
      writeIndex += 1;
    }
    bucket.length = writeIndex;
    if (bucket.length === 0) buildingSpatialIndex.delete(key);
  });
}

export function getNearbyBuildings(x, z, radius = 80, output = null, dedupe = null) {
  const baseBuildings = getBuildingsFn() || [];
  const dynamicSource = getDynamicCollidersFn();
  const overlaySource = getOverlayCollidersFn();
  const dynamicColliders = Array.isArray(dynamicSource) ? dynamicSource : [];
  const overlayColliders = Array.isArray(overlaySource) ? overlaySource : [];
  const out = Array.isArray(output) ? output : [];
  out.length = 0;
  const seen = dedupe instanceof Set ? dedupe : new Set();
  seen.clear();

  if (!Number.isFinite(x) || !Number.isFinite(z) || !buildingSpatialIndex || buildingSpatialIndex.size === 0) {
    for (let i = 0; i < baseBuildings.length; i += 1) {
      if (!isSuppressedBaseBuilding(baseBuildings[i])) out.push(baseBuildings[i]);
    }
    out.push(...dynamicColliders, ...overlayColliders);
    return out;
  }

  const queryRadius = Math.max(20, radius);
  const minCellX = Math.floor((x - queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const maxCellX = Math.floor((x + queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const minCellZ = Math.floor((z - queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor((z + queryRadius) / BUILDING_INDEX_CELL_SIZE);
  for (let cx = minCellX; cx <= maxCellX; cx++) {
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const bucket = buildingSpatialIndex.get(`${cx},${cz}`);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const building = bucket[i];
        if (!building || seen.has(building) || isSuppressedBaseBuilding(building)) continue;
        seen.add(building);
        out.push(building);
      }
    }
  }

  const mergeByBounds = (buildings) => {
    for (let i = 0; i < buildings.length; i++) {
      const building = buildings[i];
      if (!building || seen.has(building)) continue;
      if (
        x < building.minX - queryRadius ||
        x > building.maxX + queryRadius ||
        z < building.minZ - queryRadius ||
        z > building.maxZ + queryRadius
      ) {
        continue;
      }
      seen.add(building);
      out.push(building);
    }
  };

  mergeByBounds(dynamicColliders);
  mergeByBounds(overlayColliders);
  return out;
}
