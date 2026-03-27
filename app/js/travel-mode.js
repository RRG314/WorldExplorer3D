import { ctx as appCtx } from "./shared-context.js?v=55";

function getCurrentTravelMode() {
  if (appCtx.boatMode?.active) return 'boat';
  if (appCtx.droneMode) return 'drone';
  if (appCtx.Walk?.state?.mode === 'walk') return 'walk';
  return 'drive';
}

function syncTravelModeButtons() {
  const activeMode = getCurrentTravelMode();
  const drivingBtn = document.getElementById('fDriving');
  const walkingBtn = document.getElementById('fWalk');
  const droneBtn = document.getElementById('fDrone');
  const boatBtn = document.getElementById('fBoat');
  if (drivingBtn) drivingBtn.classList.toggle('on', activeMode === 'drive');
  if (walkingBtn) walkingBtn.classList.toggle('on', activeMode === 'walk');
  if (droneBtn) droneBtn.classList.toggle('on', activeMode === 'drone');
  if (boatBtn) boatBtn.classList.toggle('on', activeMode === 'boat');
  return activeMode;
}

function sampleDroneSpawnHeight(x, z) {
  if (appCtx.onMoon && appCtx.moonSurface) {
    const rc = appCtx._getPhysRaycaster?.();
    if (rc && appCtx._physRayStart && appCtx._physRayDir) {
      appCtx._physRayStart.set(x, 2000, z);
      rc.set(appCtx._physRayStart, appCtx._physRayDir);
      const hits = rc.intersectObject(appCtx.moonSurface, false);
      if (hits.length > 0 && Number.isFinite(hits[0]?.point?.y)) {
        return hits[0].point.y + 10;
      }
    }
    return 10;
  }

  const walkSurfaceY =
    appCtx.GroundHeight && typeof appCtx.GroundHeight.walkSurfaceY === 'function' ?
      appCtx.GroundHeight.walkSurfaceY(x, z) :
      null;
  if (Number.isFinite(walkSurfaceY)) return walkSurfaceY + 12;

  if (typeof appCtx.terrainMeshHeightAt === 'function') {
    const terrainY = appCtx.terrainMeshHeightAt(x, z);
    if (Number.isFinite(terrainY)) return terrainY + 12;
  }

  if (typeof appCtx.elevationWorldYAtWorldXZ === 'function') {
    const terrainY = appCtx.elevationWorldYAtWorldXZ(x, z);
    if (Number.isFinite(terrainY)) return terrainY + 12;
  }

  return 50;
}

function syncDronePositionFromReference() {
  const ref = appCtx.Walk?.getMapRefPosition ?
    appCtx.Walk.getMapRefPosition(false, null) :
    {
      x: Number.isFinite(appCtx.car?.x) ? appCtx.car.x : 0,
      z: Number.isFinite(appCtx.car?.z) ? appCtx.car.z : 0
    };

  appCtx.drone.x = ref.x;
  appCtx.drone.z = ref.z;
  appCtx.drone.yaw = Number.isFinite(appCtx.car?.angle) ? appCtx.car.angle : 0;
  appCtx.drone.roll = 0;
  appCtx.drone.y = sampleDroneSpawnHeight(ref.x, ref.z);
  appCtx.drone.pitch = appCtx.onMoon ? -0.2 : -0.3;
}

function resetModeSwitchSurfaceSync(source, x, z) {
  if (typeof appCtx.primeRoadSurfaceSyncState === 'function') {
    appCtx.primeRoadSurfaceSyncState({ clearHeightCache: false });
  }
  if (typeof appCtx.updateTerrainAround === 'function' && Number.isFinite(x) && Number.isFinite(z)) {
    appCtx.updateTerrainAround(x, z);
  }
  if (typeof appCtx.requestWorldSurfaceSync === 'function') {
    appCtx.requestWorldSurfaceSync({ force: true, source });
  }
}

function emitTravelModeEvent(mode, source = 'runtime') {
  if (typeof appCtx.tutorialOnEvent === 'function') {
    appCtx.tutorialOnEvent('mode_switched', { mode, source });
  }
}

function setTravelMode(mode, options = {}) {
  const targetMode = mode === 'walk' || mode === 'drone' || mode === 'boat' ? mode : 'drive';
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
    appCtx.stopBoatMode({
      targetMode,
      source: options.source || 'runtime_switch'
    });
  }

  if (targetMode === 'walk') {
    appCtx.droneMode = false;
    if (appCtx.Walk && appCtx.Walk.state?.mode !== 'walk') {
      appCtx.Walk.setModeWalk();
    }
    if (appCtx.Walk?.state?.characterMesh) appCtx.Walk.state.characterMesh.visible = true;
    if (appCtx.carMesh) appCtx.carMesh.visible = false;
  } else if (targetMode === 'drone') {
    if (appCtx.Walk?.state?.mode === 'walk') {
      appCtx.Walk.setModeDrive();
    }
    appCtx.droneMode = true;
    syncDronePositionFromReference();
    resetModeSwitchSurfaceSync('set_mode_drone', appCtx.drone.x, appCtx.drone.z);
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
    appCtx.droneMode = false;
    if (appCtx.Walk?.state?.mode === 'walk') {
      appCtx.Walk.setModeDrive();
    }
    if (typeof appCtx.camMode !== 'undefined') appCtx.camMode = 0;
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

function toggleBoatMode(options = {}) {
  const nextMode = getCurrentTravelMode() === 'boat' ? 'walk' : 'boat';
  return setTravelMode(nextMode, options);
}

Object.assign(appCtx, {
  getCurrentTravelMode,
  setTravelMode,
  syncTravelModeButtons,
  toggleBoatMode,
  toggleDroneMode,
  toggleWalkDriveMode
});

export {
  getCurrentTravelMode,
  setTravelMode,
  syncTravelModeButtons,
  toggleBoatMode,
  toggleDroneMode,
  toggleWalkDriveMode
};
