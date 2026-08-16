function createLocationTerrainApi(deps = {}) {
  const {
    appCtx,
    ensureTerrainGroup,
    worldToLatLon,
    latLonToTileXY,
    buildTerrainTileMesh,
    buildPolarCryosphereSurface,
    terrainTileDeps,
    getTerrainMeshKey,
    terrainTileMeshKey,
    getOrLoadTerrainTile,
    pruneTerrainTileCache,
    terrainTileCacheSnapshot,
    clearTerrainHeightCache,
    resetFarTerrainClipmap,
    updateFarTerrainClipmap
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
    resetFarTerrainClipmap?.();
    clearTerrainHeightCache();
    appCtx.polarCryosphereSurface = null;
    appCtx.samplePolarCryosphereWorldYAt = null;
  }

  function publishLocationTerrain() {
    if (!appCtx.terrainEnabled || appCtx.onMoon) return false;

    const polarCryosphere = appCtx.worldLoadRuntimeState?.groundMode === 'polar-cryosphere-local';
    // Polar ENU projection is valid, but the requested geodetic origin is the
    // publication identity. Using a reverse-projected zero during a location
    // transition can briefly return the previous pole and publish two meshes.
    const locationOrigin = polarCryosphere
      ? { lat: Number(appCtx.LOC?.lat || 0), lon: Number(appCtx.LOC?.lon || 0) }
      : worldToLatLon(0, 0);
    if (polarCryosphere) {
      const locationKey = [
        'polar-cryosphere-local',
        Number(locationOrigin.lat).toFixed(7),
        Number(locationOrigin.lon).toFixed(7)
      ].join(':');
      if (publishedLocationKey === locationKey) return false;
      ensureTerrainGroup();
      publicationGeneration += 1;
      pendingTerrainMeshes.clear();
      resetFarTerrainClipmap?.();
      while (appCtx.terrainGroup.children.length) {
        const previous = appCtx.terrainGroup.children[appCtx.terrainGroup.children.length - 1];
        appCtx.terrainGroup.remove(previous);
        previous?.geometry?.dispose?.();
        previous?.material?.map?.dispose?.();
        previous?.material?.dispose?.();
      }
      const mesh = buildPolarCryosphereSurface?.({
        latitude: locationOrigin.lat,
        worldUnitsPerMeter: appCtx.WORLD_UNITS_PER_METER
      });
      if (!mesh) return false;
      appCtx.terrainGroup.add(mesh);
      appCtx.polarCryosphereSurface = mesh;
      appCtx.samplePolarCryosphereWorldYAt = mesh.userData.heightSampler;
      publishedLocationKey = locationKey;
      clearTerrainHeightCache();
      appCtx.retireGroundFallbackPlaceholder?.();
      appCtx.setPerfLiveStat?.('terrainRing', 'polar-fixed');
      appCtx.setPerfLiveStat?.('terrainMeshQueue', 0);
      return true;
    }
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
    updateFarTerrainClipmap?.({
      z: appCtx.TERRAIN_ZOOM,
      centerX: centerTile.x,
      centerY: centerTile.y,
      ring: activeRing
    });
    return true;
  }

  return {
    publishLocationTerrain,
    resetLocationTerrainPublication
  };
}

export { createLocationTerrainApi };
