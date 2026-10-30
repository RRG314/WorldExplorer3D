import { ctx as appCtx } from '../shared-context.js?v=55';
import {
  createRoadSurfaceMaterials,createRoadEdgeBandMaterial,
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

  function withEdgeBandMaterial(materials,includeEdgeBands){
    if(includeEdgeBands&&!materials.edgeBandMat){
      const material=createRoadEdgeBandMaterial();
      material.normalMap=appCtx.asphaltNormal||null;material.normalScale?.set(.12,.12);
      materials.edgeBandMat=material;
    }
    return materials;
  }
  function getSharedRoadMaterials({includeEdgeBands=false}={}) {
    const key = roadSurfaceMaterialCacheKey({
      includeMarkings: true
    });
    if (terrainState._roadMaterials && terrainState._roadMaterialCacheKey === key) return withEdgeBandMaterial(terrainState._roadMaterials,includeEdgeBands);

    disposeRoadMaterialCache();
    const materials = createRoadSurfaceMaterials({
      includeMarkings: true
    });

    materials.roadMainMaterial.map = appCtx.asphaltTex || null;
    // The map already contains dark asphalt albedo. Multiplying it
    // by a second charcoal tint made paved streets almost black in daylight.
    materials.roadMainMaterial.color.setHex(appCtx.asphaltTex ? 0xffffff : 0x303236);
    materials.roadMainMaterial.normalMap = appCtx.asphaltNormal || null;
    materials.roadMainMaterial.roughnessMap = appCtx.asphaltRoughness || null;
    materials.roadMainMaterial.metalness = 0;
    materials.roadMainMaterial.roughness = 1;
    materials.roadMainMaterial.normalScale?.set(0.18, 0.18);
    materials.roadMainMaterial.needsUpdate = true;

    terrainState._roadMaterialCacheKey = key;
    terrainState._roadMaterials = {
      roadMat: materials.roadMainMaterial,
      skirtMat: materials.roadSkirtMaterial,
      markMat: materials.roadMarkMaterial
    };
    return withEdgeBandMaterial(terrainState._roadMaterials,includeEdgeBands);
  }

  return {
    getSharedRoadMaterials
  };
}

export { createTerrainMaterialCacheApi };
