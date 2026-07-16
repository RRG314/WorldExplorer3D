import { ctx as appCtx } from '../shared-context.js?v=55';

export const WORLD_COLLECTION_NAMES = Object.freeze([
  'roads',
  'roadMeshes',
  'urbanSurfaceMeshes',
  'buildings',
  'buildingMeshes',
  'dynamicBuildingColliders',
  'landuses',
  'surfaceFeatureHints',
  'landuseMeshes',
  'waterAreas',
  'waterways',
  'waterWaveVisuals',
  'linearFeatures',
  'linearFeatureMeshes',
  'structureVisualMeshes',
  'pois',
  'poiMeshes',
  'historicSites',
  'historicMarkers',
  'streetFurnitureMeshes',
  'vegetationFeatures',
  'vegetationMeshes'
]);

const worldCollectionNames = new Set(WORLD_COLLECTION_NAMES);

export function replaceWorldCollection(name, next = []) {
  if (!worldCollectionNames.has(name)) throw new Error(`Unknown world collection: ${name}`);
  if (!Array.isArray(next)) throw new TypeError(`World collection ${name} must be an array.`);
  appCtx[name] = next;
  return next;
}

export function clearWorldCollections(names = WORLD_COLLECTION_NAMES) {
  names.forEach((name) => replaceWorldCollection(name, []));
}

export function getWorldCollectionCounts() {
  return Object.fromEntries(WORLD_COLLECTION_NAMES.map((name) => [name, appCtx[name]?.length || 0]));
}

Object.assign(appCtx, {
  clearWorldCollections,
  getWorldCollectionCounts,
  replaceWorldCollection,
  WORLD_COLLECTION_NAMES
});
