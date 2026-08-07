import { inferSelectedLocationWaterKind } from "./water-location-hint.js?v=2";

export async function activateAcceptedGroundForWorldLoad(options = {}) {
  const {
    appCtx,
    endLoadPhase = () => {},
    finalizePerfLoad = () => {},
    loadMetrics = {},
    runtimeState = {},
    startLoadPhase = () => {}
  } = options;
  if (!appCtx?.terrainEnabled || appCtx.onMoon) return true;

  startLoadPhase('prepareAcceptedGround');
  appCtx.showLoad('Verifying accepted ground data...');
  let state;
  try {
    state = typeof appCtx.prepareAcceptedGroundFromCatalog === 'function'
      ? await appCtx.prepareAcceptedGroundFromCatalog({
          latitude: appCtx.LOC.lat,
          longitude: appCtx.LOC.lon,
          coverageProbes: [{
            latitude: appCtx.LOC.lat,
            longitude: appCtx.LOC.lon
          }]
        })
      : {
          status: 'blocked',
          reason: 'accepted-ground-catalog-runtime-missing'
        };
  } finally {
    endLoadPhase('prepareAcceptedGround');
  }

  loadMetrics.acceptedGround = state;
  if (state?.status === 'accepted') {
    runtimeState.acceptedGround = state;
    runtimeState.groundMode = 'accepted-ground';
    appCtx.publishLocationTerrain?.();
    return true;
  }

  const reason = String(state?.reason || 'accepted-ground-unavailable');
  const waterKind = appCtx.selLoc === 'custom'
    ? inferSelectedLocationWaterKind(appCtx)
    : null;
  const requestedBoatArrival =
    appCtx.selLoc === 'custom' &&
    appCtx.customLoc?.arrivalMode === 'boat';
  if (waterKind === 'open_ocean' || requestedBoatArrival) {
    const exemption = Object.freeze({
      status: 'not-applicable',
      reason: 'open-ocean-has-no-land-ground',
      waterKind: waterKind || 'open_ocean',
      requestedBoatArrival,
      rejectedGround: state || null
    });
    runtimeState.acceptedGround = exemption;
    runtimeState.groundMode = 'open-ocean-surface-only';
    loadMetrics.acceptedGround = exemption;
    appCtx.suppressGroundFallbackPlaceholder?.();
    appCtx.showLoad('Loading open-ocean surface data...');
    return true;
  }

  const fallback = Object.freeze({
    status: 'fallback',
    reason: 'worldwide-terrain-fallback',
    sourceClassification: 'worldwide-terrain-fallback',
    providerId: 'mapzen-terrarium',
    dataset: 'Mapzen Terrain Tiles',
    rejectedGround: state || null
  });
  runtimeState.acceptedGround = fallback;
  runtimeState.groundMode = 'worldwide-terrain-fallback';
  loadMetrics.acceptedGround = fallback;
  appCtx.showLoad('Loading worldwide terrain and OpenStreetMap data...');
  appCtx.publishLocationTerrain?.();
  return true;
}
