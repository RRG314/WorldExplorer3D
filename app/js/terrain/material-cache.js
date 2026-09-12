import { ctx as appCtx } from '../shared-context.js?v=55';
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

    materials.roadMainMaterial.map = appCtx.asphaltTex || null;
    materials.roadMainMaterial.normalMap = appCtx.asphaltNormal || null;
    materials.roadMainMaterial.roughnessMap = appCtx.asphaltRoughness || null;
    materials.roadMainMaterial.normalScale?.set(0.18, 0.18);
    materials.roadMainMaterial.needsUpdate = true;

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
