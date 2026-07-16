export function createInitialWorldRetirementApi(options = {}) {
  const { appCtx, addBuildingToSpatialIndex, clearBuildingSpatialIndex, initialDetailRadius, queueGeometryDisposal, retainArrayItemsInPlace } = options;
  const INITIAL_DETAIL_RADIUS = initialDetailRadius;

function isStreamingMesh(mesh) {
  return !!(mesh?.userData?.earthStreamingChunk || mesh?.userData?.streamChunkKey);
}

function removeOriginalMeshes(listName) {
  const source = Array.isArray(appCtx[listName]) ? appCtx[listName] : [];
  retainArrayItemsInPlace(source, (mesh) => {
    if (isStreamingMesh(mesh)) return true;
    if (mesh?.parent) mesh.parent.remove(mesh);
    queueGeometryDisposal(mesh?.geometry);
    return false;
  });
  appCtx.replaceWorldCollection(listName, source);
}

function retireInitialEarthWorld() {
  if (appCtx.initialEarthWorldRetired) return false;
  appCtx.initialEarthWorldRetired = true;
  appCtx.cancelWorldSurfaceSync?.();

  removeOriginalMeshes('roadMeshes');
  removeOriginalMeshes('buildingMeshes');
  removeOriginalMeshes('landuseMeshes');
  removeOriginalMeshes('urbanSurfaceMeshes');
  removeOriginalMeshes('linearFeatureMeshes');
  removeOriginalMeshes('poiMeshes');
  removeOriginalMeshes('historicMarkers');
  removeOriginalMeshes('streetFurnitureMeshes');
  removeOriginalMeshes('vegetationMeshes');
  if (typeof appCtx.clearStructureVisualMeshes === 'function') appCtx.clearStructureVisualMeshes();
  else removeOriginalMeshes('structureVisualMeshes');

  retainArrayItemsInPlace(appCtx.roads, (road) => road?._streamChunkKey);
  retainArrayItemsInPlace(appCtx.buildings, (building) => building?._streamChunkKey);
  retainArrayItemsInPlace(appCtx.landuses, (landuse) => landuse?._streamChunkKey);
  retainArrayItemsInPlace(appCtx.waterAreas, (water) => water?._streamChunkKey);
  retainArrayItemsInPlace(appCtx.waterways, (waterway) => waterway?._streamChunkKey);
  retainArrayItemsInPlace(appCtx.linearFeatures, (feature) => feature?._streamChunkKey);
  appCtx.replaceWorldCollection('pois');
  appCtx.replaceWorldCollection('historicSites');
  retainArrayItemsInPlace(appCtx.vegetationFeatures, (feature) => feature?._streamChunkKey);
  appCtx.osmTreeNodes = [];
  appCtx.osmTreeRows = [];
  appCtx.replaceWorldCollection('surfaceFeatureHints');

  clearBuildingSpatialIndex();
  appCtx.buildings.forEach(addBuildingToSpatialIndex);
  appCtx.invalidateRoadCache?.();
  appCtx.invalidateTraversalNetworks?.('initial_world_stream_retired');
  appCtx.setPerfLiveStat?.('initialWorldRetired', true);
  return true;
}

function maybeRetireInitialEarthWorld(actor, snapshot) {
  if (appCtx.initialEarthWorldRetired || !actor) return false;
  const protectedRadius = Math.max(9000, (Number(appCtx.initialEarthDetailRadius) || INITIAL_DETAIL_RADIUS) * 4);
  if (Math.hypot(Number(actor.x) || 0, Number(actor.z) || 0) < protectedRadius) return false;
  const vectorLayer = snapshot?.layers?.['osm-vector'];
  if (Number(vectorLayer?.loaded || 0) < 6 || Number(vectorLayer?.pending || 0) > 2) return false;
  return retireInitialEarthWorld();
}


  return { maybeRetireInitialEarthWorld, retireInitialEarthWorld };
}
