import {resolveControlState} from './transport/control-state.js';
import {activeActorPose} from './transport/actor-contract.js?v=6';
import { ctx as appCtx } from "./shared-context.js?v=55";
import { nextPrimaryTravelMode } from "./controls/traversal-control-policy.js?v=8";
import { planetarySurfaceYAtRenderXZ } from './planetary/runtime/surface-query.js?v=3';
import {
  isPlanetarySurfaceActive,
  resolvePlanetaryTravelCapabilities
} from './planetary/traversal-capabilities.js?v=1';
import { resolveTravelMenuState } from './travel/menu-state.js?v=2';
import { captureEnvironmentSession } from './session-coordinator.js?v=2';
import {queryPlanetaryObstacle} from './planetary/runtime/obstacle-authority.js?v=1';
import {isWorldLoadRequestActive} from './earth-core/world-load-request.js?v=1';
import { usesContainedInteriorPhysics } from './interiors/physics-scope.js';

let lastTravelUiSignature = '';

function getCurrentTravelMode() { return resolveControlState(appCtx).mode; }

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
  const planetaryCapabilities = resolvePlanetaryTravelCapabilities(appCtx);
  const currentEnvironment = appCtx.getEnv?.()
    || (appCtx.oceanMode?.active ? appCtx.ENV?.OCEAN : appCtx.ENV?.EARTH);
  const setAvailable = (button, available) => {
    if (!button) return;
    const hidden = available !== true;
    if (button.hidden !== hidden) button.hidden = hidden;
    const display = hidden ? 'none' : '';
    if (button.style.display !== display) button.style.display = display;
  };
  const supports = (mode) => !planetaryCapabilities || planetaryCapabilities[mode] === true;
  const oceanBtn = document.getElementById('fOceanMode');
  const earthBtn = document.getElementById('fEarthMode');
  const menuState = resolveTravelMenuState({
    environment: currentEnvironment,
    earthEnvironment: appCtx.ENV?.EARTH,
    moonEnvironment: appCtx.ENV?.MOON,
    marsEnvironment: appCtx.ENV?.MARS,
    pathfinderStaged: appCtx.getStagedEarthPodSnapshot?.().active === true,
    supports
  });
  const availability = {
    drive: supports('drive'),
    walk: supports('walk'),
    drone: supports('drone'),
    plane: supports('plane'),
    // Boat visibility is contextual. The boat runtime owns whether a nearby
    // vessel, an active vessel, or the ocean-to-surface transfer is available.
    // Treating every Earth location as boat-ready made the hotbar advertise a
    // mode that could silently do nothing inland.
    boat: supports('boat') && !!(appCtx.boatMode?.active || appCtx.boatMode?.available || appCtx.oceanMode?.active)
  };
  const signature = JSON.stringify({
    activeMode,
    environment: currentEnvironment,
    activePlanetaryBodyId: appCtx.activePlanetaryBodyId || '',
    availability,
    menuState
  });
  if (signature === lastTravelUiSignature) return activeMode;
  lastTravelUiSignature = signature;

  if (drivingBtn) drivingBtn.classList.toggle('on', activeMode === 'drive');
  if (walkingBtn) walkingBtn.classList.toggle('on', activeMode === 'walk');
  if (droneBtn) droneBtn.classList.toggle('on', activeMode === 'drone');
  if (planeBtn) planeBtn.classList.toggle('on', activeMode === 'plane');
  if (boatBtn) boatBtn.classList.toggle('on', activeMode === 'boat');
  setAvailable(drivingBtn, availability.drive);
  setAvailable(walkingBtn, availability.walk);
  setAvailable(droneBtn, availability.drone);
  setAvailable(planeBtn, availability.plane);
  setAvailable(boatBtn, availability.boat);

  // Environment choices have one owner and are published only when their
  // underlying state changes. The HUD frame loop must never rewrite menus.
  if (oceanBtn) {
    oceanBtn.classList.remove('on');
    oceanBtn.textContent = activeMode === 'boat' ? '🌊 Dive Underwater' : '🌊 Explore the Ocean';
  }
  if (earthBtn) {
    earthBtn.classList.remove('on');
    earthBtn.textContent = '🌍 Return to Earth';
  }
  setAvailable(oceanBtn, menuState.ocean.visible);
  setAvailable(earthBtn, menuState.earth.visible);

  const applyAction = (id, state) => {
    const button = document.getElementById(id);
    setAvailable(button, state.visible);
    if (button && button.textContent !== state.label) button.textContent = state.label;
  };
  applyAction('fDeployPathfinder', menuState.pathfinder);
  applyAction('fBoardSolisReach', menuState.boardStarship);
  applyAction('fSpaceRocket', menuState.freeSpaceFlight);
  applyAction('fSpaceDirect', menuState.quickTrip);
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
  if (isPlanetarySurfaceActive(appCtx)) {
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

function prepareDronePosition(options = {}) {
  const ref = options.reference || (appCtx.Walk?.getMapRefPosition ?
    appCtx.Walk.getMapRefPosition(false, null) :
    {
      x: Number.isFinite(appCtx.car?.x) ? appCtx.car.x : 0,
      z: Number.isFinite(appCtx.car?.z) ? appCtx.car.z : 0
    });

  if (!appCtx.drone || !Number.isFinite(ref?.x) || !Number.isFinite(ref?.z)) return null;
  const safeLaunchY = sampleDroneSpawnHeight(ref.x, ref.z);
  return {
    x: ref.x, z: ref.z,
    y: options.preserveAltitude && Number.isFinite(ref.y) ? Math.max(safeLaunchY, ref.y) : safeLaunchY,
    yaw: Number.isFinite(ref.yaw) ? ref.yaw : Number.isFinite(ref.angle) ? ref.angle : Number(appCtx.car?.angle) || 0,
    pitch: Number.isFinite(ref.pitch) ? ref.pitch : isPlanetarySurfaceActive(appCtx) ? -0.2 : -0.3,
    roll: options.restoreOrientation && Number.isFinite(ref.roll) ? ref.roll : 0,
    cameraYawOffset: 0, cameraPitchOffset: 0, cameraLookTimer: 0
  };
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

  if (isPlanetarySurfaceActive(appCtx)) {
    const groundY = planetarySurfaceYAtRenderXZ(appCtx, reference.x, reference.z);
    if (!Number.isFinite(groundY)) return false;
    const angle = Number(reference.angle) || 0;
    if (appCtx.car) {
      Object.assign(appCtx.car, { x: reference.x, y: groundY + 1.2, z: reference.z, angle, speed: 0, vy: 0 });
    }
    const walker = appCtx.Walk?.state?.walker;
    if (walker) Object.assign(walker, { x: reference.x, y: groundY + 1.7, z: reference.z, angle, vy: 0 });
    return true;
  }

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

function transitionTravelMode(mode, options = {}, dronePose = null, restoration = null) {
  const rejected = () => ({mode: getCurrentTravelMode(), applied: false});
  if (!['walk', 'drive', 'drone', 'boat', 'plane'].includes(mode)) return rejected();
  const targetMode = mode;
  const currentMode = getCurrentTravelMode();
  const planetaryCapabilities = resolvePlanetaryTravelCapabilities(appCtx);
  if (planetaryCapabilities && planetaryCapabilities[targetMode] !== true) {
    syncTravelModeButtons();
    return rejected();
  }
  let modeReference = captureActiveModeReference(currentMode);

  if (targetMode === 'boat' && appCtx.oceanMode?.active && typeof appCtx.transferSubmarineToBoat === 'function') {
    void appCtx.transferSubmarineToBoat({
      source: options.source || 'runtime',
      emitTutorial: options.emitTutorial !== false
    });
    syncTravelModeButtons();
    return rejected();
  }

  // Dedicated environments own their controllers until their explicit exit.
  if (resolveControlState(appCtx).frame !== 'surface') return rejected();
  const session = captureEnvironmentSession();
  if (targetMode === 'boat' && appCtx.boatSwimming?.active) {
    appCtx.startBoatMode?.(options);
    return {mode: syncTravelModeButtons(), applied: getCurrentTravelMode() === targetMode};
  }
  if (targetMode !== 'boat' && appCtx.boatMode?.active) {
    if (options.force !== true && typeof appCtx.canExitBoatMode === 'function' && !appCtx.canExitBoatMode(targetMode, {
      showNotice: true,
      source: options.source || 'runtime_switch'
    })) {
      const resolvedMode = syncTravelModeButtons();
      if (typeof appCtx.updateControlsModeUI === 'function') {
        appCtx.updateControlsModeUI();
      }
      return {mode: resolvedMode, applied: false};
    }
  }
  // Admission and required visual preparation happen before releasing a live
  // controller. A denied boat/plane start must leave the current actor intact.
  let prepared = null;
  let groundSpawn = null;
  try {
    if (restoration && (targetMode !== 'walk' || restoration.pose.x !== undefined) && appCtx.activeInterior && typeof appCtx.clearActiveInterior !== 'function') return rejected();
    if (targetMode === 'boat' && currentMode !== 'boat') {
      prepared = appCtx.prepareBoatMode?.(options);
      if (!prepared) return {mode: syncTravelModeButtons(), applied: false};
    } else if (targetMode === 'plane') {
      prepared = appCtx.preparePlaneMode?.(options);
      if (!prepared) return {mode: syncTravelModeButtons(), applied: false};
    }
    if (restoration?.pose.x !== undefined && (targetMode === 'walk' || targetMode === 'drive')) {
      if (typeof appCtx.resolveSafeWorldSpawn !== 'function' || typeof appCtx.applyResolvedWorldSpawn !== 'function') return rejected();
      const pose = restoration.pose;
      const preferredRoad = restoration.roadId ? (appCtx.roads || []).find(road =>
        String(road.sourceFeatureId || road.transportRecord?.identity || road.id || '') === restoration.roadId) || null : null;
      groundSpawn = restoration.resolveGroundSpawn ? restoration.resolveGroundSpawn() : appCtx.resolveSafeWorldSpawn(pose.x, pose.z, {
        mode: targetMode, angle: pose.yaw ?? modeReference?.angle ?? appCtx.car?.angle ?? 0,
        feetY: pose.y === undefined ? undefined : pose.y - (targetMode === 'walk' ? 1.7 : 1.2),
        preserveElevatedSurface: targetMode === 'walk' && pose.y !== undefined,
        preferRoad: targetMode === 'drive', preferredRoad,
        restorePose: targetMode === 'walk', source: targetMode === 'walk' ? 'shared_walk_pose' : 'shared_drive_pose',
        ...restoration.spawnOptions
      });
      if (groundSpawn?.valid !== true || !['x','z','walkY','carY','angle'].every(key => Number.isFinite(groundSpawn[key]))) return rejected();
      if (Number.isFinite(restoration.maxDistance) && Math.hypot(groundSpawn.x - pose.x, groundSpawn.z - pose.z) > restoration.maxDistance) return rejected();
      if (Number.isFinite(restoration.expectedFeetY) && Math.abs((targetMode === 'walk' ? groundSpawn.walkY - 1.7 : groundSpawn.carY - 1.2) - restoration.expectedFeetY) > 1.2) return rejected();
    }
  } catch (error) {
    if (restoration) return rejected();
    throw error;
  }

  // Stage the entire drone pose before releasing controls. In particular, an
  // interior's local walker coordinates must never become an outdoor launch.
  let droneEntry = null;
  if (targetMode === 'drone') {
    if (appCtx.activeInterior && typeof appCtx.clearActiveInterior !== 'function') return rejected();
    try {
      const planeReference = currentMode === 'plane' ? {
        x: appCtx.planeMode.x, y: appCtx.planeMode.y, z: appCtx.planeMode.z,
        yaw: appCtx.planeMode.yaw, pitch: appCtx.planeMode.pitch
      } : null;
      droneEntry = prepareDronePosition({
        reference: dronePose || appCtx.activeInterior?.outsideState || planeReference || modeReference || undefined,
        preserveAltitude: !!dronePose || currentMode === 'plane',
        restoreOrientation: !!dronePose
      });
    } catch (error) {
      if (dronePose) return rejected();
      throw error;
    }
  }
  if (!session.isCurrent() || (targetMode === 'drone' && !droneEntry)) return rejected();

  if ((targetMode !== 'walk' || groundSpawn) && appCtx.activeInterior && typeof appCtx.clearActiveInterior === 'function') {
    appCtx.clearActiveInterior({ restorePlayer: true, preserveCache: true });
    modeReference = captureActiveModeReference(currentMode);
  }

  if (targetMode !== 'boat' && appCtx.boatMode?.active && typeof appCtx.stopBoatMode === 'function') {
    if (targetMode !== currentMode) clearControllerLocalState(targetMode);
    appCtx.stopBoatMode({
      targetMode,
      source: options.source || 'runtime_switch'
    });
  }

  if (targetMode !== currentMode && currentMode !== 'boat') clearControllerLocalState(targetMode);
  let planeExitState = null;
  if (targetMode !== 'plane' && appCtx.planeMode?.active) {
    planeExitState = appCtx.stopPlaneMode?.({ targetMode }) || null;
  }

  if (targetMode === 'plane') {
    if (isPlanetarySurfaceActive(appCtx) || !appCtx.startPlaneMode?.(options, prepared)) {
      return {mode: syncTravelModeButtons(), applied: false};
    }
    setDroneModeActive(false);
    if (appCtx.Walk?.state?.mode === 'walk') appCtx.Walk.setModeDrive();
    if (appCtx.Walk?.state?.characterMesh) appCtx.Walk.state.characterMesh.visible = false;
    if (appCtx.carMesh) appCtx.carMesh.visible = false;
  } else if (targetMode === 'walk') {
    setDroneModeActive(false);
    const preservedCurrentPosition = !!groundSpawn || handoffAirPositionToGround(modeReference, 'walk');
    if (appCtx.Walk && appCtx.Walk.state?.mode !== 'walk') {
      appCtx.Walk.setModeWalk({
        preserveResolvedSpawn: !!planeExitState || preservedCurrentPosition,
        preserveResolvedSurface: !!groundSpawn || planeExitState?.landedOnRoof === true,
        deferWorldSync: !!planeExitState || preservedCurrentPosition
      });
    }
    if (appCtx.Walk?.state?.characterMesh) appCtx.Walk.state.characterMesh.visible = true;
    if (appCtx.carMesh) appCtx.carMesh.visible = false;
  } else if (targetMode === 'drone') {
    if (appCtx.Walk?.state?.mode === 'walk') {
      appCtx.Walk.setModeDrive();
    }
    Object.assign(appCtx.drone, droneEntry);
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
        surfaceArrival: options.surfaceArrival || undefined,
        entryMode: options.entryMode || undefined,
        transportEntityId: options.transportEntityId || undefined,
        transportCatalogId: options.transportCatalogId || undefined,
        condition: Number.isFinite(options.condition) ? options.condition : undefined
      }, prepared);
      if (!started) {
        return {mode: syncTravelModeButtons(), applied: false};
      }
    } else {
      return {mode: syncTravelModeButtons(), applied: false};
    }
  } else {
    setDroneModeActive(false);
    const preservedCurrentPosition = !!groundSpawn || handoffAirPositionToGround(modeReference, 'drive');
    if (appCtx.Walk?.state?.mode === 'walk') {
      appCtx.Walk.setModeDrive({ preserveResolvedSpawn: preservedCurrentPosition });
    }
    appCtx.setCameraMode(0);
    if (appCtx.camera?.userData) appCtx.camera.userData.carLook = { yaw: 0, pitch: 0 };
    if (appCtx.carMesh) appCtx.carMesh.visible = true;
    void appCtx.ensureCuratedPlayerCar?.();
  }

  // Publish the admitted ground pose after controller retirement, before UI or
  // tutorial readers can observe it. The spawn owner also updates meshes/contact.
  if (groundSpawn) appCtx.applyResolvedWorldSpawn(groundSpawn, {mode: targetMode, syncCar: true, syncWalker: true});
  else if (restoration && Number.isFinite(restoration.pose.yaw) && (targetMode === 'walk' || targetMode === 'drive')) {
    const yaw = restoration.pose.yaw;
    if (targetMode === 'walk') {
      Object.assign(appCtx.Walk.state.walker, {yaw, angle: yaw});
      if (appCtx.Walk.state.characterMesh) appCtx.Walk.state.characterMesh.rotation.y = yaw;
    } else {
      appCtx.car.angle = yaw;
      if (appCtx.carMesh) appCtx.carMesh.rotation.y = yaw;
    }
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

  return {mode: resolvedMode, applied: resolvedMode === targetMode};
}

function setTravelMode(mode, options = {}) {
  return transitionTravelMode(mode, options).mode;
}

// Explicit geographic placement is a drone command, not an unrestricted actor
// setter. Do not forward force: vessel exits and dedicated frames keep admission.
function activateDroneAtWorldPose(pose, options = {}) {
  if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.z) || appCtx.worldLoading) return false;
  const requested = {x: pose.x, z: pose.z};
  for (const key of ['y', 'yaw', 'pitch', 'roll']) {
    if (pose[key] === undefined) continue;
    if (!Number.isFinite(pose[key])) return false;
    requested[key] = pose[key];
  }
  return transitionTravelMode('drone', {
    source: options.source || 'runtime', emitTutorial: options.emitTutorial !== false
  }, requested).applied;
}

// Restore only the supported surface controllers, through their own admission
// policies. A mode-only request carries no geographic position authority.
function requestSurfaceTravelPose(mode, pose = {}, options = {}, admission = {}) {
  if (!['walk','drive','boat','plane'].includes(mode) || !pose || typeof pose !== 'object' || appCtx.worldLoading || resolveControlState(appCtx).frame !== 'surface') return false;
  const requested = {};
  for (const key of ['x','z','y','yaw','pitch']) {
    if (pose[key] === undefined) continue;
    if (!Number.isFinite(pose[key])) return false;
    requested[key] = pose[key];
  }
  const hasPosition = requested.x !== undefined || requested.z !== undefined;
  if (hasPosition && (requested.x === undefined || requested.z === undefined)) return false;
  // An authored room's queries intentionally exclude the geographic world.
  // Leave it through its normal exit before requesting an exterior arrival.
  if (hasPosition && usesContainedInteriorPhysics(appCtx.activeInterior)) return false;
  if ((mode === 'walk' && !appCtx.Walk?.state?.walker) || (mode === 'drive' && !appCtx.car)) return false;
  const modeOptions = {source: options.source || 'shared_state', emitTutorial: options.emitTutorial !== false};
  if (mode === 'boat') Object.assign(modeOptions,admission.boatOptions,{yaw:requested.yaw});
  if (mode === 'boat' && (hasPosition || (appCtx.boatMode?.active && requested.yaw !== undefined))) {
    if (appCtx.boatDeck?.active || appCtx.boatSwimming?.active) return false;
    if (appCtx.boatMode?.active) return appCtx.enterBoatAtWorldPoint?.(requested.x ?? appCtx.boat?.x, requested.z ?? appCtx.boat?.z,
      {...modeOptions, yaw: requested.yaw, candidate: admission.boatCandidate}) === true;
    const session = captureEnvironmentSession();
    let candidate;
    try { candidate = admission.boatCandidate || appCtx.inspectBoatCandidate?.(requested.x, requested.z); }
    catch { return false; }
    if (!candidate || !session.isCurrent()) return false;
    Object.assign(modeOptions, {spawnX: requested.x, spawnZ: requested.z, yaw: requested.yaw, candidate, entryMode: admission.entryMode});
  }
  if (mode === 'plane') Object.assign(modeOptions, admission.planeOptions, requested);
  return transitionTravelMode(mode, modeOptions, null, {pose: requested, roadId: options.roadId, ...admission}).applied;
}

function restoreSurfaceTravelPose(mode, pose = {}, options = {}) {
  return requestSurfaceTravelPose(mode, pose, options);
}

// Activity anchors describe feet/surface height. Fresh entry must remain near
// that start and prove elevated support, rather than inheriting save margins.
function activateSurfaceActivity(mode, start, options = {}) {
  if (!['walk','drive','boat'].includes(mode) || !start || ![start.x,start.y,start.z].every(Number.isFinite)) return false;
  const maxDistance = Number.isFinite(options.maxDistance) && options.maxDistance >= 0 ? options.maxDistance : 12;
  return requestSurfaceTravelPose(mode, {
    x: start.x, y: start.y + (mode === 'walk' ? 1.7 : 1.2), z: start.z,
    yaw: Number.isFinite(start.yaw) ? start.yaw : 0
  }, {source: 'activity_runtime'}, {
    maxDistance, expectedFeetY: start.y,
    spawnOptions: {source: 'activity_runtime', restorePose: false, preferRoad: false,
      preserveElevatedSurface: mode === 'walk', allowBuildingRoof: mode === 'walk',
      requireVerifiedElevatedSurface: true, requireSafeCandidate: true, maxGroundRadius: Math.min(maxDistance,48),
      maxRoadDistance: maxDistance, fastLocalFallback: true}
  });
}

// A planetary arrival is sampled from the active accepted body, never Earth
// road queries or a caller-supplied altitude. Dedicated/contained frames retain
// their own exit, and unavailable or obstructed ground cannot publish a pose.
function initializePlanetaryArrival(bodyId,point,options={}) {
  const actual=appCtx.onMoon?'moon':appCtx.onMars?'mars':appCtx.activePlanetaryBodyId;
  if(!bodyId||bodyId!==actual||!point||![point.x,point.z].every(Number.isFinite)||
    (point.angle!==undefined&&!Number.isFinite(point.angle))||appCtx.worldLoading||resolveControlState(appCtx).frame!=='surface'||usesContainedInteriorPhysics(appCtx.activeInterior))return false;
  const mode=options.mode||'drive';
  if(!['walk','drive'].includes(mode)||resolvePlanetaryTravelCapabilities(appCtx)?.[mode]!==true)return false;
  const session=captureEnvironmentSession();
  let ground;
  try { ground=planetarySurfaceYAtRenderXZ(appCtx,point.x,point.z,{bodyId}); } catch { return false; }
  if(!Number.isFinite(ground)||queryPlanetaryObstacle(point.x,point.z,mode==='walk'?.35:1.5,bodyId,{minY:ground,maxY:ground+2})||!session.isCurrent())return false;
  const angle=point.angle??0;
  const spawn={valid:true,mode,x:point.x,z:point.z,angle,walkY:ground+1.7,carY:ground+1.2,terrainY:ground,onRoad:false,road:null};
  const applied=transitionTravelMode(mode,{source:options.source||'planetary_arrival',emitTutorial:false},null,
    {pose:{x:point.x,z:point.z,yaw:angle},resolveGroundSpawn:()=>spawn}).applied;
  if(!session.isCurrent())return false;
  if(applied&&appCtx.drone)Object.assign(appCtx.drone,{x:point.x,y:ground+(bodyId==='moon'?10:12),z:point.z,yaw:angle,
    pitch:bodyId==='mars'?-.24:-.2,roll:0,vx:0,vy:0,vz:0,cameraYawOffset:0,cameraPitchOffset:0,cameraLookTimer:0});
  return applied;
}

// World replacement owns a loading-only reset. A stale request or an isolated
// environment cannot reset the live surface proxies.
function initializeWorldLoadActors(request) {
  if(!appCtx.worldLoading||appCtx.getEnv?.()!==appCtx.ENV.EARTH||resolveControlState(appCtx).frame!=='surface'||
    !isWorldLoadRequestActive(request,{activeSequence:appCtx._worldLoadSequence,activeLocation:appCtx.LOC}))return false;
  const session=captureEnvironmentSession();
  transitionTravelMode('walk',{source:'location_load',force:true,emitTutorial:false});
  if(!session.isCurrent())return false;
  Object.assign(appCtx.car,{x:0,z:0,vx:0,vy:0,vz:0,speed:0});
  if(appCtx.drone)Object.assign(appCtx.drone,{x:0,z:0,vx:0,vy:0,vz:0});
  if(appCtx.Walk?.state?.walker)Object.assign(appCtx.Walk.state.walker,{x:0,z:0,vx:0,vy:0,vz:0,_resolvedGroundState:null,_walkSupportFeature:null});
  appCtx.clearControlInputState?.('world-load-reset');
  return true;
}

// Explicit ground recovery prepares through the spawn owner before retiring
// flight/interior controls. It carries no forced vessel-exit authority.
function recoverSurfaceTravel(options = {}) {
  if (!options || typeof options !== 'object' || ['x','z'].some(key => options[key] !== undefined && !Number.isFinite(options[key]))) return false;
  const control = resolveControlState(appCtx);
  if (control.frame !== 'surface' || isPlanetarySurfaceActive(appCtx) || appCtx.worldLoading ||
      typeof appCtx.resolveRoadSpawn !== 'function') return false;
  const mode = control.mode === 'drive' ? 'drive' : 'walk';
  const reference = activeActorPose(appCtx);
  const x = options.x ?? 0, z = options.z ?? 0;
  return requestSurfaceTravelPose(mode,{x,z,yaw:reference.yaw},{source:options.source || 'safe_ground_recovery'},
    {resolveGroundSpawn:()=>appCtx.resolveRoadSpawn({mode,x,z,angle:reference.yaw,
      random:options.random === true,requireSafeCandidate:true,source:options.source || 'safe_ground_recovery'})});
}

// Only the Earth session coordinator may request saved controller restoration.
// It has already restored the Earth frame and actor assets; transport admission
// still stages before controller retirement and never grants a forced exit.
function restoreEarthTravelSession(saved) {
  if (!appCtx.earthResumePending || appCtx.getEnv?.() !== appCtx.ENV.EARTH || !saved ||
      !['walk','drive','boat','plane','drone'].includes(saved.mode) ||
      ![saved.x,saved.z].every(Number.isFinite)) return false;
  const options = {source:'earth_resume',emitTutorial:false};
  const pose = {x:saved.x,z:saved.z,yaw:saved.angle};
  if (saved.mode === 'drone') return activateDroneAtWorldPose({...pose,
    y:saved.droneY,pitch:saved.dronePitch,roll:saved.droneRoll},options);
  if (saved.mode === 'plane') {
    const planeOptions = {allowDuringEarthResume:true,transportEntityId:saved.planeEntityId,
      transportCatalogId:saved.planeCatalogId,airborne:saved.planeAirborne === true};
    for (const [field,key] of [['speed','planeSpeed'],['throttle','planeThrottle'],['roll','planeRoll'],['condition','planeCondition']]) {
      if (saved[key] === undefined) continue;
      if (!Number.isFinite(saved[key])) return false;
      planeOptions[field] = saved[key];
    }
    return requestSurfaceTravelPose('plane',{...pose,y:saved.planeY,pitch:saved.planePitch},options,{planeOptions});
  }
  if (saved.mode === 'boat') {
    if (saved.boatCondition !== undefined && !Number.isFinite(saved.boatCondition)) return false;
    // Reuse the qualified domain's existing bounded water authority only. A
    // saved maritime mode is not permission to invent a lake on ordinary land.
    const session = captureEnvironmentSession();
    const domain = appCtx.worldLoadRuntimeState?.surfaceDomain;
    let candidate;
    try { candidate = appCtx.inspectBoatCandidate?.(saved.x,saved.z,undefined,{
      allowSynthetic:domain?.kind === 'ocean',waterKind:domain?.subtype || 'open_ocean'
    }); } catch { return false; }
    if (!candidate || !session.isCurrent() || domain?.kind === 'cryosphere') return false;
    if (appCtx.boatMode?.active && saved.boatCatalogId && saved.boatCatalogId !== appCtx.boatMode.transportCatalogId) return false;
    return requestSurfaceTravelPose('boat',pose,options,{boatCandidate:candidate,entryMode:'walk',boatOptions:{
      transportEntityId:saved.boatEntityId,transportCatalogId:saved.boatCatalogId,condition:saved.boatCondition,
      earthSessionArrival:{session,publication:appCtx.worldPublication,lat:appCtx.LOC.lat,lon:appCtx.LOC.lon}
    }});
  }
  return requestSurfaceTravelPose(saved.mode,{...pose,y:saved.y},{...options,roadId:saved.roadId},{spawnOptions:{
    source:'earth_resume',requireSafeCandidate:true,allowBuildingRoof:saved.mode === 'walk',requireVerifiedElevatedSurface:true
  }});
}

// A geographic map command belongs to the currently controlled transport.
// Only this owner selects domain-specific preparation and publication.
function travelToWorldPoint(x, z, options = {}) {
  const control = resolveControlState(appCtx);
  if (![x,z].every(Number.isFinite) || appCtx.worldLoading || control.frame !== 'surface' ||
      isPlanetarySurfaceActive(appCtx) || usesContainedInteriorPhysics(appCtx.activeInterior) ||
      appCtx.boatDeck?.active || appCtx.boatSwimming?.active) return null;
  const session = captureEnvironmentSession();
  const reference = activeActorPose(appCtx);
  if (reference.mode === 'unavailable') return null;
  const source = options.source || 'map_travel';
  const pose = {x, z, yaw: reference.yaw};
  let mode = control.mode;
  let candidate = null;
  try {
    if (mode === 'boat' || ((mode === 'walk' || mode === 'drive') && options.preferBoatIfWater === true)) {
      const domain = appCtx.worldLoadRuntimeState?.surfaceDomain;
      if (domain?.kind !== 'cryosphere') {
        // A bridge's occupied surface is above the water underneath it. Use
        // destination support, never the departing actor's height, for reachability.
        const surface = mode === 'walk' ? appCtx.SurfaceQuery?.walkAt?.(x,z) :
          mode === 'drive' ? appCtx.SurfaceQuery?.driveAt?.(x,z) : null;
        const supported = surface?.feature && surface.kind !== 'terrain';
        candidate = appCtx.inspectBoatCandidate?.(x,z,undefined,{
          referenceY: supported ? surface.position?.y : undefined,
          allowSynthetic: domain?.kind === 'ocean' && !supported, waterKind: domain?.subtype || 'open_ocean'
        }) || null;
      }
    }
  } catch { return null; }
  if (!session.isCurrent() || (mode === 'boat' && !candidate)) return null;
  let applied = false;
  if (candidate) {
    applied = requestSurfaceTravelPose('boat',pose,{source},{boatCandidate:candidate,entryMode:mode});
    mode = 'boat';
  } else if (mode === 'drone') {
    applied = activateDroneAtWorldPose({...pose,y:reference.y,pitch:appCtx.drone.pitch,roll:appCtx.drone.roll},{source});
  } else if (mode === 'plane') {
    const plane = appCtx.planeMode;
    applied = requestSurfaceTravelPose('plane',{...pose,y:reference.y,pitch:plane.pitch},{source},{planeOptions:{
      transportEntityId:plane.transportEntityId,transportCatalogId:plane.transportCatalogId,
      condition:plane.condition,speed:plane.speed,throttle:plane.throttle,roll:plane.roll,airborne:plane.airborne
    }});
  } else {
    applied = requestSurfaceTravelPose(mode,pose,{source},{spawnOptions:{
      source,restorePose:false,preserveElevatedSurface:false,requireSafeCandidate:true,
      maxGroundRadius:96,maxRoadDistance:mode === 'drive' ? 220 : 160,fastLocalFallback:true
    }});
  }
  if (!applied) return null;
  const arrival = activeActorPose(appCtx);
  const ground = mode === 'walk' || mode === 'drive';
  return {valid:true,mode,x:arrival.x,y:arrival.y,z:arrival.z,angle:arrival.yaw,
    onRoad:ground && !!appCtx.car?.onRoad,road:ground ? appCtx.car?.road : null,
    walkY:ground ? appCtx.Walk?.state?.walker?.y : undefined,
    carY:ground ? appCtx.car?.y : undefined,source};
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
  initializePlanetaryArrival,
  initializeWorldLoadActors,
  recoverSurfaceTravel,
  restoreEarthTravelSession,
  travelToWorldPoint,
  activateSurfaceActivity,
  activateDroneAtWorldPose,
  restoreSurfaceTravelPose,
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
  initializePlanetaryArrival,
  initializeWorldLoadActors,
  recoverSurfaceTravel,
  restoreEarthTravelSession,
  travelToWorldPoint,
  activateSurfaceActivity,
  activateDroneAtWorldPose,
  restoreSurfaceTravelPose,
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
