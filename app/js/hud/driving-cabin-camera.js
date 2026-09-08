// E34 driver eye, in the normalized player vehicle host's local coordinates.
// Keep the real cabin rendered; near clipping is scoped to this camera owner.
export function applyDrivingCabinCamera(THREE, camera, mesh, look = {}) {
  if (!mesh || !camera) return false;
  mesh.visible = true;
  mesh.updateWorldMatrix(true, false);
  const eye = new THREE.Vector3(0.35, -0.03, -0.05);
  const yaw = Number(look.yaw) || 0, pitch = Number(look.pitch) || 0;
  const target = eye.clone().add(new THREE.Vector3(Math.sin(yaw)*10,Math.sin(pitch)*10,Math.cos(yaw)*10));
  camera.position.copy(mesh.localToWorld(eye));
  camera.lookAt(mesh.localToWorld(target));
  setCabinNearClip(camera, true);
  return true;
}

export function setCabinNearClip(camera, active) {
  if (active) {
    if (camera.userData.drivingCabinPreviousNear == null) camera.userData.drivingCabinPreviousNear = camera.near;
    if (camera.near !== 0.04) { camera.near = 0.04; camera.updateProjectionMatrix(); }
  } else if (camera.userData.drivingCabinPreviousNear != null) {
    camera.near = camera.userData.drivingCabinPreviousNear;
    delete camera.userData.drivingCabinPreviousNear;
    camera.updateProjectionMatrix();
  }
}
