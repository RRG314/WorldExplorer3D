function createLocationTerrainApi(deps = {}) {
  const {
    appCtx,
    ensureTerrainGroup,
    worldToLatLon,
    latLonToTileXY,
    buildTerrainTileMesh,
    terrainTileDeps,
    getTerrainMeshKey,
    terrainTileMeshKey,
    getOrLoadTerrainTile,
    pruneTerrainTileCache,
    terrainTileCacheSnapshot,
    clearTerrainHeightCache
  } = deps;

  let publishedLocationKey = null;
  let publicationGeneration = 0;
  const pendingTerrainMeshes = new Map();
  let terrainDrainScheduled = false;

  function scheduleTerrainMeshDrain() {
    if (terrainDrainScheduled || pendingTerrainMeshes.size === 0) return;
    terrainDrainScheduled = true;
    const run = () => {
      terrainDrainScheduled = false;
      const next = pendingTerrainMeshes.entries().next().value;
      if (!next) return;
      const [key, request] = next;
      pendingTerrainMeshes.delete(key);
      if (request.generation === publicationGeneration) {
        const alreadyPresent = appCtx.terrainGroup?.children?.some(
          (mesh) => getTerrainMeshKey(mesh) === key
        );
        if (!alreadyPresent) {
          const mesh = buildTerrainTileMesh(request.z, request.tx, request.ty, terrainTileDeps);
          appCtx.terrainGroup.add(mesh);
          // The bootstrap plane is only a loading placeholder. Accepted-ground
          // tiles can be ready synchronously, so retire it as soon as the first
          // authoritative tile is actually published instead of waiting for
          // the unrelated world-detail finalizer.
          appCtx.retireGroundFallbackPlaceholder?.();
        }
      }
      appCtx.setPerfLiveStat?.('terrainMeshQueue', pendingTerrainMeshes.size);
      if (pendingTerrainMeshes.size > 0) scheduleTerrainMeshDrain();
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 120 });
    else setTimeout(run, 0);
  }

  function resetLocationTerrainPublication() {
    publishedLocationKey = null;
    publicationGeneration += 1;
    pendingTerrainMeshes.clear();
    clearTerrainHeightCache();
  }

  function publishLocationTerrain() {
    if (!appCtx.terrainEnabled || appCtx.onMoon) return false;

    const locationOrigin = worldToLatLon(0, 0);
    const usesAcceptedGround = typeof terrainTileDeps?.usesAcceptedGround === 'function'
      ? terrainTileDeps.usesAcceptedGround()
      : terrainTileDeps?.usesAcceptedGround === true;
    if (
      usesAcceptedGround &&
      terrainTileDeps.sampleAcceptedGroundAtLatLon?.(
        locationOrigin.lat,
        locationOrigin.lon
      )?.status !== 'available'
    ) return false;

    ensureTerrainGroup();
    const centerTile = latLonToTileXY(
      locationOrigin.lat,
      locationOrigin.lon,
      appCtx.TERRAIN_ZOOM
    );
    // Publish one complete location district. A seven-by-seven detailed grid
    // covers the fixed road/building load radius without bringing back motion-
    // driven streaming or exposing a small, obvious terrain square.
    const activeRing = Math.max(3, appCtx.TERRAIN_RING);
    const locationKey = [
      Number(locationOrigin.lat).toFixed(7),
      Number(locationOrigin.lon).toFixed(7),
      appCtx.TERRAIN_ZOOM,
      centerTile.x,
      centerTile.y,
      activeRing
    ].join(':');
    if (publishedLocationKey === locationKey) return false;

    publishedLocationKey = locationKey;
    publicationGeneration += 1;
    const generation = publicationGeneration;
    pendingTerrainMeshes.clear();
    appCtx.setPerfLiveStat?.('terrainRing', activeRing);

    const existingKeys = new Set(
      (appCtx.terrainGroup?.children || [])
        .map((mesh) => getTerrainMeshKey(mesh))
        .filter(Boolean)
    );
    const missing = [];
    for (let dx = -activeRing; dx <= activeRing; dx += 1) {
      for (let dy = -activeRing; dy <= activeRing; dy += 1) {
        const tx = centerTile.x + dx;
        const ty = centerTile.y + dy;
        const key = terrainTileMeshKey(appCtx.TERRAIN_ZOOM, tx, ty);
        if (existingKeys.has(key)) continue;
        if (!usesAcceptedGround) {
          getOrLoadTerrainTile?.(appCtx.TERRAIN_ZOOM, tx, ty, terrainTileDeps);
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
    missing.sort((a, b) => a.distance - b.distance).forEach((request) => {
      pendingTerrainMeshes.set(request.key, request);
    });
    scheduleTerrainMeshDrain();

    const cacheSnapshot = typeof pruneTerrainTileCache === 'function'
      ? pruneTerrainTileCache()
      : typeof terrainTileCacheSnapshot === 'function' ? terrainTileCacheSnapshot() : null;
    if (cacheSnapshot) appCtx.setPerfLiveStat?.('terrainCache', cacheSnapshot);
    appCtx.setPerfLiveStat?.('terrainMeshQueue', pendingTerrainMeshes.size);
    return true;
  }

  return {
    publishLocationTerrain,
    resetLocationTerrainPublication
  };
}

export { createLocationTerrainApi };
