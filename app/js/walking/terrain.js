import { ctx as appCtx } from "../shared-context.js?v=55";

function getPlanetarySurfaceMesh() {
  if (appCtx.onMars && appCtx.marsSurface) return appCtx.marsSurface;
  if (appCtx.onMoon && appCtx.moonSurface) return appCtx.moonSurface;
  return null;
}

function createWalkingTerrainHelpers({ car, state, CFG }) {
  let lastWalkTerrainUpdateAt = 0;
  let lastWalkTerrainRebuildAt = 0;
  let lastWalkTerrainX = NaN;
  let lastWalkTerrainZ = NaN;

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
    } else if (appCtx.GroundHeight && typeof appCtx.GroundHeight.carCenterY === "function") {
      y = appCtx.GroundHeight.carCenterY(x, z, true, 1.2, Number.isFinite(fallbackY) ? fallbackY - 1.2 : NaN);
    } else if (typeof appCtx.terrainMeshHeightAt === "function") {
      const terrainY = appCtx.terrainMeshHeightAt(x, z);
      if (Number.isFinite(terrainY)) y = terrainY + 1.2;
    } else if (typeof appCtx.elevationWorldYAtWorldXZ === "function") {
      const elevY = appCtx.elevationWorldYAtWorldXZ(x, z);
      if (Number.isFinite(elevY)) y = elevY + 1.2;
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

    if (appCtx.GroundHeight && typeof appCtx.GroundHeight.walkSurfaceY === "function") {
      const walkerFeetY = Number.isFinite(state.walker?.y) ? state.walker.y - CFG.eyeHeight : NaN;
      const surfaceY = appCtx.GroundHeight.walkSurfaceY(x, z, walkerFeetY);
      if (Number.isFinite(surfaceY)) return surfaceY;
    }
    if (typeof appCtx.terrainMeshHeightAt === "function") {
      const terrainY = appCtx.terrainMeshHeightAt(x, z);
      if (Number.isFinite(terrainY)) return terrainY;
    }
    if (typeof appCtx.elevationWorldYAtWorldXZ === "function") {
      const elevY = appCtx.elevationWorldYAtWorldXZ(x, z);
      if (Number.isFinite(elevY)) return elevY;
    }
    return finiteOr(fallbackY, 0);
  }

  function nowMs() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function syncWalkTerrain(force = false) {
    if (appCtx.onMoon || appCtx.onMars) return;
    if (appCtx.activeInterior) return;
    if (typeof appCtx.terrainEnabled !== "undefined" && !appCtx.terrainEnabled) return;
    if (typeof appCtx.worldLoading !== "undefined" && appCtx.worldLoading) return;
    if (typeof appCtx.updateTerrainAround !== "function") return;

    const x = state.walker.x;
    const z = state.walker.z;
    const t = nowMs();
    const moved = Number.isFinite(lastWalkTerrainX) && Number.isFinite(lastWalkTerrainZ)
      ? Math.hypot(x - lastWalkTerrainX, z - lastWalkTerrainZ)
      : Infinity;

    if (!force && moved < 3.5 && t - lastWalkTerrainUpdateAt < 160) return;

    appCtx.updateTerrainAround(x, z);
    lastWalkTerrainUpdateAt = t;
    lastWalkTerrainX = x;
    lastWalkTerrainZ = z;

    if (typeof appCtx.roadsNeedRebuild !== "undefined" && appCtx.roadsNeedRebuild) {
      const firstRebuild = lastWalkTerrainRebuildAt === 0;
      const rebuildInterval = firstRebuild ? 500 : 2000;
      if (t - lastWalkTerrainRebuildAt >= rebuildInterval) {
        if (typeof appCtx.requestWorldSurfaceSync === "function") {
          appCtx.requestWorldSurfaceSync({ force: firstRebuild, source: "walk_sync" });
        } else {
          if (typeof appCtx.rebuildRoadsWithTerrain === "function") appCtx.rebuildRoadsWithTerrain();
          if (typeof appCtx.repositionBuildingsWithTerrain === "function") appCtx.repositionBuildingsWithTerrain();
        }
        lastWalkTerrainRebuildAt = t;
      }
    }
  }

  return {
    finiteOr,
    getSafeDriveY,
    getWalkGroundY,
    syncCarFromWalker,
    syncWalkTerrain,
    syncWalkerFromCar
  };
}

export { createWalkingTerrainHelpers };
