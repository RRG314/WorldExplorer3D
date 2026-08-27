import {
  carSpeedToMph,
  worldUnitsPerSecondToMph
} from '../physics/vehicle-speed-units.js?v=2';

function measuredSpeedMph(appCtx, actor) {
  if (actor.mode === 'walk') return Math.abs(appCtx.Walk?.state?.walker?.speedMph || 0);
  if (actor.mode === 'drive') return Math.abs(carSpeedToMph(appCtx.car?.speed || 0));

  let worldUnitsPerSecond = 0;
  if (actor.mode === 'plane') {
    worldUnitsPerSecond = Math.abs(appCtx.planeMode?.speed || 0);
  } else if (actor.mode === 'boat') {
    worldUnitsPerSecond = Math.abs(appCtx.boat?.forwardSpeed ?? appCtx.boat?.speed ?? 0);
  } else if (actor.mode === 'drone') {
    worldUnitsPerSecond = Math.hypot(
      Number(appCtx.drone?.vx) || 0,
      Number(appCtx.drone?.vy) || 0,
      Number(appCtx.drone?.vz) || 0
    );
  }
  return Math.abs(worldUnitsPerSecondToMph(worldUnitsPerSecond, appCtx.METERS_PER_WORLD_UNIT));
}

function createDebugPresentationSystem(appCtx) {
  function actorDebugState() {
    const actor = appCtx.activeTransportActor?.();
    if (!actor) return null;
    return {
      mode: actor.mode,
      x: actor.position.x,
      y: actor.position.y,
      z: actor.position.z,
      speed: Math.round(measuredSpeedMph(appCtx, actor))
    };
  }

  function nearestSurface(state) {
    if (!state) return null;
    if (state.mode === 'drive' || state.mode === 'boat') return appCtx.findNearestRoad?.(state.x, state.z) || null;
    return appCtx.findNearestTraversalFeature?.(state.x, state.z, { mode: 'walk', maxDistance: 24 }) ||
      appCtx.findNearestRoad?.(state.x, state.z) || null;
  }

  function surfaceState(state) {
    const nearest = nearestSurface(state);
    const feature = nearest?.feature || nearest?.road || null;
    const distance = Number.isFinite(nearest?.dist) ? nearest.dist : null;
    const roadMode = state?.mode === 'drive' || state?.mode === 'boat';
    const halfWidth = feature?.width ? feature.width * 0.5 : 5;
    return {
      distance,
      feature,
      onSurface: roadMode ? !!appCtx.car?.onRoad : Number.isFinite(distance) && distance <= halfWidth + 3
    };
  }

  return {
    id: 'debug.presentation',
    owner: 'diagnostics',
    phase: 'presentation',
    priority: 100,
    critical: false,
    enabled: (frame) => !!frame.flags.hudRefreshed,
    update(frame) {
      if (window.apollo11Beacon && appCtx.isEnv(appCtx.ENV.MOON)) {
        const pulse = 0.5 + 0.5 * Math.sin(frame.timestamp / 1000 * 2);
        const beam = window.apollo11Beacon.children[0];
        const glow = window.apollo11Beacon.children[1];
        if (beam?.material) beam.material.opacity = 0.3 + pulse * 0.2;
        if (glow?.material) glow.material.opacity = 0.6 + pulse * 0.3;
      }

      if (!window._debugMode || !appCtx.gameStarted) return;
      const state = actorDebugState();
      if (!state) return;
      const surface = surfaceState(state);
      const terrainY = appCtx.elevationWorldYAtWorldXZ(state.x, state.z);
      const overlay = document.getElementById('debugOverlay');
      if (overlay) {
        const featureName = appCtx.surfaceDisplayName?.(surface.feature) || surface.feature?.name || '-';
        overlay.textContent =
          `Mode: ${state.mode.toUpperCase()}  Speed: ${state.speed} mph\n` +
          `Ref Y: ${Number.isFinite(state.y) ? state.y.toFixed(2) : '?'}  Terrain Y: ${Number(terrainY).toFixed(2)}\n` +
          `On surface: ${surface.onSurface ? 'YES' : 'no'}  dist: ${Number.isFinite(surface.distance) ? surface.distance.toFixed(1) : '?'}\n` +
          `Surface: ${featureName}`;
      }

      if (window._debugMarker) {
        window._debugMarker.position.set(state.x, terrainY, state.z);
        window._debugMarker.material.color.setHex(surface.onSurface ? 0x00ff00 : 0xffff00);
      }
    }
  };
}

export { createDebugPresentationSystem };
