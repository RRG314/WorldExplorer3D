import { ctx as appCtx } from "./shared-context.js?v=55";
import { nextPrimaryTravelMode } from "./controls/traversal-control-policy.js?v=8";
import { planetarySurfaceYAtRenderXZ } from './planetary/runtime/surface-query.js?v=3';

function getCurrentTravelMode() {
  if (appCtx.boatMode?.active) return 'boat';
  if (appCtx.planeMode?.active) return 'plane';
  if (appCtx.droneMode) return 'drone';
  if (appCtx.Walk?.state?.mode === 'walk') return 'walk';
  return 'drive';
}

function setDroneModeActive(active) {
  appCtx.droneMode = active === true;
  return appCtx.droneMode;
}

function syncTravelModeButtons() {
  const activeMode = getCurrentTravelMode();
  const boatLocked = activeMode === 'boat';
  const drivingBtn = document.getElementById('fDriving');
  const walkingBtn = document.getElementById('fWalk');
  const droneBtn = document.getElementById('fDrone');
  const planeBtn = document.getElementById('fPlane');
  const boatBtn = document.getElementById('fBoat');
  if (drivingBtn) drivingBtn.classList.toggle('on', activeMode === 'drive');
  if (walkingBtn) walkingBtn.classList.toggle('on', activeMode === 'walk');
  if (droneBtn) droneBtn.classList.toggle('on', activeMode === 'drone');
  if (planeBtn) planeBtn.classList.toggle('on', activeMode === 'plane');
  if (boatBtn) boatBtn.classList.toggle('on', activeMode === 'boat');
  const planetaryCapabilities = appCtx.activePlanetaryBodyId ? appCtx.planetaryTravelCapabilities : null;
  [
    [drivingBtn, 'drive'],
    [walkingBtn, 'walk'],
    [droneBtn, 'drone'],
    [planeBtn, 'plane'],
    [boatBtn, 'boat'],
    [document.getElementById('fOceanMode'), 'ocean'],
    [document.getElementById('fEarthMode'), 'earth'],
    [document.getElementById('fSpaceDirect'), 'space'],
    [document.getElementById('fSpaceRocket'), 'space'],
    [document.getElementById('fSpaceMars'), 'space']
  ].forEach(([button, mode]) => {
    if (button) button.style.display = boatLocked || (planetaryCapabilities && planetaryCapabilities[mode] !== true) ? 'none' : '';
  });
  return activeMode;
}

function buildingTopY(building) {
  const minY = Number.isFinite(building?.minY) ? building.minY : building?.baseY;
  if (Number.isFinite(building?.maxY)) return building.maxY;
  if (Number.isFinite(minY) && Number.isFinite(building?.height)) return minY + building.height;
  return null;
}

function distanceToBuildingBounds(x, z, building) {
  if (
    !Number.isFinite(building?.minX) ||
    !Number.isFinite(building?.maxX) ||
    !Number.isFinite(building?.minZ) ||
    !Number.isFinite(building?.maxZ)
  ) {
    return Infinity;
  }
  const nearestX = Math.max(building.minX, Math.min(building.maxX, x));
  const nearestZ = Math.max(building.minZ, Math.min(building.maxZ, z));
  return Math.hypot(nearestX - x, nearestZ - z);
}

function applyDroneRoofClearance(x, z, groundY, desiredY) {
  const clearanceRadius = 24;
  const nearbyBuildings = typeof appCtx.getNearbyBuildings === 'function'
    ? appCtx.getNearbyBuildings(x, z, clearanceRadius + 16)
    : appCtx.buildings;
  if (!Array.isArray(nearbyBuildings) || nearbyBuildings.length === 0) return desiredY;

  let highestNearbyRoof = -Infinity;
  for (let i = 0; i < nearbyBuildings.length; i++) {
    const building = nearbyBuildings[i];
    if (!building || distanceToBuildingBounds(x, z, building) > clearanceRadius) continue;
    const topY = buildingTopY(building);
    if (Number.isFinite(topY)) highestNearbyRoof = Math.max(highestNearbyRoof, topY);
  }

  if (!Number.isFinite(highestNearbyRoof) || highestNearbyRoof + 8 <= desiredY) return desiredY;
  const clearedY = Math.min(groundY + 360, highestNearbyRoof + 8);
  console.info('[travel-mode] Raised drone launch for nearby roof clearance.', {
    desiredY: Number(desiredY.toFixed(2)),
    clearedY: Number(clearedY.toFixed(2))
  });
  return clearedY;
}

function sampleDroneSpawnHeight(x, z) {
  if (appCtx.onMars || appCtx.onMoon) {
    const surfaceY = planetarySurfaceYAtRenderXZ(appCtx, x, z);
    if (Number.isFinite(surfaceY)) return surfaceY + 10;
    return 10;
  }

  const walkSurfaceY = appCtx.SurfaceQuery?.walkAt?.(x, z)?.position?.y;
  if (Number.isFinite(walkSurfaceY)) {
    return applyDroneRoofClearance(x, z, walkSurfaceY, walkSurfaceY + 12);
  }

  return 50;
}

function syncDronePositionFromReference(options = {}) {
  const ref = options.reference || (appCtx.Walk?.getMapRefPosition ?
    appCtx.Walk.getMapRefPosition(false, null) :
    {
      x: Number.isFinite(appCtx.car?.x) ? appCtx.car.x : 0,
      z: Number.isFinite(appCtx.car?.z) ? appCtx.car.z : 0
    });

  appCtx.drone.x = ref.x;
  appCtx.drone.z = ref.z;
  appCtx.drone.yaw = Number.isFinite(ref?.yaw) ? ref.yaw : Number.isFinite(ref?.angle) ? ref.angle : Number(appCtx.car?.angle) || 0;
  appCtx.drone.cameraYawOffset = 0;
  appCtx.drone.cameraPitchOffset = 0;
  appCtx.drone.cameraLookTimer = 0;
  appCtx.drone.roll = 0;
  const safeLaunchY = sampleDroneSpawnHeight(ref.x, ref.z);
  appCtx.drone.y = options.preserveAltitude && Number.isFinite(ref?.y) ? Math.max(safeLaunchY, ref.y) : safeLaunchY;
  appCtx.drone.pitch = Number.isFinite(ref?.pitch) ? ref.pitch : appCtx.onMoon || appCtx.onMars ? -0.2 : -0.3;
}

function resetCameraForDroneMode() {
  if (!appCtx.camera) return;
  appCtx.camera.up?.set?.(0, 1, 0);
  appCtx.camera.rotation.order = 'YXZ';
  if (appCtx.camera.userData) {
    delete appCtx.camera.userData.lookTarget;
    delete appCtx.camera.userData.boatrig;
  }
  appCtx.camera.updateProjectionMatrix?.();
}

function emitTravelModeEvent(mode, source = 'runtime') {
  if (typeof appCtx.tutorialOnEvent === 'function') {
    appCtx.tutorialOnEvent('mode_switched', { mode, source });
  }
}

function clearControllerLocalState(targetMode) {
  appCtx.clearControlInputState?.('travel-mode-transition');
  if (targetMode === 'drive' && appCtx.car) {
    appCtx.car.steerSm = 0;
    appCtx.car.throttleSm = 0;
    appCtx.car.yawRate = 0;
    appCtx.car.vLat = 0;
    appCtx.car.rearSlip = 0;
    appCtx.car.isDrifting = false;
    appCtx.car._driftHoldTimer = 0;
  }
  if (targetMode !== 'drone' && appCtx.drone) {
    appCtx.drone.roll = 0;
    appCtx.drone.cameraYawOffset = 0;
    appCtx.drone.cameraPitchOffset = 0;
    appCtx.drone.cameraLookTimer = 0;
  }
}

function captureActiveModeReference(currentMode) {
  const actor = appCtx.activeTransportActor?.();
  if (!actor || actor.mode !== currentMode) return null;
  const x = Number(actor.position?.x);
  const y = Number(actor.position?.y);
  const z = Number(actor.position?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return {
    mode: currentMode,
    x,
    y: Number.isFinite(y) ? y : undefined,
    z,
    angle: Number(actor.orientation?.yaw) || 0
  };
}

function handoffAirPositionToGround(reference, targetMode) {
  if (
    reference?.mode !== 'drone' ||
    (targetMode !== 'walk' && targetMode !== 'drive')
  ) return false;

  const resolved = appCtx.resolveSafeWorldSpawn?.(reference.x, reference.z, {
    mode: targetMode,
    angle: reference.angle,
    source: 'travel_mode_actor_handoff',
    maxRoadDistance: targetMode === 'drive' ? 180 : 80,
    maxGroundRadius: 48,
    fastLocalFallback: true
  });
  if (!resolved || typeof appCtx.applyResolvedWorldSpawn !== 'function') return false;
  appCtx.applyResolvedWorldSpawn(resolved, {
    mode: targetMode,
    syncCar: true,
    syncWalker: true
  });
  return true;
}

function setTravelMode(mode, options = {}) {
  const targetMode = mode === 'walk' || mode === 'drone' || mode === 'boat' || mode === 'plane' ? mode : 'drive';
  const currentMode = getCurrentTravelMode();
  const planetaryCapabilities = appCtx.activePlanetaryBodyId ? appCtx.planetaryTravelCapabilities : null;
  if (planetaryCapabilities && planetaryCapabilities[targetMode] !== true) {
    return syncTravelModeButtons();
  }
  const modeReference = captureActiveModeReference(currentMode);
  if (targetMode !== currentMode) clearControllerLocalState(targetMode);

  if (targetMode === 'boat' && appCtx.oceanMode?.active && typeof appCtx.transferSubmarineToBoat === 'function') {
    void appCtx.transferSubmarineToBoat({
      source: options.source || 'runtime',
      emitTutorial: options.emitTutorial !== false
    });
    return syncTravelModeButtons();
  }

  if (targetMode !== 'walk' && appCtx.activeInterior && typeof appCtx.clearActiveInterior === 'function') {
    appCtx.clearActiveInterior({ restorePlayer: true, preserveCache: true });
  }

  if (targetMode !== 'boat' && appCtx.boatMode?.active && typeof appCtx.stopBoatMode === 'function') {
    if (options.force !== true && typeof appCtx.canExitBoatMode === 'function' && !appCtx.canExitBoatMode(targetMode, {
      showNotice: true,
      source: options.source || 'runtime_switch'
    })) {
      const resolvedMode = syncTravelModeButtons();
      if (typeof appCtx.updateControlsModeUI === 'function') {
        appCtx.updateControlsModeUI();
      }
      return resolvedMode;
    }
    appCtx.stopBoatMode({
      targetMode,
      source: options.source || 'runtime_switch'
    });
  }

  let planeExitState = null;
  if (targetMode !== 'plane' && appCtx.planeMode?.active) {
    planeExitState = appCtx.stopPlaneMode?.({ targetMode }) || null;
  }

  if (targetMode === 'plane') {
    if (appCtx.onMoon || appCtx.onMars || !appCtx.startPlaneMode?.(options)) {
      return syncTravelModeButtons();
    }
    setDroneModeActive(false);
    if (appCtx.Walk?.state?.mode === 'walk') appCtx.Walk.setModeDrive();
    if (appCtx.Walk?.state?.characterMesh) appCtx.Walk.state.characterMesh.visible = false;
    if (appCtx.carMesh) appCtx.carMesh.visible = false;
  } else if (targetMode === 'walk') {
    setDroneModeActive(false);
    const preservedCurrentPosition = handoffAirPositionToGround(modeReference, 'walk');
    if (appCtx.Walk && appCtx.Walk.state?.mode !== 'walk') {
      appCtx.Walk.setModeWalk({
        preserveResolvedSpawn: !!planeExitState || preservedCurrentPosition,
        preserveResolvedSurface: planeExitState?.landedOnRoof === true,
        deferWorldSync: !!planeExitState || preservedCurrentPosition
      });
    }
    if (appCtx.Walk?.state?.characterMesh) appCtx.Walk.state.characterMesh.visible = true;
    if (appCtx.carMesh) appCtx.carMesh.visible = false;
  } else if (targetMode === 'drone') {
    if (appCtx.Walk?.state?.mode === 'walk') {
      appCtx.Walk.setModeDrive();
    }
    syncDronePositionFromReference({
      reference: planeExitState || undefined,
      preserveAltitude: !!planeExitState
    });
    resetCameraForDroneMode();
    setDroneModeActive(true);
    if (appCtx.carMesh) appCtx.carMesh.visible = false;
  } else if (targetMode === 'boat') {
    if (typeof appCtx.startBoatMode === 'function') {
      const started = appCtx.startBoatMode({
        source: options.source || 'runtime',
        force: options.force === true,
        spawnX: Number.isFinite(options.spawnX) ? options.spawnX : undefined,
        spawnZ: Number.isFinite(options.spawnZ) ? options.spawnZ : undefined,
        yaw: Number.isFinite(options.yaw) ? options.yaw : undefined,
        candidate: options.candidate || undefined,
        entryMode: options.entryMode || undefined,
        transportEntityId: options.transportEntityId || undefined,
        transportCatalogId: options.transportCatalogId || undefined,
        condition: Number.isFinite(options.condition) ? options.condition : undefined
      });
      if (!started) {
        return syncTravelModeButtons();
      }
    } else {
      return syncTravelModeButtons();
    }
  } else {
    setDroneModeActive(false);
    handoffAirPositionToGround(modeReference, 'drive');
    if (appCtx.Walk?.state?.mode === 'walk') {
      appCtx.Walk.setModeDrive();
    }
    appCtx.setCameraMode(0);
    if (appCtx.camera?.userData) appCtx.camera.userData.carLook = { yaw: 0, pitch: 0 };
    if (appCtx.carMesh) appCtx.carMesh.visible = true;
  }

  if (typeof appCtx.clearStarSelection === 'function') {
    appCtx.clearStarSelection();
  }

  const resolvedMode = syncTravelModeButtons();
  if (typeof appCtx.updateControlsModeUI === 'function') {
    appCtx.updateControlsModeUI();
  }

  if (options.emitTutorial !== false && (options.force === true || resolvedMode !== currentMode)) {
    emitTravelModeEvent(resolvedMode, options.source || 'runtime');
  }

  return resolvedMode;
}

function toggleWalkDriveMode(options = {}) {
  const nextMode = getCurrentTravelMode() === 'walk' ? 'drive' : 'walk';
  return setTravelMode(nextMode, options);
}

function toggleDroneMode(options = {}) {
  const nextMode = getCurrentTravelMode() === 'drone' ? 'drive' : 'drone';
  return setTravelMode(nextMode, options);
}

function cyclePrimaryTravelMode(options = {}) {
  const currentMode = getCurrentTravelMode();
  const nextMode = currentMode === 'boat' ? 'walk' : nextPrimaryTravelMode(currentMode);
  const resolvedMode = setTravelMode(nextMode, options);
  if (nextMode === 'plane' && resolvedMode !== 'plane') {
    return setTravelMode('drone', options);
  }
  return resolvedMode;
}

function togglePlaneMode(options = {}) {
  const nextMode = getCurrentTravelMode() === 'plane' ? 'drive' : 'plane';
  return setTravelMode(nextMode, options);
}

function toggleBoatMode(options = {}) {
  const nextMode = getCurrentTravelMode() === 'boat' ? 'walk' : 'boat';
  return setTravelMode(nextMode, options);
}

Object.assign(appCtx, {
  getCurrentTravelMode,
  cyclePrimaryTravelMode,
  setDroneModeActive,
  setTravelMode,
  syncTravelModeButtons,
  toggleBoatMode,
  toggleDroneMode,
  togglePlaneMode,
  toggleWalkDriveMode
});

export {
  cyclePrimaryTravelMode,
  getCurrentTravelMode,
  setDroneModeActive,
  setTravelMode,
  syncTravelModeButtons,
  toggleBoatMode,
  toggleDroneMode,
  togglePlaneMode,
  toggleWalkDriveMode
};
