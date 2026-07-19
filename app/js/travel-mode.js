import { ctx as appCtx } from "./shared-context.js?v=55";

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
  const planetarySurface = appCtx.onMars && appCtx.marsSurface ? appCtx.marsSurface : appCtx.onMoon ? appCtx.moonSurface : null;
  if (planetarySurface) {
    const rc = appCtx._getPhysRaycaster?.();
    if (rc && appCtx._physRayStart && appCtx._physRayDir) {
      appCtx._physRayStart.set(x, 2000, z);
      rc.set(appCtx._physRayStart, appCtx._physRayDir);
      const hits = rc.intersectObject(planetarySurface, false);
      if (hits.length > 0 && Number.isFinite(hits[0]?.point?.y)) {
        return hits[0].point.y + 10;
      }
    }
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

let pendingModeLodRefresh = null;
let pendingModeStreamingRefresh = null;

function scheduleModeWorldRefresh(mode) {
  if (pendingModeLodRefresh !== null) {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(pendingModeLodRefresh);
    else clearTimeout(pendingModeLodRefresh);
  }
  if (pendingModeStreamingRefresh !== null) clearTimeout(pendingModeStreamingRefresh);
  const run = () => {
    pendingModeLodRefresh = null;
    appCtx.updateWorldLod?.(true);
  };
  pendingModeLodRefresh = typeof requestIdleCallback === 'function'
    ? requestIdleCallback(run, { timeout: 300 })
    : setTimeout(run, 64);
  pendingModeStreamingRefresh = setTimeout(() => {
    pendingModeStreamingRefresh = null;
    appCtx.resumeEarthStreaming?.(600);
    appCtx.updateEarthWorldStreaming?.(1);
  }, mode === 'plane' || mode === 'drone' ? 450 : 180);
}

function setTravelMode(mode, options = {}) {
  const targetMode = mode === 'walk' || mode === 'drone' || mode === 'boat' || mode === 'plane' ? mode : 'drive';
  const currentMode = getCurrentTravelMode();

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
    if (typeof appCtx.canExitBoatMode === 'function' && !appCtx.canExitBoatMode(targetMode, { showNotice: true })) {
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

  const settlingAerialTransition = targetMode !== currentMode && (
    targetMode === 'plane' || targetMode === 'drone' || currentMode === 'plane' || currentMode === 'drone'
  );
  if (settlingAerialTransition) appCtx.pauseEarthStreaming?.('travel_mode_transition');

  let planeExitState = null;
  if (targetMode !== 'plane' && appCtx.planeMode?.active) {
    planeExitState = appCtx.stopPlaneMode?.({ targetMode }) || null;
  }

  if (targetMode === 'plane') {
    if (appCtx.onMoon || appCtx.onMars || !appCtx.startPlaneMode?.(options)) {
      if (settlingAerialTransition) appCtx.resumeEarthStreaming?.(600);
      return syncTravelModeButtons();
    }
    setDroneModeActive(false);
    if (appCtx.Walk?.state?.mode === 'walk') appCtx.Walk.setModeDrive();
    if (appCtx.Walk?.state?.characterMesh) appCtx.Walk.state.characterMesh.visible = false;
    if (appCtx.carMesh) appCtx.carMesh.visible = false;
  } else if (targetMode === 'walk') {
    setDroneModeActive(false);
    if (appCtx.Walk && appCtx.Walk.state?.mode !== 'walk') {
      appCtx.Walk.setModeWalk({
        preserveResolvedSpawn: !!planeExitState,
        preserveResolvedSurface: planeExitState?.landedOnRoof === true,
        deferWorldSync: !!planeExitState
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
        entryMode: options.entryMode || undefined
      });
      if (!started) {
        return syncTravelModeButtons();
      }
    } else {
      return syncTravelModeButtons();
    }
  } else {
    setDroneModeActive(false);
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
  scheduleModeWorldRefresh(resolvedMode);
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
  const nextMode = currentMode === 'drive' ? 'walk' : currentMode === 'walk' ? 'drone' : currentMode === 'drone' ? 'plane' : 'drive';
  return setTravelMode(nextMode, options);
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
