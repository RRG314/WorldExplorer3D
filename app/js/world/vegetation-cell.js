// r128 tests InstancedMesh geometry bounds. Shared templates need cell-owned
// culling instead: keep the LOD visible so it can re-enter the frustum next frame.
export function createVegetationCell(THREE) {
  const lod = new THREE.LOD();
  const bounds = new THREE.Box3();
  const sphere = new THREE.Sphere();
  const worldSphere = new THREE.Sphere();
  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  const updateLevel = lod.update;
  lod.includeBounds = box => { bounds.union(box); bounds.getBoundingSphere(sphere); };
  lod.update = function(camera) {
    updateLevel.call(this, camera);
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    worldSphere.copy(sphere).applyMatrix4(this.matrixWorld);
    if (!frustum.intersectsSphere(worldSphere)) {
      for (const level of this.levels) level.object.visible = false;
    }
  };
  return lod;
}
