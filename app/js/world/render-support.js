import { geometryHasFinitePositions } from "./geometry-batching.js?v=4";
import { initRoofDetailSupport, createRoofDetailMesh } from "./roof-details.js?v=2";
import { registerWaterWaveMaterial } from "./water-materials.js?v=1";
import {
  batchMidLodBuildingMeshes,
  batchNearLodBuildingMeshes
} from "./building-batching.js?v=9";
import { batchLanduseMeshes } from "./landuse-batching.js?v=3";

export function initWorldRenderSupport(options = {}) {
  initRoofDetailSupport(options);
}

export {
  batchLanduseMeshes,
  batchMidLodBuildingMeshes,
  batchNearLodBuildingMeshes,
  createRoofDetailMesh,
  geometryHasFinitePositions,
  registerWaterWaveMaterial
};
