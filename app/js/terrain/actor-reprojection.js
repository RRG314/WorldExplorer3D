function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function updateCarY(appCtx, surfaceY) {
  if (!appCtx.car || !Number.isFinite(surfaceY)) return;
  const targetY = surfaceY + 1.2;
  const currentY = finite(appCtx.car.y, targetY);
  const grossMismatch = Math.abs(targetY - currentY) > 3;
  const nearlyStationary = Math.abs(finite(appCtx.car.speed)) < 2;
  if (!grossMismatch && !nearlyStationary) return;

  appCtx.car.y = targetY;
  appCtx.car._lastSurfaceY = null;
  appCtx.car.isAirborne = false;
  if (appCtx.carMesh) {
    appCtx.carMesh.position.y = targetY;
    appCtx.carMesh.updateMatrixWorld?.(true);
  }
}

function updateWalkerY(appCtx, surfaceY) {
  const walker = appCtx.Walk?.state?.walker;
  if (!walker || !Number.isFinite(surfaceY)) return;
  const targetY = surfaceY + 1.7;
  const currentY = finite(walker.y, targetY);
  const grossMismatch = Math.abs(targetY - currentY) > 3;
  const nearlyStationary = Math.abs(finite(walker.speedMph)) < 2;
  if (!grossMismatch && !nearlyStationary) return;

  walker.y = targetY;
  walker.vy = 0;
  if (appCtx.Walk.state.characterMesh) {
    appCtx.Walk.state.characterMesh.position.y = surfaceY;
    appCtx.Walk.state.characterMesh.updateMatrixWorld?.(true);
  }
}

export function reconcileActorsAfterSurfaceRebuild(appCtx) {
  if (!appCtx || appCtx.onMoon || appCtx.boatMode?.active || appCtx.droneMode) return;
  const ground = appCtx.GroundHeight;
  if (!ground) return;

  ground.invalidate?.();
  const carX = finite(appCtx.car?.x);
  const carZ = finite(appCtx.car?.z);
  const walkerX = finite(appCtx.Walk?.state?.walker?.x, carX);
  const walkerZ = finite(appCtx.Walk?.state?.walker?.z, carZ);
  const carFeetY = Number.isFinite(appCtx.car?.y) ? appCtx.car.y - 1.2 : NaN;
  const walkerFeetY = Number.isFinite(appCtx.Walk?.state?.walker?.y) ? appCtx.Walk.state.walker.y - 1.7 : NaN;
  const carSurfaceY = ground.driveSurfaceY?.(carX, carZ, true, carFeetY);
  const walkSurfaceY = ground.walkSurfaceY?.(walkerX, walkerZ, walkerFeetY);

  updateCarY(appCtx, carSurfaceY);
  updateWalkerY(appCtx, walkSurfaceY);
}
