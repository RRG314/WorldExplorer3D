import {activeEarthActorPosition} from './transport/actor-contract.js?v=6';
import {earthLocalToGeographic} from './earth-core/location-origin.js?v=1';
import { ctx as appCtx } from "./shared-context.js?v=55";

function currentActorWorldPosition() { return activeEarthActorPosition(); }

function resolveObservedEarthLocation() {
  if (appCtx.oceanMode?.active) {
    const sub = appCtx.oceanMode.diver?.active?appCtx.oceanMode.diver.navigationActor():appCtx.oceanMode.submarine;
    const launchSite = appCtx.oceanMode.frameOrigin || appCtx.oceanMode.launchSite || {};
    if (Number.isFinite(sub?.position?.x) && Number.isFinite(sub?.position?.z) && Number.isFinite(launchSite.lat) && Number.isFinite(launchSite.lon)) {
      return {
        ...earthLocalToGeographic(launchSite,appCtx.SCALE,sub.position.x,sub.position.z),
        source: appCtx.oceanMode.diver?.active?'ocean_diver':'ocean_sub'
      };
    }
  }

  const worldPos = currentActorWorldPosition();
  if (worldPos && typeof appCtx.worldToLatLon === 'function') {
    const geo = appCtx.worldToLatLon(worldPos.x, worldPos.z);
    if (Number.isFinite(geo?.lat) && Number.isFinite(geo?.lon)) {
      return {
        lat: geo.lat,
        lon: geo.lon,
        source: worldPos.source
      };
    }
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
