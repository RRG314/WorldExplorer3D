import {
  createRoadSurfaceMaterials,
  disposeRoadSurfaceMaterials,
  roadSurfaceMaterialCacheKey
} from "../road-render.js?v=2";

function createTerrainMaterialCacheApi(deps = {}) {
  const { appCtx, terrainState } = deps;

  function disposeRoadMaterialCache() {
    if (!terrainState._roadMaterials) return;
    disposeRoadSurfaceMaterials(terrainState._roadMaterials);
    terrainState._roadMaterials = null;
    terrainState._roadMaterialCacheKey = "";
  }

  function disposeUrbanSurfaceMaterialCache() {
    if (!terrainState._urbanSurfaceMaterials) return;
    disposeRoadSurfaceMaterials(terrainState._urbanSurfaceMaterials);
    terrainState._urbanSurfaceMaterials = null;
    terrainState._urbanSurfaceMaterialCacheKey = "";
  }

  function getSharedRoadMaterials() {
    const key = roadSurfaceMaterialCacheKey({
      asphaltTex: appCtx.asphaltTex,
      asphaltNormal: appCtx.asphaltNormal,
      asphaltRoughness: appCtx.asphaltRoughness
    });
    if (terrainState._roadMaterials && terrainState._roadMaterialCacheKey === key) return terrainState._roadMaterials;

    disposeRoadMaterialCache();
    const materials = createRoadSurfaceMaterials({
      asphaltTex: appCtx.asphaltTex,
      asphaltNormal: appCtx.asphaltNormal,
      asphaltRoughness: appCtx.asphaltRoughness,
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

  function getSharedUrbanSurfaceMaterials() {
    const key = roadSurfaceMaterialCacheKey({
      sidewalkTex: appCtx.pavementDiffuse || appCtx.concreteDiffuse,
      sidewalkNormal: appCtx.pavementNormal || appCtx.concreteNormal,
      sidewalkRoughness: appCtx.pavementRoughness || appCtx.concreteRoughness,
      includeSidewalk: true
    });
    if (terrainState._urbanSurfaceMaterials && terrainState._urbanSurfaceMaterialCacheKey === key) {
      return terrainState._urbanSurfaceMaterials;
    }

    disposeUrbanSurfaceMaterialCache();
    const materials = createRoadSurfaceMaterials({
      sidewalkTex: appCtx.pavementDiffuse || appCtx.concreteDiffuse,
      sidewalkNormal: appCtx.pavementNormal || appCtx.concreteNormal,
      sidewalkRoughness: appCtx.pavementRoughness || appCtx.concreteRoughness,
      includeSidewalk: true
    });
    terrainState._urbanSurfaceMaterialCacheKey = key;
    terrainState._urbanSurfaceMaterials = { sidewalkMat: materials.sidewalkMaterial };
    return terrainState._urbanSurfaceMaterials;
  }

  return {
    getSharedRoadMaterials,
    getSharedUrbanSurfaceMaterials
  };
}

export { createTerrainMaterialCacheApi };
