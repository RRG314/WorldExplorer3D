// The existing walking camera borrows a close projection only for first-person
// and display reading. Restore the previous owner's value on view/mode exit.
const previous = new WeakMap();
export function walkingInteriorCeiling(active, floorY) {
  if (!active || !Number.isFinite(floorY)) return null;
  if (Number.isFinite(active.ceilingY)) return Math.max(floorY + 0.6, active.ceilingY - 0.24);
  const floor = active.floorPlan?.floors?.[active.activeLevel || 0];
  const height = floor?.height ?? active.floorPlan?.storyHeight ?? active.wallHeight;
  return Number.isFinite(height) ? floorY + Math.max(0.6, height - 0.24) : null;
}
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
