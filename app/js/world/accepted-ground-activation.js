import { inferSelectedLocationWaterKind } from "./water-location-hint.js?v=2";
import { resolveWorldSurfaceDomain } from "../earth-core/world-surface-domain.js?v=1";

export async function activateAcceptedGroundForWorldLoad(options = {}) {
  const {
    appCtx,
    endLoadPhase = () => {},
    finalizePerfLoad = () => {},
    loadMetrics = {},
    runtimeState = {},
    signal = null,
    startLoadPhase = () => {}
  } = options;
  if (!appCtx?.terrainEnabled || appCtx.onMoon) return true;

  const initialSurfaceDomain = resolveWorldSurfaceDomain({
    location: appCtx.LOC,
    mappedWaterKind: appCtx.selLoc === 'custom'
      ? inferSelectedLocationWaterKind(appCtx)
      : null,
    requestedArrivalMode: appCtx.customLoc?.arrivalMode
  });
  runtimeState.surfaceDomain = initialSurfaceDomain;
  loadMetrics.surfaceDomain = initialSurfaceDomain;
  if (initialSurfaceDomain.kind === 'cryosphere') {
    const polarSurface = Object.freeze({
      status: 'accepted',
      reason: initialSurfaceDomain.reason,
      providerId: initialSurfaceDomain.sourcePolicy,
      dataset: initialSurfaceDomain.subtype === 'sea_ice'
        ? 'fixed Arctic sea-ice presentation'
        : 'fixed Antarctic ice-sheet presentation',
      surfaceDomain: initialSurfaceDomain
    });
    runtimeState.acceptedGround = polarSurface;
    runtimeState.groundMode = initialSurfaceDomain.groundMode;
    loadMetrics.acceptedGround = polarSurface;
    appCtx.showLoad('Building fixed polar terrain...');
    appCtx.publishLocationTerrain?.();
    return true;
  }

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
          }],
          signal
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
    runtimeState.surfaceDomain = Object.freeze({
      ...initialSurfaceDomain,
      groundMode: 'accepted-ground'
    });
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
    runtimeState.surfaceDomain = resolveWorldSurfaceDomain({
      location: appCtx.LOC,
      mappedWaterKind: waterKind,
      requestedArrivalMode: requestedBoatArrival ? 'boat' : null
    });
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
  runtimeState.surfaceDomain = Object.freeze({
    ...initialSurfaceDomain,
    groundMode: 'worldwide-terrain-fallback'
  });
  loadMetrics.acceptedGround = fallback;
  appCtx.showLoad('Loading worldwide terrain and OpenStreetMap data...');
  appCtx.publishLocationTerrain?.();
  return true;
}
