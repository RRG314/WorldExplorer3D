import { markGroundSurfaceChanged } from './surface-revision.js';
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
  let drainError=null;
  const drainWaiters=new Set();
  const excludedTerrainMeshes=new Map();
  const settleDrain=(status,error=null)=>{
    appCtx.locationTerrainPublication=Object.freeze({generation:publicationGeneration,status,
      excludedTiles:Object.freeze([...excludedTerrainMeshes].map(([key,reason])=>Object.freeze({key,reason})))});
    for(const waiter of drainWaiters)error ? waiter.reject(error) : waiter.resolve({generation:publicationGeneration,status});
    drainWaiters.clear();
  };
  function waitForLocationTerrainPublication() {
    if(drainError)return Promise.reject(drainError);
    if(!pendingTerrainMeshes.size&&!terrainDrainScheduled)return Promise.resolve({generation:publicationGeneration,status:'settled'});
    return new Promise((resolve,reject)=>drainWaiters.add({resolve,reject}));
  }


  function scheduleTerrainMeshDrain() {
    if (terrainDrainScheduled || pendingTerrainMeshes.size === 0) return;
    terrainDrainScheduled = true;
    const run = async () => {
      const next = pendingTerrainMeshes.entries().next().value;
      if (!next) {terrainDrainScheduled=false;settleDrain('settled');return;}
      const [key, request] = next;
      pendingTerrainMeshes.delete(key);
      try {
        if (request.generation !== publicationGeneration) return;
        const alreadyPresent = appCtx.terrainGroup?.children?.some(
          (mesh) => getTerrainMeshKey(mesh) === key
        );
        if (!alreadyPresent) {
          // A constructed but hidden fallback tile is not published terrain.
          // Wait for its source before fixing the far mesh's ownership holes;
          // otherwise a late image decode can introduce an overlapping tile.
          if (request.requiresSourceTile) {
            const tile=getOrLoadTerrainTile?.(request.z,request.tx,request.ty,terrainTileDeps);
            if(!tile?.loaded)await tile?.ready;
            if(request.generation!==publicationGeneration)return;
            if(!tile?.loaded)throw new Error(`Terrain source ${key} did not become ready for publication`);
          }
          const mesh = buildTerrainTileMesh(request.z, request.tx, request.ty, terrainTileDeps);
          if(mesh.userData?.pendingTerrainTile || mesh.visible===false){
            mesh.geometry?.dispose?.();
            if(request.requiresSourceTile)throw new Error(`Terrain mesh ${key} has no publishable height surface`);
            // The accepted artifact may cover only part of the detailed ring.
            // Exclude unavailable tiles explicitly; far terrain owns these
            // cells for this generation and no hidden near mesh can appear later.
            excludedTerrainMeshes.set(key,mesh.userData?.groundUnavailableReason || 'accepted-ground-unavailable');
            return;
          }
          appCtx.terrainGroup.add(mesh);
          markGroundSurfaceChanged(appCtx);
          appCtx.retireGroundFallbackPlaceholder?.();
        }
      } catch(error) {
        if(request.generation===publicationGeneration){drainError=error;pendingTerrainMeshes.clear();settleDrain('failed',error);}
      } finally {
        terrainDrainScheduled=false;
        appCtx.setPerfLiveStat?.('terrainMeshQueue', pendingTerrainMeshes.size);
        if(pendingTerrainMeshes.size>0)scheduleTerrainMeshDrain();
        else if(!drainError)settleDrain('settled');
      }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 120 });
    else setTimeout(run, 0);
  }

  function resetLocationTerrainPublication() {
    publishedLocationKey = null;
    settleDrain('superseded');
    drainError=null;
    excludedTerrainMeshes.clear();
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
    settleDrain('superseded');
    drainError=null;
    excludedTerrainMeshes.clear();
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
        missing.push({
          key,
          z: appCtx.TERRAIN_ZOOM,
          tx,
          ty,
          generation,
          requiresSourceTile: !usesAcceptedGround,
          distance: dx * dx + dy * dy
        });
      }
    }
    missing.sort((a, b) => a.distance - b.distance).forEach((request) => {
      if (!usesAcceptedGround) getOrLoadTerrainTile?.(request.z, request.tx, request.ty, terrainTileDeps);
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
    waitForLocationTerrainPublication,
    resetLocationTerrainPublication
  };
}

export { createLocationTerrainApi };
