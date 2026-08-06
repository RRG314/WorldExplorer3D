import { createTransportControllerRegistry } from '../transport/controller-registry.js?v=1';

let controllerRegistry = null;
let controllerContext = null;

function updateWalkController(appCtx, dt) {
  appCtx.Walk.update(dt);
}

function updateWalkAuxiliaries(appCtx, dt) {
  appCtx.Walk.syncTerrain?.(false);
  appCtx.appendTrackPoint?.(appCtx.Walk.state.walker.x, appCtx.Walk.state.walker.z);

  appCtx.police.forEach((officer) => {
    const distance = Math.hypot(
      appCtx.Walk.state.walker.x - officer.x,
      appCtx.Walk.state.walker.z - officer.z
    );
    if (distance >= 15 || officer.caught) return;
    officer.caught = true;
    appCtx.policeHits++;
    const policeHud = document.getElementById('police');
    if (policeHud) {
      policeHud.textContent = `💔 ${appCtx.policeHits}/3`;
      policeHud.classList.add('warn');
    }
    if (appCtx.policeHits >= 3) {
      appCtx.setPauseReason?.('caught', true);
      document.getElementById('caughtScreen')?.classList.add('show');
    }
  });

  appCtx.updateMode?.(dt);
  appCtx.updateInteriorInteraction?.();
}

function createEarthTransportControllers(appCtx, options = {}) {
  const { isPlanetarySurface, updateDrone, updatePlane } = options;
  const registry = createTransportControllerRegistry({
    onConflict({ activeId, candidates }) {
      console.warn(`[transport] Conflicting active modes (${candidates.join(', ')}); ${activeId} owns this frame.`);
    },
    onError({ controller, error, stage }) {
      console.error(`[transport] ${controller.id} ${stage} failed`, error);
    }
  });
  registry.registerController({
    id: 'boat',
    priority: 10,
    isActive: () => !!appCtx.boatMode?.active,
    update(dt) {
      appCtx.updateBoatMode?.(dt);
    }
  });
  registry.registerController({
    id: 'plane',
    priority: 20,
    isActive: () => !!appCtx.planeMode?.active,
    update(dt) {
      updatePlane(dt);
    }
  });
  registry.registerController({
    id: 'drone',
    priority: 30,
    isActive: () => !!appCtx.droneMode,
    update(dt) {
      updateDrone(dt);
    }
  });
  registry.registerController({
    id: 'walk',
    priority: 40,
    isActive: () => appCtx.Walk?.state?.mode === 'walk',
    update: (dt) => updateWalkController(appCtx, dt)
  });
  return registry;
}

function ensureControllerRegistry(appCtx, options) {
  if (!controllerRegistry || controllerContext !== appCtx) {
    controllerContext = appCtx;
    controllerRegistry = createEarthTransportControllers(appCtx, options);
  }
  return controllerRegistry;
}

function updateAlternateTravelMode(appCtx, dt, options = {}) {
  if (!appCtx.boatMode?.active && (appCtx.fishingGame?.open || appCtx.fishingGame?.active)) {
    appCtx.updateFishingGame?.(dt);
  }
  const registry = ensureControllerRegistry(appCtx, options);
  const updated = registry.update(dt, { appCtx });
  if (!updated) return false;
  const activeId = registry.snapshot({ appCtx }).activeId;
  if (activeId === 'walk') {
    updateWalkAuxiliaries(appCtx, dt);
  } else if (activeId === 'boat') {
    appCtx.updateFishingGame?.(dt);
    appCtx.updateMode?.(dt);
  } else if (activeId === 'plane') {
    appCtx.updateMode?.(dt);
    appCtx.updateInteriorInteraction?.();
  } else if (activeId === 'drone') {
    appCtx.updateMode?.(dt);
    appCtx.updateInteriorInteraction?.();
  }
  return true;
}

function getEarthTransportControllerSnapshot(appCtx, options = {}) {
  return ensureControllerRegistry(appCtx, options).snapshot({ appCtx });
}

export { getEarthTransportControllerSnapshot, updateAlternateTravelMode };
