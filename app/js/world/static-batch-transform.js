// Compiled batches bake their geometry in world coordinates. Visibility and
// material updates do not change their transform. Never freeze actors or skins.
export function freezeWorldBatchTransform(object) {
  const data = object?.userData;
  if (!object?.isMesh || object.isSkinnedMesh || object.children.length ||
      !(data?.isRoadBatch || data?.isUrbanSurfaceBatch || data?.isBuildingBatch || data?.isLanduseBatch)) return false;
  if (object.matrixAutoUpdate) {
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  }
  return true;
}
