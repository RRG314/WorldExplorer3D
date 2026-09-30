// Bounded, opt-in camera/actor pose diagnostic; no world snapshots or pose edits.
export function installCameraMotionEvidence(ctx, {mode}) {
  const original = ctx.updateCamera;
  let rows = [];
  ctx.updateCamera = function(dt) {
    const result = original.call(this, dt);
    const actor = mode === 'plane' ? ctx.planeMode : ctx.car;
    const camera = ctx.camera;
    if (rows.length < 20000) rows.push([performance.now(), dt,
      actor.x, actor.y, actor.z, actor.yaw ?? actor.angle,
      camera.position.x, camera.position.y, camera.position.z,
      camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w]);
    return result;
  };
  return {
    take() { const result = {columns:['timeMs','dt','x','y','z','yaw','cameraX','cameraY','cameraZ','qx','qy','qz','qw'],rows}; rows=[]; return result; },
    dispose() { ctx.updateCamera=original; }
  };
}
