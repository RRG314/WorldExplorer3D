import {driverCameraMount} from '../transport/vehicle-camera-mount.js';
import {vehicleGroundVisual,vehicleVisualRootHeight} from '../engine/vehicle-ground-pivot.js';
// Use the mounted vehicle's prepared view. Keep its body rendered; near clipping
// remains scoped to this camera owner in ordinary driving and VR alike.
export function applyDrivingCabinCamera(THREE, camera, mesh, look = {}) {
  if (!mesh || !camera) return false;
  mesh.visible = true;
  mesh.updateWorldMatrix(true, false);
  const mount=driverCameraMount(mesh),eye=new THREE.Vector3(mount.eye.x,mount.eye.y,mount.eye.z);
  const visual=vehicleGroundVisual(mesh),frame=visual||mesh;
  // Mount recipes retain their flat actor-root coordinates. The prepared
  // body's ground frame also follows its grade/bank contact correction.
  if(visual)eye.y+=vehicleVisualRootHeight(visual);
  frame.updateWorldMatrix(true,false);
  const yaw = Number(look.yaw) || 0, pitch = Number(look.pitch) || 0;
  const target = eye.clone().add(new THREE.Vector3(Math.sin(yaw)*10,Math.sin(pitch)*10,Math.cos(yaw)*10));
  camera.position.copy(frame.localToWorld(eye));
  camera.lookAt(frame.localToWorld(target));
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
