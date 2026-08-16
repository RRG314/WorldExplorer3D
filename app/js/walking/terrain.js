import { ctx as appCtx } from "../shared-context.js?v=55";

function getPlanetarySurfaceMesh() {
  if (appCtx.onMars && appCtx.marsSurface) return appCtx.marsSurface;
  if (appCtx.onMoon && appCtx.moonSurface) return appCtx.moonSurface;
  return null;
}

function createWalkingTerrainHelpers({ car, state, CFG }) {
  function finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function syncWalkerFromCar() {
    state.walker.x = car.x;
    state.walker.z = car.z;
    state.walker.y = car.y;
    state.walker.vy = 0;
    state.walker.angle = car.angle;
    state.walker.yaw = car.angle;
    state.walker.pitch = 0;
    state.walker.speedMph = 0;
  }

  function syncCarFromWalker() {
    car.x = state.walker.x;
    car.z = state.walker.z;
    car.angle = state.walker.angle;
    car.y = (state.walker.y || 1.7) - CFG.eyeHeight + 1.2;
    car.vy = 0;
    car.speed = 0;
    if (typeof appCtx.invalidateRoadCache === "function") appCtx.invalidateRoadCache();
  }

  function getSafeDriveY(x, z, fallbackY) {
    let y = fallbackY;
    const planetarySurface = getPlanetarySurfaceMesh();
    if (planetarySurface) {
      const raycaster = appCtx._getPhysRaycaster();
      appCtx._physRayStart.set(x, 2200, z);
      raycaster.set(appCtx._physRayStart, appCtx._physRayDir);
      const hits = raycaster.intersectObject(planetarySurface, false);
      if (hits.length > 0 && Number.isFinite(hits[0].point.y)) y = hits[0].point.y + 1.2;
    } else if (appCtx.SurfaceQuery) {
      const currentY = Number.isFinite(fallbackY) ? fallbackY - 1.2 : NaN;
      const surfaceY = appCtx.SurfaceQuery.driveAt(x, z, { currentY }).position.y;
      if (Number.isFinite(surfaceY)) y = surfaceY + 1.2;
    }
    return finiteOr(y, 1.2);
  }

  function getWalkGroundY(x, z, fallbackY = 0) {
    const planetarySurface = getPlanetarySurfaceMesh();
    if (planetarySurface) {
      const raycaster = appCtx._getPhysRaycaster();
      appCtx._physRayStart.set(x, 2200, z);
      raycaster.set(appCtx._physRayStart, appCtx._physRayDir);
      const hits = raycaster.intersectObject(planetarySurface, false);
      return hits.length > 0 && Number.isFinite(hits[0]?.point?.y) ? hits[0].point.y : fallbackY;
    }

    if (appCtx.SurfaceQuery) {
      const walkerFeetY = Number.isFinite(state.walker?.y) ? state.walker.y - CFG.eyeHeight : NaN;
      const surfaceY = appCtx.SurfaceQuery.walkAt(x, z, {
        currentY: walkerFeetY,
        sampleRenderedMesh: false
      }).position.y;
      if (Number.isFinite(surfaceY)) return surfaceY;
    }
    return finiteOr(fallbackY, 0);
  }

  return {
    finiteOr,
    getSafeDriveY,
    getWalkGroundY,
    syncCarFromWalker,
    syncWalkerFromCar
  };
}

export { createWalkingTerrainHelpers };
