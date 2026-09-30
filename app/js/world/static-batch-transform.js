// Compiled batches and buildings with an immutable accepted-ground foundation
// retain their transform. Visibility/material changes do not move them.
// Unresolved foundations, actors, skins and interactive parents stay automatic.
export function freezeWorldBatchTransform(object) {
  const data = object?.userData;
  const fixedFoundation = data?.buildingProvenance?.foundation?.authority === 'accepted_ground' &&
    Number.isFinite(data.buildingProvenance.foundation.baseY);
  if (!object?.isMesh || object.isSkinnedMesh || object.children.length ||
      !(data?.isRoadBatch || data?.isUrbanSurfaceBatch || data?.isBuildingBatch || data?.isLanduseBatch || fixedFoundation)) return false;
  if (object.matrixAutoUpdate) {
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  }
  return true;
}
