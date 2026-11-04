// The existing walking camera borrows a close projection only for first-person
// and display reading. Restore the previous owner's value on view/mode exit.
const previous = new WeakMap();
export function setWalkingNearClip(camera, active) {
  if (!camera) return;
  if (active) {
    if (!previous.has(camera)) previous.set(camera, camera.near);
    if (camera.near !== 0.08) {
      camera.near = 0.08;
      camera.updateProjectionMatrix();
    }
  } else if (previous.has(camera)) {
    const value = previous.get(camera);
    previous.delete(camera);
    if (camera.near === 0.08) {
      camera.near = value;
      camera.updateProjectionMatrix();
    }
  }
}
