import { ctx as appCtx } from "./shared-context.js?v=55";

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function fallbackWorldToGeo(worldX = 0, worldZ = 0) {
  return {
    lat: finiteNumber(appCtx.LOC?.lat) - finiteNumber(worldZ) / finiteNumber(appCtx.SCALE, 1),
    lon:
      finiteNumber(appCtx.LOC?.lon) +
      finiteNumber(worldX) / (
        finiteNumber(appCtx.SCALE, 1) *
        Math.cos(finiteNumber(appCtx.LOC?.lat) * Math.PI / 180 || 1)
      )
  };
}

function worldPointToGeo(worldX = 0, worldZ = 0) {
  if (typeof appCtx.worldToLatLon === 'function') {
    const geo = appCtx.worldToLatLon(worldX, worldZ);
    if (Number.isFinite(geo?.lat) && Number.isFinite(geo?.lon)) {
      return { lat: Number(geo.lat), lon: Number(geo.lon) };
    }
  }
  return fallbackWorldToGeo(worldX, worldZ);
}

function geoPointToWorld(lat = 0, lon = 0) {
  if (typeof appCtx.geoToWorld === 'function') {
    const world = appCtx.geoToWorld(lat, lon);
    if (Number.isFinite(world?.x) && Number.isFinite(world?.z)) {
      return { x: Number(world.x), z: Number(world.z) };
    }
  }
  const scale = finiteNumber(appCtx.SCALE, 1);
  const originLat = finiteNumber(appCtx.LOC?.lat);
  const originLon = finiteNumber(appCtx.LOC?.lon);
  const cosLat = Math.cos(originLat * Math.PI / 180) || 1;
  return {
    x: (finiteNumber(lon) - originLon) * scale * cosLat,
    z: -(finiteNumber(lat) - originLat) * scale
  };
}

function currentMapReferenceWorldPosition() {
  if (appCtx.oceanMode?.active) {
    const ocean = typeof appCtx.getOceanModeDebugState === 'function' ? appCtx.getOceanModeDebugState() : null;
    return {
      mode: 'ocean',
      x: finiteNumber(ocean?.position?.x),
      z: finiteNumber(ocean?.position?.z)
    };
  }
  if (appCtx.boatMode?.active && appCtx.boat) {
    return {
      mode: 'boat',
      x: finiteNumber(appCtx.boat.x),
      z: finiteNumber(appCtx.boat.z)
    };
  }
  if (appCtx.droneMode && appCtx.drone) {
    return {
      mode: 'drone',
      x: finiteNumber(appCtx.drone.x),
      z: finiteNumber(appCtx.drone.z)
    };
  }
  if (appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk?.state?.walker) {
    return {
      mode: 'walk',
      x: finiteNumber(appCtx.Walk.state.walker.x),
      z: finiteNumber(appCtx.Walk.state.walker.z)
    };
  }
  if (appCtx.Walk?.getMapRefPosition) {
    const ref = appCtx.Walk.getMapRefPosition(appCtx.droneMode, appCtx.drone);
    if (Number.isFinite(ref?.x) && Number.isFinite(ref?.z)) {
      return {
        mode: appCtx.droneMode ? 'drone' : 'drive',
        x: Number(ref.x),
        z: Number(ref.z)
      };
    }
  }
  return {
    mode: 'drive',
    x: finiteNumber(appCtx.car?.x),
    z: finiteNumber(appCtx.car?.z)
  };
}

function currentMapReferenceGeoPosition() {
  const ref = currentMapReferenceWorldPosition();
  const geo = worldPointToGeo(ref.x, ref.z);
  return {
    ...ref,
    lat: geo.lat,
    lon: geo.lon
  };
}

Object.assign(appCtx, {
  currentMapReferenceGeoPosition,
  currentMapReferenceWorldPosition
});

export {
  currentMapReferenceGeoPosition,
  currentMapReferenceWorldPosition,
  geoPointToWorld,
  worldPointToGeo
};
