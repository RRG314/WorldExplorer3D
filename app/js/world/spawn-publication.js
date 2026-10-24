// Publication only: callers must admit a surface pose before reaching this owner.
// Kept independent of Earth's lazy data/query runtime so fresh planetary entry
// publishes the same actors, meshes and contact invalidation as Earth arrivals.
const finiteOr = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
export function publishResolvedSurfaceSpawn(appCtx, resolved, options = {}) {
  const syncCar = options.syncCar !== false;
  const syncWalker = options.syncWalker !== false;

  if (syncCar && appCtx.car) {
    appCtx.car.x = resolved.x;
    appCtx.car.z = resolved.z;
    appCtx.car.angle = finiteOr(resolved.angle, appCtx.car.angle);
    appCtx.car.y = resolved.carY;
    appCtx.car.speed = 0;
    appCtx.car.vx = 0;
    appCtx.car.vz = 0;
    appCtx.car.vy = 0;
    appCtx.car.vFwd = 0;
    appCtx.car.vLat = 0;
    appCtx.car.yawRate = 0;
    appCtx.car.rearSlip = 0;
    appCtx.car._lastSurfaceY = null;
    appCtx.car._terrainAirTimer = 0;
    appCtx.car.groundContact = null;
    appCtx.car.isAirborne = false;
    appCtx.car.onRoad = !!resolved.onRoad;
    appCtx.car.road = resolved.road || null;
    if (typeof appCtx.invalidateRoadCache === "function") appCtx.invalidateRoadCache();
    // GroundHeight keeps its own walking-road cache. A world load first places
    // the shared actors on a generic road and can then resolve a custom arrival
    // on a different vertical layer (for example, the Jones Falls Expressway).
    // Keeping the earlier cached feature makes the first walking physics frame
    // sample the lower road/terrain and drop the actor through the bridge deck.
    // Invalidate the surface selector at the same authoritative handoff where
    // car.road changes so every consumer starts from the resolved feature.
    appCtx.GroundHeight?.invalidate?.();
    if (appCtx.carMesh) {
      appCtx.carMesh.position.set(resolved.x, resolved.carY, resolved.z);
      appCtx.carMesh.rotation.y = appCtx.car.angle;
      appCtx.carMesh.updateMatrixWorld(true);
    }
  }

  if (syncWalker && appCtx.Walk?.state?.walker) {
    const walker = appCtx.Walk.state.walker;
    walker._resolvedGroundState = null;
    walker.x = resolved.x;
    walker.z = resolved.z;
    walker.y = resolved.walkY;
    walker.vy = 0;
    walker.angle = finiteOr(resolved.angle, walker.angle);
    walker.yaw = finiteOr(resolved.angle, walker.yaw);
    walker.speedMph = 0;
    walker.onBuilding = false;
    if (appCtx.Walk.state.characterMesh && appCtx.Walk.state.mode === "walk") {
      appCtx.Walk.state.characterMesh.position.set(resolved.x, resolved.walkY - 1.7, resolved.z);
      appCtx.Walk.state.characterMesh.rotation.y = walker.angle;
    }
  }

  return resolved;
}
