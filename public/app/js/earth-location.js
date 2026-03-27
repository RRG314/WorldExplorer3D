import { ctx as appCtx } from "./shared-context.js?v=55";
import { currentMapReferenceGeoPosition, worldPointToGeo } from "./map-coordinates.js?v=2";

function currentActorWorldPosition() {
  if (appCtx.boatMode?.active && Number.isFinite(appCtx.boat?.x) && Number.isFinite(appCtx.boat?.z)) {
    return { x: appCtx.boat.x, z: appCtx.boat.z, source: 'boat' };
  }
  if (appCtx.droneMode && Number.isFinite(appCtx.drone?.x) && Number.isFinite(appCtx.drone?.z)) {
    return { x: appCtx.drone.x, z: appCtx.drone.z, source: 'drone' };
  }
  if (appCtx.Walk?.state?.mode === 'walk' && Number.isFinite(appCtx.Walk.state.walker?.x) && Number.isFinite(appCtx.Walk.state.walker?.z)) {
    return { x: appCtx.Walk.state.walker.x, z: appCtx.Walk.state.walker.z, source: 'walk' };
  }
  if (Number.isFinite(appCtx.car?.x) && Number.isFinite(appCtx.car?.z)) {
    return { x: appCtx.car.x, z: appCtx.car.z, source: 'drive' };
  }
  return null;
}

function resolveObservedEarthLocation() {
  if (appCtx.oceanMode?.active) {
    const sub = appCtx.oceanMode.submarine;
    const launchSite = appCtx.oceanMode.launchSite || {};
    if (Number.isFinite(sub?.position?.x) && Number.isFinite(sub?.position?.z) && Number.isFinite(launchSite.lat) && Number.isFinite(launchSite.lon)) {
      const lonDenom = appCtx.SCALE * Math.cos(launchSite.lat * Math.PI / 180);
      return {
        lat: launchSite.lat - sub.position.z / appCtx.SCALE,
        lon: launchSite.lon + sub.position.x / (Math.abs(lonDenom) > 0.0001 ? lonDenom : appCtx.SCALE),
        source: 'ocean_sub'
      };
    }
  }

  const worldPos = currentActorWorldPosition();
  if (worldPos) {
    const geo = worldPointToGeo(worldPos.x, worldPos.z);
    if (Number.isFinite(geo?.lat) && Number.isFinite(geo?.lon)) {
      return {
        lat: geo.lat,
        lon: geo.lon,
        source: worldPos.source
      };
    }
  }

  const refGeo = currentMapReferenceGeoPosition();
  if (Number.isFinite(refGeo?.lat) && Number.isFinite(refGeo?.lon)) {
    return {
      lat: refGeo.lat,
      lon: refGeo.lon,
      source: refGeo.source || 'map_reference'
    };
  }

  return {
    lat: Number.isFinite(appCtx.LOC?.lat) ? appCtx.LOC.lat : Number(appCtx.customLoc?.lat || 0),
    lon: Number.isFinite(appCtx.LOC?.lon) ? appCtx.LOC.lon : Number(appCtx.customLoc?.lon || 0),
    source: 'location_origin'
  };
}

function haversineKm(latA, lonA, latB, lonB) {
  if (![latA, lonA, latB, lonB].every(Number.isFinite)) return Infinity;
  const toRad = Math.PI / 180;
  const dLat = (latB - latA) * toRad;
  const dLon = (lonB - lonA) * toRad;
  const a = Math.sin(dLat * 0.5) ** 2 +
    Math.cos(latA * toRad) * Math.cos(latB * toRad) * Math.sin(dLon * 0.5) ** 2;
  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export { currentActorWorldPosition, resolveObservedEarthLocation, haversineKm };
