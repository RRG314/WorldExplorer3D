import { ctx as appCtx } from "../shared-context.js?v=55";

const BUILDING_INDEX_CELL_SIZE = 120;
let buildingSpatialIndex = new Map();

function overlaySuppressionSet(key = 'roadIds') {
  const source = appCtx.overlaySuppression?.[key];
  if (source instanceof Set) return source;
  if (Array.isArray(source)) return new Set(source);
  return new Set();
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

export function getNearbyBuildings(x, z, radius = 80) {
  const baseBuildings = appCtx.buildings || [];
  const dynamicColliders = Array.isArray(appCtx.dynamicBuildingColliders) ? appCtx.dynamicBuildingColliders : [];
  const overlayColliders = Array.isArray(appCtx.overlayRuntimeBuildingColliders) ? appCtx.overlayRuntimeBuildingColliders : [];

  if (!Number.isFinite(x) || !Number.isFinite(z) || !buildingSpatialIndex || buildingSpatialIndex.size === 0) {
    return baseBuildings.filter((building) => !isSuppressedBaseBuilding(building)).concat(dynamicColliders, overlayColliders);
  }

  const queryRadius = Math.max(20, radius);
  const minCellX = Math.floor((x - queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const maxCellX = Math.floor((x + queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const minCellZ = Math.floor((z - queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor((z + queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const out = [];
  const seen = new Set();

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
