import {
  createRoadSurfaceMaterials,
  disposeRoadSurfaceMaterials,
  roadSurfaceMaterialCacheKey
} from "../road-render.js?v=4";

function createTerrainMaterialCacheApi(deps = {}) {
  const { terrainState } = deps;

  function disposeRoadMaterialCache() {
    if (!terrainState._roadMaterials) return;
    disposeRoadSurfaceMaterials(terrainState._roadMaterials);
    terrainState._roadMaterials = null;
    terrainState._roadMaterialCacheKey = "";
  }

  function getSharedRoadMaterials() {
    const key = roadSurfaceMaterialCacheKey({
      includeMarkings: true
    });
    if (terrainState._roadMaterials && terrainState._roadMaterialCacheKey === key) return terrainState._roadMaterials;

    disposeRoadMaterialCache();
    const materials = createRoadSurfaceMaterials({
      includeMarkings: true
    });

    terrainState._roadMaterialCacheKey = key;
    terrainState._roadMaterials = {
      roadMat: materials.roadMainMaterial,
      skirtMat: materials.roadSkirtMaterial,
      markMat: materials.roadMarkMaterial
    };
    return terrainState._roadMaterials;
  }

  return {
    getSharedRoadMaterials
  };
}

export { createTerrainMaterialCacheApi };
