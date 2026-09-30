// Integrate an exponential follower along the target's path during this frame.
// Endpoint-only damping is exact for a stationary target, but changes the lag
// behind a moving target whenever the frame duration changes.
export function smoothMovingCameraTarget(position, history, x, y, z, rate, dt, continuous = true) {
  const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
  const a = Math.max(0, Number(rate) || 0) * step;
  const blend = -Math.expm1(-a);
  // (1-exp(-a))/a-exp(-a), evaluated stably near zero.
  const pathWeight = a < 1e-4 ? a / 2 - a * a / 3 : blend / a - Math.exp(-a);
  const track = continuous && history.valid && step > 0;
  position.x += (x - position.x) * blend + (track ? (history.x - x) * pathWeight : 0);
  position.y += (y - position.y) * blend + (track ? (history.y - y) * pathWeight : 0);
  position.z += (z - position.z) * blend + (track ? (history.z - z) * pathWeight : 0);
  history.x = x;
  history.y = y;
  history.z = z;
  history.valid = continuous && step > 0;
}

// Four bounded histories belong to the camera, and expire across camera modes.
export function beginCameraFollowFrame(camera) {
  const state = camera.userData.movingTargetFollow ||= {frame:0, targets:Object.create(null)};
  state.frame++;
}

export function cameraFollowHistory(camera, name) {
  if (!camera.userData.movingTargetFollow) beginCameraFollowFrame(camera);
  const state = camera.userData.movingTargetFollow;
  const history = state.targets[name] ||= {};
  if (history.frame !== state.frame - 1) history.valid = false;
  history.frame = state.frame;
  return history;
}
