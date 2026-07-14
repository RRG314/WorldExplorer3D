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
    pruneTerrainTileCache,
    terrainTileCacheSnapshot,
    requestWorldSurfaceSync,
    clearTerrainHeightCache
  } = deps;

  let lastTerrainCenterKey = null;
  let lastDynamicTerrainRing = appCtx.TERRAIN_RING;

  function resetTerrainStreamingState() {
    lastTerrainCenterKey = null;
    lastDynamicTerrainRing = appCtx.TERRAIN_RING;
    terrainState._lastUpdatePos.x = 0;
    terrainState._lastUpdatePos.z = 0;
    terrainState._cachedIntersections = null;
    terrainState._lastRoadCount = 0;
    clearTerrainHeightCache();
  }

  function getStreamingSpeedMph() {
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

    const mph = getStreamingSpeedMph();
    if (mph >= 120) return Math.max(1, baseRing - 2);
    if (mph >= 70) return Math.max(1, baseRing - 1);
    return baseRing;
  }

  function updateTerrainAround(x, z) {
    if (!appCtx.terrainEnabled) return;

    ensureTerrainGroup();

    const { lat, lon } = worldToLatLon(x, z);
    const t = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
    const centerKey = `${appCtx.TERRAIN_ZOOM}/${t.x}/${t.y}`;
    const activeRing = getDynamicTerrainRing();
    const ringChanged = activeRing !== lastDynamicTerrainRing;
    const needsRoadRebuild = !!appCtx.roadsNeedRebuild && appCtx.roads.length > 0 && !appCtx.onMoon;
    lastDynamicTerrainRing = activeRing;
    if (typeof appCtx.setPerfLiveStat === "function") appCtx.setPerfLiveStat("terrainRing", activeRing);

    if (lastTerrainCenterKey !== null) {
      const dx = x - terrainState._lastUpdatePos.x;
      const dz = z - terrainState._lastUpdatePos.z;
      const distMoved = Math.sqrt(dx * dx + dz * dz);
      if (centerKey === lastTerrainCenterKey && distMoved < 5.0 && !ringChanged && !needsRoadRebuild) return;
    }

    const tilesChanged = centerKey !== lastTerrainCenterKey || ringChanged;
    lastTerrainCenterKey = centerKey;
    terrainState._lastUpdatePos.x = x;
    terrainState._lastUpdatePos.z = z;

    if (tilesChanged) {
      const desiredKeys = new Set();
      const existingMeshesByKey = new Map();
      if (appCtx.terrainGroup?.children?.length) {
        appCtx.terrainGroup.children.forEach((mesh) => {
          const key = typeof getTerrainMeshKey === "function" ? getTerrainMeshKey(mesh) : "";
          if (key) existingMeshesByKey.set(key, mesh);
        });
      }

      let meshSetChanged = false;
      for (let dx = -activeRing; dx <= activeRing; dx++) {
        for (let dy = -activeRing; dy <= activeRing; dy++) {
          const tx = t.x + dx;
          const ty = t.y + dy;
          const key = typeof terrainTileMeshKey === "function" ?
            terrainTileMeshKey(appCtx.TERRAIN_ZOOM, tx, ty) :
            `${appCtx.TERRAIN_ZOOM}/${tx}/${ty}`;
          desiredKeys.add(key);
          if (!existingMeshesByKey.has(key)) {
            const mesh = buildTerrainTileMesh(appCtx.TERRAIN_ZOOM, tx, ty, terrainTileDeps);
            appCtx.terrainGroup.add(mesh);
            meshSetChanged = true;
          }
        }
      }

      existingMeshesByKey.forEach((mesh, key) => {
        if (desiredKeys.has(key)) return;
        appCtx.terrainGroup.remove(mesh);
        disposeTerrainMesh(mesh);
        meshSetChanged = true;
      });

      if (meshSetChanged && appCtx.roads.length > 0 && !appCtx.onMoon) {
        requestWorldSurfaceSync({ source: "terrain_tiles_changed" });
      }
      const cacheSnapshot = typeof pruneTerrainTileCache === "function" ?
        pruneTerrainTileCache() :
        typeof terrainTileCacheSnapshot === "function" ? terrainTileCacheSnapshot() : null;
      if (cacheSnapshot && typeof appCtx.setPerfLiveStat === "function") {
        appCtx.setPerfLiveStat("terrainCache", cacheSnapshot);
      }
    } else if (needsRoadRebuild) {
      requestWorldSurfaceSync({ source: "terrain_tiles_pending" });
    }
  }

  return {
    resetTerrainStreamingState,
    updateTerrainAround
  };
}

export { createTerrainStreamingApi };
