import { ctx as appCtx } from "../shared-context.js?v=55";
import {appendCollisionCandidate,hasCollisionCandidate} from '../physics/collision-candidates.js';

const BUILDING_INDEX_CELL_SIZE = 120;
let buildingSpatialIndex = new Map();

export function isSuppressedBaseRoad(road) {
  return false;
}

export function isSuppressedBaseBuilding(building) {
  if (!building) return false;
  const sourceId = String(building?.sourceBuildingId || '');
  return !!(sourceId && appCtx.isLocalBuildingSuppressed?.(sourceId) === true);
}

export function clearBuildingSpatialIndex() {
  buildingSpatialIndex = new Map();
  appCtx.transportStructureColliders = [];
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

// A collision query can append to its leased buffer. Ordinary callers still
// receive their own array; they cannot observe later queries overwriting it.
export function getNearbyBuildings(x, z, radius = 80, candidates = null) {
  const baseBuildings = appCtx.buildings || [];
  const dynamicColliders = Array.isArray(appCtx.dynamicBuildingColliders) ? appCtx.dynamicBuildingColliders : [];

  // A walkable spacecraft reuses the canonical walking collision query, but
  // it is not physically co-located with the cached Earth city at local 0,0.
  // Only the published ship colliders may participate while this nested Space
  // activity is active.
  if (appCtx.activeShipInterior === true) {
    if(!candidates)return dynamicColliders;
    for(const collider of dynamicColliders)appendCollisionCandidate(candidates,collider);
    return candidates;
  }

  if (!Number.isFinite(x) || !Number.isFinite(z) || !buildingSpatialIndex || buildingSpatialIndex.size === 0) {
    if(candidates){
      for(const building of baseBuildings)if(!isSuppressedBaseBuilding(building))appendCollisionCandidate(candidates,building);
      for(const building of dynamicColliders)appendCollisionCandidate(candidates,building);
      for(const building of appCtx.transportStructureColliders || [])appendCollisionCandidate(candidates,building);
      return candidates;
    }
    return baseBuildings.filter((building) => !isSuppressedBaseBuilding(building))
      .concat(dynamicColliders, appCtx.transportStructureColliders || []);
  }

  const queryRadius = Math.max(20, radius);
  const minCellX = Math.floor((x - queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const maxCellX = Math.floor((x + queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const minCellZ = Math.floor((z - queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor((z + queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const out = candidates ? null : [];
  const seen = candidates ? null : new Set();

  for (let cx = minCellX; cx <= maxCellX; cx++) {
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const bucket = buildingSpatialIndex.get(`${cx},${cz}`);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const building = bucket[i];
        if (!building || (candidates ? hasCollisionCandidate(candidates,building) : seen.has(building)) || isSuppressedBaseBuilding(building)) continue;
        if(candidates)appendCollisionCandidate(candidates,building);
        else {seen.add(building);out.push(building);}
      }
    }
  }

    for (let i = 0; i < dynamicColliders.length; i++) {
      const building = dynamicColliders[i];
      if (!building || (candidates ? hasCollisionCandidate(candidates,building) : seen.has(building))) continue;
      if (
        x < building.minX - queryRadius ||
        x > building.maxX + queryRadius ||
        z < building.minZ - queryRadius ||
        z > building.maxZ + queryRadius
      ) {
        continue;
      }
      if(candidates)appendCollisionCandidate(candidates,building);
      else {seen.add(building);out.push(building);}
    }
  return candidates || out;
}
