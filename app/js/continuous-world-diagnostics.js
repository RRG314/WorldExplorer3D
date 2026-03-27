import { ctx as appCtx } from "./shared-context.js?v=55";
import { isRoadSurfaceReachable, roadBehavesGradeSeparated } from "./structure-semantics.js?v=26";
import "./continuous-world-feature-ownership.js?v=2";
import "./continuous-world-feature-manager.js?v=2";

function currentTravelMode() {
  if (appCtx.oceanMode?.active) return 'ocean';
  if (appCtx.boatMode?.active) return 'boat';
  if (appCtx.droneMode) return 'drone';
  if (appCtx.Walk?.state?.mode === 'walk') return 'walk';
  return 'drive';
}

function currentActorState() {
  const mode = currentTravelMode();
  if (mode === 'ocean') {
    const ocean = typeof appCtx.getOceanModeDebugState === 'function' ? appCtx.getOceanModeDebugState() : null;
    return {
      mode,
      x: Number(ocean?.position?.x || 0),
      y: Number(ocean?.position?.y || 0),
      z: Number(ocean?.position?.z || 0),
      yaw: Number(ocean?.yaw || 0),
      speed: Number(ocean?.speed || 0)
    };
  }
  if (mode === 'boat') {
    return {
      mode,
      x: Number(appCtx.boat?.x || 0),
      y: Number(appCtx.boat?.y || 0),
      z: Number(appCtx.boat?.z || 0),
      yaw: Number(appCtx.boat?.angle || 0),
      speed: Number(appCtx.boat?.speed || 0)
    };
  }
  if (mode === 'drone') {
    return {
      mode,
      x: Number(appCtx.drone?.x || 0),
      y: Number(appCtx.drone?.y || 0),
      z: Number(appCtx.drone?.z || 0),
      yaw: Number(appCtx.drone?.yaw || 0),
      speed: Number(appCtx.drone?.speed || 0)
    };
  }
  if (mode === 'walk') {
    const walker = appCtx.Walk?.state?.walker || {};
    return {
      mode,
      x: Number(walker.x || 0),
      y: Number(walker.y || 0),
      z: Number(walker.z || 0),
      yaw: Number(walker.angle || walker.yaw || 0),
      speed: Number(walker.speedMph || 0)
    };
  }
  return {
    mode,
    x: Number(appCtx.car?.x || 0),
    y: Number(appCtx.car?.y || 0),
    z: Number(appCtx.car?.z || 0),
    yaw: Number(appCtx.car?.angle || 0),
    speed: Number(appCtx.car?.speed || 0)
  };
}

function coordinateSnapshot(actor) {
  const geo = typeof appCtx.worldToLatLon === 'function' ? appCtx.worldToLatLon(actor.x, actor.z) : null;
  const roundTrip = geo && typeof appCtx.geoToWorld === 'function' ? appCtx.geoToWorld(geo.lat, geo.lon) : null;
  const roundTripError =
    roundTrip && Number.isFinite(roundTrip.x) && Number.isFinite(roundTrip.z) ?
      Math.hypot(roundTrip.x - actor.x, roundTrip.z - actor.z) :
      null;

  const minimap = document.getElementById('minimap');
  let minimapCenterWorld = null;
  if (minimap && typeof appCtx.minimapScreenToWorld === 'function') {
    const width = Number(minimap.width || minimap.clientWidth || 0);
    const height = Number(minimap.height || minimap.clientHeight || 0);
    if (width > 0 && height > 0) {
      minimapCenterWorld = appCtx.minimapScreenToWorld(width * 0.5, height * 0.5);
    }
  }
  const minimapCenterDrift =
    minimapCenterWorld && Number.isFinite(minimapCenterWorld.x) && Number.isFinite(minimapCenterWorld.z) ?
      Math.hypot(minimapCenterWorld.x - actor.x, minimapCenterWorld.z - actor.z) :
      null;

  const largeMapCanvas = document.getElementById('largeMapCanvas');
  let largeMapCenterWorld = null;
  if (largeMapCanvas && typeof appCtx.largeMapScreenToWorld === 'function') {
    const width = Number(largeMapCanvas.width || largeMapCanvas.clientWidth || 0);
    const height = Number(largeMapCanvas.height || largeMapCanvas.clientHeight || 0);
    if (width > 0 && height > 0) {
      largeMapCenterWorld = appCtx.largeMapScreenToWorld(width * 0.5, height * 0.5);
    }
  }
  const largeMapCenterDrift =
    largeMapCenterWorld && Number.isFinite(largeMapCenterWorld.x) && Number.isFinite(largeMapCenterWorld.z) ?
      Math.hypot(largeMapCenterWorld.x - actor.x, largeMapCenterWorld.z - actor.z) :
      null;

  return {
    lat: Number.isFinite(geo?.lat) ? Number(geo.lat.toFixed(7)) : null,
    lon: Number.isFinite(geo?.lon) ? Number(geo.lon.toFixed(7)) : null,
    roundTripError: Number.isFinite(roundTripError) ? Number(roundTripError.toFixed(4)) : null,
    minimapCenterDrift: Number.isFinite(minimapCenterDrift) ? Number(minimapCenterDrift.toFixed(4)) : null,
    largeMapCenterDrift: Number.isFinite(largeMapCenterDrift) ? Number(largeMapCenterDrift.toFixed(4)) : null
  };
}

function roadSnapshot(actor) {
  const mode = actor.mode;
  const isDriveLike = mode === 'drive' || mode === 'drone';
  const feetY =
    mode === 'walk' ? actor.y - 1.7 :
    mode === 'drive' ? actor.y - 1.2 :
    mode === 'boat' || mode === 'ocean' ? actor.y :
    actor.y;
  const currentRoad = appCtx.car?.road || appCtx.car?._lastStableRoad || null;
  const nearestRoad = typeof appCtx.findNearestRoad === 'function' ?
    appCtx.findNearestRoad(actor.x, actor.z, {
      y: Number.isFinite(feetY) ? feetY + 1.2 : NaN,
      maxVerticalDelta: isDriveLike ? 18 : 12,
      preferredRoad: currentRoad
    }) :
    null;

  const driveSurfaceY =
    mode === 'drive' && typeof appCtx.GroundHeight?.driveSurfaceY === 'function' ?
      appCtx.GroundHeight.driveSurfaceY(actor.x, actor.z, feetY) :
      null;
  const walkSurfaceInfo =
    mode === 'walk' && typeof appCtx.GroundHeight?.walkSurfaceInfo === 'function' ?
      appCtx.GroundHeight.walkSurfaceInfo(actor.x, actor.z, feetY) :
      null;
  const terrainY =
    typeof appCtx.GroundHeight?.terrainY === 'function' ?
      appCtx.GroundHeight.terrainY(actor.x, actor.z) :
      null;

  const currentSurfaceY = mode === 'drive' ?
    driveSurfaceY :
    Number.isFinite(walkSurfaceInfo?.y) ? walkSurfaceInfo.y : terrainY;
  const currentBaseY =
    mode === 'walk' ? actor.y - 1.7 :
    mode === 'drive' ? actor.y - 1.2 :
    actor.y;

  return {
    onRoad: !!appCtx.car?.onRoad,
    currentRoadType: currentRoad?.type || null,
    currentRoadName: currentRoad?.name || null,
    currentRoadGradeSeparated: currentRoad ? roadBehavesGradeSeparated(currentRoad) : false,
    nearestRoadType: nearestRoad?.road?.type || null,
    nearestRoadReachable: !!isRoadSurfaceReachable(nearestRoad, {
      currentRoad,
      extraVerticalAllowance: mode === 'drive' ? 0.5 : 0.25
    }),
    surfaceY: Number.isFinite(currentSurfaceY) ? Number(currentSurfaceY.toFixed(4)) : null,
    terrainY: Number.isFinite(terrainY) ? Number(terrainY.toFixed(4)) : null,
    actorBaseY: Number.isFinite(currentBaseY) ? Number(currentBaseY.toFixed(4)) : null,
    surfaceDelta: Number.isFinite(currentSurfaceY) && Number.isFinite(currentBaseY) ?
      Number((currentBaseY - currentSurfaceY).toFixed(4)) :
      null,
    terrainDelta: Number.isFinite(terrainY) && Number.isFinite(currentBaseY) ?
      Number((currentBaseY - terrainY).toFixed(4)) :
      null
  };
}

function waterSnapshot() {
  return {
    waterAreas: Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas.length : 0,
    waterways: Array.isArray(appCtx.waterways) ? appCtx.waterways.length : 0,
    waterWaveVisuals: Array.isArray(appCtx.waterWaveVisuals) ? appCtx.waterWaveVisuals.length : 0,
    boat: typeof appCtx.getBoatModeSnapshot === 'function' ? appCtx.getBoatModeSnapshot() : null,
    ocean: typeof appCtx.getOceanModeDebugState === 'function' ? appCtx.getOceanModeDebugState() : null
  };
}

function perfSnapshot() {
  if (typeof appCtx.capturePerfSnapshot !== 'function') return null;
  const snapshot = appCtx.capturePerfSnapshot();
  return {
    fps: Number.isFinite(snapshot?.fps) ? snapshot.fps : null,
    frameMs: Number.isFinite(snapshot?.frameMs) ? snapshot.frameMs : null,
    dynamicBudget: snapshot?.dynamicBudget || null,
    spikes: snapshot?.spikes || null,
    renderer: snapshot?.renderer || null,
    live: snapshot?.live || null,
    lastLoad: snapshot?.lastLoad || null
  };
}

function getContinuousWorldValidationSnapshot() {
  const actor = currentActorState();
  return {
    generatedAt: new Date().toISOString(),
    env: typeof appCtx.getEnv === 'function' ? appCtx.getEnv() : null,
    worldLoading: !!appCtx.worldLoading,
    worldBuild: {
      stage: String(appCtx.worldBuildStage || 'idle'),
      loading: !!appCtx.worldLoading
    },
    actor,
    coordinates: coordinateSnapshot(actor),
    continuousWorld: typeof appCtx.getContinuousWorldRuntimeSnapshot === 'function' ? appCtx.getContinuousWorldRuntimeSnapshot() : null,
    playableCore: typeof appCtx.getPlayableCoreResidencySnapshot === 'function' ? appCtx.getPlayableCoreResidencySnapshot() : null,
    interactiveStream: typeof appCtx.getContinuousWorldInteractiveStreamSnapshot === 'function' ? appCtx.getContinuousWorldInteractiveStreamSnapshot() : null,
    featureRegions: typeof appCtx.getContinuousWorldFeatureRegionSnapshot === 'function' ? appCtx.getContinuousWorldFeatureRegionSnapshot() : null,
    terrain: typeof appCtx.getTerrainStreamingSnapshot === 'function' ? appCtx.getTerrainStreamingSnapshot() : null,
    road: roadSnapshot(actor),
    featureOwnership: typeof appCtx.getContinuousWorldFeatureOwnershipSnapshot === 'function' ? appCtx.getContinuousWorldFeatureOwnershipSnapshot() : null,
    water: waterSnapshot(),
    perf: perfSnapshot()
  };
}

Object.assign(appCtx, {
  getContinuousWorldValidationSnapshot
});

export { getContinuousWorldValidationSnapshot };
