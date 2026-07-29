function createTerrainStreamingApi(deps = {}) {
  const {
    appCtx,
    terrainState,
    ensureTerrainGroup,
    worldToLatLon,
    latLonToTileXY,
    buildTerrainTileMesh,
    terrainTileDeps,
    getTerrainMeshKey,
    terrainTileMeshKey,
    disposeTerrainMesh,
    getOrLoadTerrainTile,
    pruneTerrainTileCache,
    terrainTileCacheSnapshot,
    clearTerrainHeightCache
  } = deps;

  let lastTerrainCenterKey = null;
  let lastDynamicTerrainRing = appCtx.TERRAIN_RING;
  let terrainMeshGeneration = 0;
  let desiredTerrainMeshKeys = new Set();
  const pendingTerrainMeshes = new Map();
  let terrainDrainScheduled = false;

  function removeObsoleteTerrainMeshes() {
    if (!appCtx.terrainGroup || pendingTerrainMeshes.size > 0) return;
    const obsolete = appCtx.terrainGroup.children.filter((mesh) => {
      const key = typeof getTerrainMeshKey === "function" ? getTerrainMeshKey(mesh) : "";
      return key && !desiredTerrainMeshKeys.has(key);
    });
    obsolete.forEach((mesh) => {
      appCtx.terrainGroup.remove(mesh);
      disposeTerrainMesh(mesh);
    });
    if (obsolete.length > 0 || desiredTerrainMeshKeys.size > 0) {
      clearTerrainHeightCache();
      const cacheSnapshot = typeof pruneTerrainTileCache === 'function'
        ? pruneTerrainTileCache()
        : typeof terrainTileCacheSnapshot === 'function' ? terrainTileCacheSnapshot() : null;
      if (cacheSnapshot && typeof appCtx.setPerfLiveStat === 'function') {
        appCtx.setPerfLiveStat('terrainCache', cacheSnapshot);
      }
    }
  }

  function scheduleTerrainMeshDrain() {
    if (terrainDrainScheduled || pendingTerrainMeshes.size === 0) return;
    terrainDrainScheduled = true;
    const run = () => {
      terrainDrainScheduled = false;
      const next = pendingTerrainMeshes.entries().next().value;
      if (!next) {
        removeObsoleteTerrainMeshes();
        return;
      }
      const [key, request] = next;
      pendingTerrainMeshes.delete(key);
      if (request.generation === terrainMeshGeneration && desiredTerrainMeshKeys.has(key)) {
        const alreadyPresent = appCtx.terrainGroup?.children?.some((mesh) => getTerrainMeshKey(mesh) === key);
        if (!alreadyPresent) {
          const mesh = buildTerrainTileMesh(request.z, request.tx, request.ty, terrainTileDeps);
          appCtx.terrainGroup.add(mesh);
        }
      }
      if (pendingTerrainMeshes.size > 0) scheduleTerrainMeshDrain();
      else removeObsoleteTerrainMeshes();
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 120 });
    else setTimeout(run, 0);
  }

  function resetTerrainStreamingState() {
    lastTerrainCenterKey = null;
    lastDynamicTerrainRing = appCtx.TERRAIN_RING;
    terrainMeshGeneration += 1;
    desiredTerrainMeshKeys = new Set();
    pendingTerrainMeshes.clear();
    terrainState._lastUpdatePos.x = 0;
    terrainState._lastUpdatePos.z = 0;
    terrainState._cachedIntersections = null;
    terrainState._lastRoadCount = 0;
    clearTerrainHeightCache();
  }

  function getStreamingSpeedMph() {
    if (appCtx.planeMode?.active) return Math.max(0, Math.abs((appCtx.planeMode.speed || 0) * 2.237));
    if (appCtx.droneMode && appCtx.drone) return Math.max(0, Math.abs((appCtx.drone.speed || 0) * 1.8));
    if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === "walk") {
      return Math.max(0, Math.abs(appCtx.Walk.state.walker?.speedMph || 0));
    }
    return Math.max(0, Math.abs((appCtx.car?.speed || 0) * 0.5));
  }

  function getDynamicTerrainRing() {
    const baseRing = Math.max(1, appCtx.TERRAIN_RING);
    const mode = typeof appCtx.getPerfMode === "function" ? appCtx.getPerfMode() : appCtx.perfMode || "rdt";
    if (mode === "baseline") return baseRing;

    // Aerial travel needs a stable horizon. Shrinking the terrain ring while the
    // aircraft accelerates exposes tile edges and makes the backdrop pulse.
    if (appCtx.planeMode?.active || appCtx.droneMode) return baseRing;

    const mph = getStreamingSpeedMph();
    if (mph >= 120) return Math.max(1, baseRing - 2);
    if (mph >= 70) return Math.max(1, baseRing - 1);
    return baseRing;
  }

  function updateTerrainAround(x, z) {
    if (!appCtx.terrainEnabled) return;
    if (![x, z].every(Number.isFinite)) return;
    const geographic = worldToLatLon(x, z);
    if (
      terrainTileDeps?.usesAcceptedGround === true &&
      terrainTileDeps.sampleAcceptedGroundAtLatLon?.(
        geographic.lat,
        geographic.lon
      )?.status !== 'available'
    ) return;

    ensureTerrainGroup();

    const { lat, lon } = geographic;
    const t = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
    const centerKey = `${appCtx.TERRAIN_ZOOM}/${t.x}/${t.y}`;
    const activeRing = getDynamicTerrainRing();
    const ringChanged = activeRing !== lastDynamicTerrainRing;
    lastDynamicTerrainRing = activeRing;
    if (typeof appCtx.setPerfLiveStat === "function") appCtx.setPerfLiveStat("terrainRing", activeRing);

    if (lastTerrainCenterKey !== null) {
      const dx = x - terrainState._lastUpdatePos.x;
      const dz = z - terrainState._lastUpdatePos.z;
      const distMoved = Math.sqrt(dx * dx + dz * dz);
      if (centerKey === lastTerrainCenterKey && distMoved < 5.0 && !ringChanged) return;
    }

    const tilesChanged = centerKey !== lastTerrainCenterKey || ringChanged;
    lastTerrainCenterKey = centerKey;
    terrainState._lastUpdatePos.x = x;
    terrainState._lastUpdatePos.z = z;

    if (tilesChanged) {
      terrainMeshGeneration += 1;
      const generation = terrainMeshGeneration;
      const desiredKeys = new Set();
      const existingMeshesByKey = new Map();
      if (appCtx.terrainGroup?.children?.length) {
        appCtx.terrainGroup.children.forEach((mesh) => {
          const key = typeof getTerrainMeshKey === "function" ? getTerrainMeshKey(mesh) : "";
          if (key) existingMeshesByKey.set(key, mesh);
        });
      }

      const missing = [];
      for (let dx = -activeRing; dx <= activeRing; dx++) {
        for (let dy = -activeRing; dy <= activeRing; dy++) {
          const tx = t.x + dx;
          const ty = t.y + dy;
          const key = typeof terrainTileMeshKey === "function" ?
            terrainTileMeshKey(appCtx.TERRAIN_ZOOM, tx, ty) :
            `${appCtx.TERRAIN_ZOOM}/${tx}/${ty}`;
          desiredKeys.add(key);
          if (!existingMeshesByKey.has(key)) {
            if (terrainTileDeps?.usesAcceptedGround !== true) {
              getOrLoadTerrainTile?.(
                appCtx.TERRAIN_ZOOM,
                tx,
                ty,
                terrainTileDeps
              );
            }
            missing.push({
              key,
              z: appCtx.TERRAIN_ZOOM,
              tx,
              ty,
              generation,
              distance: dx * dx + dy * dy
            });
          }
        }
      }
      desiredTerrainMeshKeys = desiredKeys;
      pendingTerrainMeshes.clear();
      missing.sort((a, b) => a.distance - b.distance).forEach((request) => {
        pendingTerrainMeshes.set(request.key, request);
      });
      scheduleTerrainMeshDrain();
      if (missing.length === 0) removeObsoleteTerrainMeshes();
      const cacheSnapshot = typeof pruneTerrainTileCache === "function" ?
        pruneTerrainTileCache() :
        typeof terrainTileCacheSnapshot === "function" ? terrainTileCacheSnapshot() : null;
      if (cacheSnapshot && typeof appCtx.setPerfLiveStat === "function") {
        appCtx.setPerfLiveStat("terrainCache", cacheSnapshot);
        appCtx.setPerfLiveStat("terrainMeshQueue", pendingTerrainMeshes.size);
      }
    }
  }

  return {
    resetTerrainStreamingState,
    updateTerrainAround
  };
}

export { createTerrainStreamingApi };
