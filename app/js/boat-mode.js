import { ctx as appCtx } from "./shared-context.js?v=55";
import { captureEarthWorldSession } from "./earth-session.js?v=17";
import {
  DEFAULT_WAVE_INTENSITY,
  SEA_STATE_CONFIG,
  SEA_STATE_SEQUENCE,
  getSeaStateConfig,
  getWaveIntensity,
  intensityFromSeaState,
  seaStateFromIntensity
} from "./water-dynamics.js?v=9";
import {
  buildSyntheticBoatCandidate,
  findNearestBoatCandidate,
  getBoatModeSnapshot,
  getBoatWaveProfile,
  getReferencePosition,
  isPointInsideWaterFootprint,
  localizeBoatCandidate,
  measureBoatShorelineDistance,
  minimumBoatShorelineDistance,
  resolveBoatHeading,
  resolveBoatSpawnPoint,
  sampleDynamicWaterAt,
  syncWaterMeshCache,
  waterKindLabel,
  waterSurfaceYAt
} from "./boat-mode/water-query.js?v=19";
import {
  applyBoatWavePose,
  ensureBoatWaterPatch,
  resetBoatFoamFx,
  updateBoatFoamFx,
  updateBoatWaterPatch,
  updateWaterWaveVisuals
} from "./boat-mode/surface-effects.js?v=18";
import { createBoatModeMesh } from "./boat-mode/boat-model.js?v=7";
import { createBoatPromptUi } from "./boat-mode/prompt-ui.js?v=2";
import { clamp, normalizeAngle, shortestAngleDelta, stepBoatSpring } from "./boat-mode/dynamics.js?v=1";
import { createBoatRuntimeDynamics } from "./boat-mode/runtime-dynamics.js?v=12";
import { createBoatOceanTransferApi } from "./boat-mode/ocean-transfer.js?v=3";
import { createBoatModePolicy } from "./boat-mode/policy.js?v=3";
import {
  createSurfaceLayerSuppression,
  shouldSuppressOpenOceanSurfaceLayers
} from './boat-mode/surface-layer-visibility.js?v=2';
import { getMaritimeCatalogEntry } from './transport/maritime-catalog.js?v=1';
import { applyTransportDamage, transportDamagePresentation } from './transport/damage-model.js?v=1';
import { updateVesselVisual } from './transport/vessel-visual-recipe.js?v=6';

const BOAT_PROMPT_DISTANCE = 18;
const BOAT_ENTRY_OFFSET = 9;
const BOAT_MAX_CANDIDATE_DISTANCE = 58;
const BOAT_EXIT_MAX_SHORELINE_WALK = 96;
const BOAT_EXIT_MAX_SHORELINE_DRIVE = 132;
const BOAT_PROMPT_DURATION_MS = 4200;
const BOAT_WATERWAY_MIN_WIDTH = 12;
const BOAT_WATERWAY_MIN_LENGTH = 120;
const BOAT_AREA_MIN_AREA = 18000;
const BOAT_AREA_MIN_SPAN = 120;
const BOAT_EDGE_BUFFER_MIN = 1.2;


let _boatMeshReady = false;
let _boatPromptSignature = '';

const openOceanSurfaceSuppression = createSurfaceLayerSuppression(() => [
  appCtx.terrainGroup,
  appCtx.urbanSandboxRuntime?.group,
  ...(appCtx.roadMeshes || []),
  ...(appCtx.buildingMeshes || []),
  ...(appCtx.landuseMeshes || []),
  ...(appCtx.vegetationMeshes || []),
  ...(appCtx.streetFurnitureMeshes || []),
  ...(appCtx.structureVisualMeshes || []),
  ...(appCtx.poiMeshes || [])
]);

function syncOpenOceanSurfaceLayers(forceInactive = false) {
  const suppress = shouldSuppressOpenOceanSurfaceLayers({
    active: appCtx.boatMode?.active,
    forceInactive,
    waterKind: appCtx.boatMode?.waterKind,
    shorelineDistance: appCtx.boatMode?.shorelineDistance
  });
  openOceanSurfaceSuppression.setActive(suppress);
  appCtx.boatMode.openOceanSurfaceSuppression = Object.freeze({
    ...openOceanSurfaceSuppression.snapshot(),
    shorelineDistance: Number.isFinite(Number(appCtx.boatMode?.shorelineDistance))
      ? Number(appCtx.boatMode.shorelineDistance)
      : null,
    shoreVisible: !suppress
  });
}

function resetBoatDynamics() {
  appCtx.boat.speed = 0;
  appCtx.boat.turnRate = 0;
  appCtx.boat.vx = 0;
  appCtx.boat.vz = 0;
  appCtx.boat.throttle = 0;
  appCtx.boat.forwardSpeed = 0;
  appCtx.boat.lateralSpeed = 0;
  appCtx.boat.verticalVelocity = 0;
  appCtx.boat.bowLift = 0;
  appCtx.boat.heaveVelocity = 0;
  appCtx.boat.pitchVelocity = 0;
  appCtx.boat.rollVelocity = 0;
  appCtx.boat.surfaceSteepness = 0;
  appCtx.boatMode.wakeStrength = 0;
  appCtx.boatMode.wakeSpread = 0;
  appCtx.boatMode.bowWaveStrength = 0;
  appCtx.boatMode.bowSplashStrength = 0;
  appCtx.boatMode.sternFoamStrength = 0;
  appCtx.boatMode.slamStrength = 0;
}

function setBoatWaveIntensity(value, options = {}) {
  const nextValue = Number(value);
  const intensity = clamp(Number.isFinite(nextValue) ? nextValue : getWaveIntensity(), 0, 1);
  appCtx.boatMode.waveIntensity = intensity;
  appCtx.boatMode.seaState = seaStateFromIntensity(intensity);
  if (appCtx.boatMode?.active) {
    appCtx.boatMode.promptMessage = `Boat Mode Active • ${boatHudLabel()}`;
  }
  if (options.skipVisuals !== true) updateWaterWaveVisuals();
  if (options.skipUi !== true) updateBoatMenuUi();
  return intensity;
}

const {
  boatHudLabel,
  ensureBoatPromptRefs,
  getWaveSlider,
  hideBoatPrompt,
  showBoatPrompt,
  updateBoatMenuUi
} = createBoatPromptUi({ appCtx, getSeaStateConfig, getWaveIntensity, waterKindLabel });

function setBoatActorPose(x, z, angle, candidate = null, options = {}) {
  appCtx.boat.x = x;
  appCtx.boat.z = z;
  appCtx.boat.angle = angle;
  applyBoatWavePose(x, z, angle, candidate, Number(options.dt) || 0, options.forceSnap === true);
  appCtx.car.x = x;
  appCtx.car.z = z;
  appCtx.car.y = appCtx.boat.y;
  appCtx.car.angle = angle;
  appCtx.car.onRoad = false;
  appCtx.car.road = null;
}

function snapBoatChaseCamera() {
  const camera = appCtx.camera;
  if (!camera?.position?.set || !camera?.lookAt) return;
  const angle = Number.isFinite(appCtx.boat?.angle) ? appCtx.boat.angle : 0;
  const boatY = Number.isFinite(appCtx.boat?.y) ? appCtx.boat.y : 0;
  const chaseDistance = 11.4;
  camera.position.set(
    appCtx.boat.x - Math.sin(angle) * chaseDistance,
    boatY + 4.7,
    appCtx.boat.z - Math.cos(angle) * chaseDistance
  );
  camera.up?.set?.(0, 1, 0);
  camera.lookAt(
    appCtx.boat.x + Math.sin(angle) * 8.5,
    boatY + 1.3,
    appCtx.boat.z + Math.cos(angle) * 8.5
  );
  if (camera.userData) camera.userData.boatrig = null;
}

function isTouchClient() {
  return globalThis.matchMedia?.('(pointer: coarse)')?.matches === true || Number(globalThis.navigator?.maxTouchPoints || 0) > 0;
}

function disposeBoatMesh() {
  const mesh = appCtx.boatMode?.mesh;
  if (!mesh) return;
  if (typeof mesh.userData?.disposeVesselVisual === 'function') mesh.userData.disposeVesselVisual();
  else {
    if (mesh.parent?.remove) mesh.parent.remove(mesh);
    else mesh.removeFromParent?.();
    mesh.traverse?.((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((entryMaterial) => entryMaterial?.dispose?.());
      else object.material?.dispose?.();
    });
  }
  appCtx.boatMode.mesh = null;
  _boatMeshReady = false;
}

function createBoatMesh(catalogId = appCtx.boatMode?.transportCatalogId) {
  const catalog = getMaritimeCatalogEntry(catalogId);
  const currentId = String(appCtx.boatMode?.mesh?.userData?.transportCatalogId || '');
  if (_boatMeshReady && currentId === catalog.id) return;
  if (_boatMeshReady || appCtx.boatMode?.mesh) disposeBoatMesh();
  if (typeof THREE === 'undefined' || !appCtx.scene) return;
  const group = createBoatModeMesh(catalog, { mobile: isTouchClient(), state: 'active' });
  appCtx.scene.add(group);
  if (typeof THREE.Box3 === 'function') {
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    if (Number.isFinite(bounds.min.y)) {
      appCtx.boatMode.meshDraft = Math.max(0.36, Number(catalog.dimensions.draft) || -bounds.min.y);
    }
  }
  appCtx.boatMode.mesh = group;
  _boatMeshReady = true;
}

function updateBoatMesh() {
  if (!_boatMeshReady) createBoatMesh();
  const mesh = appCtx.boatMode?.mesh;
  if (!mesh) return;
  mesh.visible = !!appCtx.boatMode?.active;
  if (!mesh.visible) return;
  mesh.position.set(appCtx.boat.x, appCtx.boat.y, appCtx.boat.z);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = appCtx.boat.angle;
  mesh.rotation.x = appCtx.boat.pitch;
  mesh.rotation.z = appCtx.boat.roll;
  updateVesselVisual({ root: mesh }, Number(appCtx.boatMode.condition ?? 1));
}

function applyBoatImpact(impactSpeed, options = {}) {
  const now = performance.now();
  if (now - Number(appCtx.boatMode.lastImpactAt || 0) < 900) return null;
  const catalog = options.catalog || getMaritimeCatalogEntry(appCtx.boatMode?.transportCatalogId);
  const priorBand = transportDamagePresentation(appCtx.boatMode.condition ?? 1).band;
  const damage = applyTransportDamage(appCtx.boatMode, Math.max(0, Number(impactSpeed) - 1.8) * 7.5, {
    resistance: catalog.damage.resistance,
    durabilityPolicy: catalog.damage.durabilityPolicy
  });
  appCtx.boatMode.lastImpactAt = now;
  appCtx.boatMode.lastDamageBand = damage.band;
  if (damage.band !== priorBand) {
    const label = transportDamagePresentation(damage.after).label.toLowerCase();
    appCtx.showToast?.(`${catalog.label} condition: ${label}.`);
  }
  return damage;
}

function updateBoatLodBias() {
  const shoreline = Number.isFinite(appCtx.boatMode?.shorelineDistance) ? appCtx.boatMode.shorelineDistance : 0;
  const waterKind = String(appCtx.boatMode?.waterKind || '').toLowerCase();
  let detailBias = 1;
  if (waterKind === 'harbor' || waterKind === 'channel') {
    if (shoreline > 420) detailBias = 0.78;
    else if (shoreline > 180) detailBias = 0.9;
  } else if (waterKind === 'lake' || waterKind === 'coastal') {
    if (shoreline > 620) detailBias = 0.58;
    else if (shoreline > 300) detailBias = 0.72;
    else if (shoreline > 140) detailBias = 0.86;
  } else if (waterKind === 'open_ocean') {
    if (shoreline > 1200) detailBias = 0.34;
    else if (shoreline > 760) detailBias = 0.44;
    else if (shoreline > 420) detailBias = 0.58;
    else if (shoreline > 180) detailBias = 0.76;
  } else if (shoreline > 420) {
    detailBias = 0.52;
  } else if (shoreline > 220) {
    detailBias = 0.68;
  } else if (shoreline > 90) {
    detailBias = 0.84;
  }
  appCtx.boatMode.detailBias = detailBias;
}

function syncBoatPromptState(force = false) {
  ensureBoatPromptRefs();
  syncWaterMeshCache();

  if (!appCtx.gameStarted || appCtx.onMoon || appCtx.travelingToMoon || appCtx.spaceFlight?.active) {
    appCtx.boatMode.available = false;
    appCtx.boatMode.candidate = null;
    _boatPromptSignature = '';
    hideBoatPrompt();
    updateBoatMenuUi();
    return null;
  }

  if (appCtx.oceanMode?.active) {
    appCtx.boatMode.available = false;
    appCtx.boatMode.candidate = null;
    updateBoatMenuUi();
    const promptSignature = 'ocean_surface_transfer';
    if (force || _boatPromptSignature !== promptSignature) {
      _boatPromptSignature = promptSignature;
      showBoatPrompt('Surface Boat Available • Press G or choose Surface Boat', 'supported', BOAT_PROMPT_DURATION_MS);
    }
    return null;
  }

  if (appCtx.boatMode?.active) {
    updateBoatMenuUi();
    const shoreline = Number.isFinite(appCtx.boatMode.shorelineDistance) ? Math.round(appCtx.boatMode.shorelineDistance) : null;
    const message =
      shoreline && shoreline < 90 ?
        `${appCtx.boatMode.vesselLabel || 'Vessel'} underway • Press G or choose Exit Vessel • ${shoreline}m to shore` :
        `${appCtx.boatMode.vesselLabel || 'Vessel'} underway • Press G or choose Exit Vessel near shore`;
    const promptSignature = `active:${message}`;
    if (force || _boatPromptSignature !== promptSignature) {
      _boatPromptSignature = promptSignature;
      showBoatPrompt(message, 'active', BOAT_PROMPT_DURATION_MS);
    }
    return appCtx.boatMode.currentWater || null;
  }

  if (appCtx.activeInterior || !appCtx.isEnv?.(appCtx.ENV.EARTH)) {
    appCtx.boatMode.available = false;
    appCtx.boatMode.candidate = null;
    _boatPromptSignature = '';
    hideBoatPrompt();
    updateBoatMenuUi();
    return null;
  }

  const ref = getReferencePosition();
  if (!ref) {
    hideBoatPrompt();
    updateBoatMenuUi();
    return null;
  }
  const candidate = findNearestBoatCandidate(ref.x, ref.z, BOAT_MAX_CANDIDATE_DISTANCE, {
    requireContainment: false,
    referenceY: ref.y,
    structureTerrainMode: ref.structureTerrainMode
  });
  appCtx.boatMode.candidate = candidate;
  appCtx.boatMode.available = !!candidate;
  if (candidate) {
    appCtx.boatMode.promptLabel = candidate.label;
    appCtx.boatMode.promptMessage = `Boat Travel Available • ${candidate.label} • Press G or choose Boat Mode`;
    const promptSignature = `candidate:${candidate.type}:${candidate.label}:${Math.round(candidate.spawnX * 2)}:${Math.round(candidate.spawnZ * 2)}`;
    if (force || _boatPromptSignature !== promptSignature) {
      _boatPromptSignature = promptSignature;
      showBoatPrompt(appCtx.boatMode.promptMessage, 'supported', BOAT_PROMPT_DURATION_MS);
    }
  } else {
    _boatPromptSignature = '';
    hideBoatPrompt();
  }
  updateBoatMenuUi();
  if (force && typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
  return candidate;
}

const boatModePolicy = createBoatModePolicy({
  appCtx,
  exitMaxShorelineDrive: BOAT_EXIT_MAX_SHORELINE_DRIVE,
  exitMaxShorelineWalk: BOAT_EXIT_MAX_SHORELINE_WALK,
  minimumBoatShorelineDistance,
  promptDurationMs: BOAT_PROMPT_DURATION_MS,
  setPromptSignature: (value) => { _boatPromptSignature = value; },
  showBoatPrompt,
  updateBoatMenuUi
});
const { canDiveBoatMode, canExitBoatMode } = boatModePolicy;

const boatOceanTransferApi = createBoatOceanTransferApi({
  appCtx,
  buildSyntheticBoatCandidate,
  canDiveBoatMode,
  captureEarthWorldSession,
  findNearestBoatCandidate,
  hideBoatPrompt,
  maxCandidateDistance: BOAT_MAX_CANDIDATE_DISTANCE,
  promptDurationMs: BOAT_PROMPT_DURATION_MS,
  resetBoatDynamics,
  resetBoatFoamFx,
  setPromptSignature: (value) => { _boatPromptSignature = value; },
  showBoatPrompt,
  startBoatMode: (options) => startBoatMode(options),
  updateBoatMenuUi,
  updateWaterWaveVisuals,
  restoreEarthSurfaceLayers: () => syncOpenOceanSurfaceLayers(true)
});
const { suspendBoatModeForOceanTransfer, transferBoatToSubmarine, transferSubmarineToBoat } = boatOceanTransferApi;

function startBoatMode(options = {}) {
  if (appCtx.boatMode?.active) return true;
  if (appCtx.oceanMode?.active || appCtx.onMoon || appCtx.travelingToMoon) return false;
  const baseRef = getReferencePosition();
  if (!baseRef) return false;
  if (baseRef.structureTerrainMode === 'subgrade') return false;
  const ref = {
    ...baseRef,
    x: Number.isFinite(options.spawnX) ? options.spawnX : baseRef.x,
    z: Number.isFinite(options.spawnZ) ? options.spawnZ : baseRef.z
  };
  const candidate =
    options.candidate ||
    appCtx.boatMode?.candidate ||
    findNearestBoatCandidate(ref.x, ref.z, BOAT_MAX_CANDIDATE_DISTANCE, {
      allowSynthetic: options.allowSynthetic === true,
      requireContainment: false,
      waterKind: options.waterKind || 'open_ocean',
      referenceY: ref.y,
      structureTerrainMode: ref.structureTerrainMode
    });
  if (!candidate) return false;

  const requestedEntryMode = options.entryMode === 'drive' ? 'drive' : options.entryMode === 'walk' ? 'walk' : null;
  appCtx.boatMode.lastEntryMode = requestedEntryMode || (ref.mode === 'drive' ? 'drive' : 'walk');
  appCtx.boatMode.entryPosition = {
    x: ref.x,
    z: ref.z,
    angle: ref.angle || 0
  };
  if (!Number.isFinite(appCtx.boatMode.waveIntensity)) {
    appCtx.boatMode.waveIntensity = intensityFromSeaState(appCtx.boatMode.seaState || 'moderate');
  }
  appCtx.boatMode.seaState = seaStateFromIntensity(getWaveIntensity());
  appCtx.setDroneModeActive(false);
  if (appCtx.Walk?.state?.mode === 'walk') appCtx.Walk.setModeDrive();
  if (appCtx.activeInterior && typeof appCtx.clearActiveInterior === 'function') {
    appCtx.clearActiveInterior({ restorePlayer: true, preserveCache: true });
  }
  if (typeof appCtx.updateInteriorInteraction === 'function') {
    appCtx.updateInteriorInteraction();
  }
  appCtx.boatMode.previousCameraMode = Number.isFinite(appCtx.camMode) ? appCtx.camMode : 0;
  appCtx.boatMode.cameraYawOffset = 0;
  appCtx.boatMode.cameraPitch = 0;
  appCtx.setCameraMode(0);
  appCtx.boatMode.active = true;
  appCtx.boatMode.available = true;
  const transferVessel = appCtx.boatMode.oceanTransferVessel || null;
  const catalog = getMaritimeCatalogEntry(options.transportCatalogId || transferVessel?.transportCatalogId);
  appCtx.boatMode.transportEntityId = String(options.transportEntityId || transferVessel?.transportEntityId || 'boat-mode:marina-runabout');
  appCtx.boatMode.transportCatalogId = catalog.id;
  appCtx.boatMode.vesselLabel = catalog.label;
  appCtx.boatMode.condition = Number.isFinite(options.condition) ? options.condition : Number.isFinite(transferVessel?.condition) ? transferVessel.condition : 1;
  appCtx.boatMode.durabilityPolicy = catalog.damage.durabilityPolicy;
  appCtx.boatMode.lastDamageBand = transportDamagePresentation(appCtx.boatMode.condition).band;

  const startAngle = Number.isFinite(options.yaw) ?
    options.yaw :
    resolveBoatHeading(candidate, Number.isFinite(ref.angle) ? ref.angle : 0);
  const spawnPoint = resolveBoatSpawnPoint(candidate, ref.x, ref.z) || {
    x: candidate.spawnX,
    z: candidate.spawnZ,
    shorelineDistance: candidate.shorelineDistance || 0
  };
  const activeCandidate = localizeBoatCandidate(candidate, spawnPoint.shorelineDistance || candidate.shorelineDistance || 0);
  appCtx.boatMode.currentWater = activeCandidate;
  appCtx.boatMode.waterKind = activeCandidate?.waterKind || candidate.waterKind;
  appCtx.boatMode.shorelineDistance = activeCandidate?.shorelineDistance || 0;
  appCtx.boatMode.offshoreDistance = activeCandidate?.shorelineDistance || 0;
  resetBoatDynamics();
  resetBoatFoamFx();
  setBoatActorPose(spawnPoint.x, spawnPoint.z, startAngle, activeCandidate, { forceSnap: true });
  createBoatMesh(catalog.id);
  updateBoatWaterPatch(activeCandidate);
  syncOpenOceanSurfaceLayers();
  updateBoatMesh();
  snapBoatChaseCamera();
  if (appCtx.carMesh) appCtx.carMesh.visible = false;
  if (appCtx.Walk?.state?.characterMesh) appCtx.Walk.state.characterMesh.visible = false;
  updateBoatLodBias();
  updateWaterWaveVisuals();
  updateBoatMenuUi();
  appCtx.boatMode.promptMessage = `Boat Mode Active • ${boatHudLabel()}`;
  syncBoatPromptState(false);
  if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
  if (typeof appCtx.clearStarSelection === 'function') appCtx.clearStarSelection();
  return true;
}

function enterBoatAtWorldPoint(worldX, worldZ, options = {}) {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return false;
  const candidate =
    options.candidate ||
    findNearestBoatCandidate(
      worldX,
      worldZ,
      Number.isFinite(options.maxDistance) ? options.maxDistance : BOAT_MAX_CANDIDATE_DISTANCE * 1.9,
      { allowSynthetic: options.allowSynthetic === true, waterKind: options.waterKind || 'open_ocean' }
    );
  if (!candidate) return false;

  if (appCtx.boatMode?.active) {
    const yaw = Number.isFinite(options.yaw) ? options.yaw : resolveBoatHeading(candidate, appCtx.boat.angle || 0);
    const spawnPoint = resolveBoatSpawnPoint(candidate, worldX, worldZ) || {
      x: candidate.spawnX,
      z: candidate.spawnZ,
      shorelineDistance: candidate.shorelineDistance || 0
    };
    const activeCandidate = localizeBoatCandidate(candidate, spawnPoint.shorelineDistance || candidate.shorelineDistance || 0);
    appCtx.boatMode.currentWater = activeCandidate;
    appCtx.boatMode.waterKind = activeCandidate?.waterKind || candidate.waterKind;
    appCtx.boatMode.shorelineDistance = activeCandidate?.shorelineDistance || 0;
    appCtx.boatMode.offshoreDistance = activeCandidate?.shorelineDistance || 0;
    resetBoatDynamics();
    resetBoatFoamFx();
    setBoatActorPose(spawnPoint.x, spawnPoint.z, yaw, activeCandidate, { forceSnap: true });
    updateBoatWaterPatch(activeCandidate);
    syncOpenOceanSurfaceLayers();
    snapBoatChaseCamera();
    updateBoatLodBias();
    updateBoatMesh();
    updateWaterWaveVisuals();
    appCtx.boatMode.promptMessage = `Boat Mode Active • ${boatHudLabel()}`;
    syncBoatPromptState(false);
    return true;
  }

  if (typeof appCtx.setTravelMode === 'function') {
    return appCtx.setTravelMode('boat', {
      source: options.source || 'water_target',
      force: true,
      emitTutorial: options.emitTutorial !== false,
      spawnX: candidate.spawnX,
      spawnZ: candidate.spawnZ,
      yaw: Number.isFinite(options.yaw) ? options.yaw : undefined,
      candidate,
      allowSynthetic: options.allowSynthetic === true,
      waterKind: options.waterKind || 'open_ocean',
      entryMode: options.entryMode || 'walk',
      transportEntityId: options.transportEntityId,
      transportCatalogId: options.transportCatalogId,
      condition: options.condition
    }) === 'boat';
  }

  return startBoatMode({
    source: options.source || 'water_target',
    spawnX: candidate.spawnX,
    spawnZ: candidate.spawnZ,
    yaw: Number.isFinite(options.yaw) ? options.yaw : undefined,
    candidate,
    allowSynthetic: options.allowSynthetic === true,
    waterKind: options.waterKind || 'open_ocean',
    entryMode: options.entryMode || 'walk',
    transportEntityId: options.transportEntityId,
    transportCatalogId: options.transportCatalogId,
    condition: options.condition
  });
}

function stopBoatMode(options = {}) {
  if (!appCtx.boatMode?.active) return false;
  if (typeof appCtx.closeFishingGame === 'function') appCtx.closeFishingGame();
  const exitMode = options.targetMode === 'drive' || appCtx.boatMode.lastEntryMode === 'drive' ? 'drive' : 'walk';
  const entry = appCtx.boatMode.entryPosition || {
    x: appCtx.boat.x,
    z: appCtx.boat.z,
    angle: appCtx.boat.angle
  };
  const currentWater = appCtx.boatMode.currentWater || appCtx.boatMode.candidate || null;
  const vesselSnapshot = {
    x: appCtx.boat.x,
    y: appCtx.boat.y,
    z: appCtx.boat.z,
    yaw: appCtx.boat.angle,
    condition: Number(appCtx.boatMode.condition ?? 1),
    transportEntityId: String(appCtx.boatMode.transportEntityId || ''),
    transportCatalogId: String(appCtx.boatMode.transportCatalogId || 'marina-runabout'),
    water: currentWater
  };
  const dockTargetX = Number.isFinite(currentWater?.entryPoint?.x) ? currentWater.entryPoint.x : entry.x;
  const dockTargetZ = Number.isFinite(currentWater?.entryPoint?.z) ? currentWater.entryPoint.z : entry.z;
  const exitModeName = exitMode === 'walk' ? 'walk' : 'drive';
  let resolvedExit = null;
  if (typeof appCtx.resolveSafeWorldSpawn === 'function') {
    resolvedExit = appCtx.resolveSafeWorldSpawn(dockTargetX, dockTargetZ, {
      mode: exitModeName,
      angle: entry.angle,
      source: 'boat_exit',
      maxRoadDistance: exitMode === 'walk' ? 140 : 260,
      maxGroundRadius: 80
    });
  }
  const nearestRoad = !resolvedExit && typeof appCtx.findNearestRoad === 'function' ? appCtx.findNearestRoad(appCtx.boat.x, appCtx.boat.z) : null;
  const exitX = resolvedExit?.x ?? nearestRoad?.pt?.x ?? entry.x;
  const exitZ = resolvedExit?.z ?? nearestRoad?.pt?.z ?? entry.z;
  const exitAngle =
    Number.isFinite(resolvedExit?.angle) ? resolvedExit.angle :
    Number.isFinite(nearestRoad?.road?.angle) ? nearestRoad.road.angle :
    entry.angle;

  appCtx.boatMode.manualExitPending = true;
  try {
    if (exitMode === 'walk' && appCtx.Walk?.state?.mode !== 'walk') {
      appCtx.Walk.setModeWalk();
    } else if (exitMode !== 'walk' && appCtx.Walk?.state?.mode === 'walk') {
      appCtx.Walk.setModeDrive();
    }
  } finally {
    appCtx.boatMode.manualExitPending = false;
  }

  appCtx.boatMode.active = false;
  syncOpenOceanSurfaceLayers(true);
  appCtx.boatMode.available = false;
  appCtx.boatMode.candidate = null;
  appCtx.boatMode.currentWater = null;
  appCtx.boatMode.shorelineDistance = 0;
  appCtx.boatMode.offshoreDistance = 0;
  appCtx.boatMode.detailBias = 1;
  appCtx.boatMode.waveDirectionX = 0;
  appCtx.boatMode.waveDirectionZ = 1;
  if (Number.isFinite(appCtx.boatMode.previousCameraMode)) {
    appCtx.setCameraMode(appCtx.boatMode.previousCameraMode);
  }
  appCtx.boatMode.previousCameraMode = null;
  appCtx.boatMode.cameraYawOffset = 0;
  appCtx.boatMode.cameraPitch = 0;
  resetBoatDynamics();
  resetBoatFoamFx();
  if (appCtx.camera?.userData) appCtx.camera.userData.boatrig = null;
  if (appCtx.camera?.up?.set) appCtx.camera.up.set(0, 1, 0);
  if (appCtx.boatMode.mesh) appCtx.boatMode.mesh.visible = false;
  if (appCtx.boatMode.waterPatch) appCtx.boatMode.waterPatch.visible = false;
  if (resolvedExit && typeof appCtx.applyResolvedWorldSpawn === 'function') {
    appCtx.applyResolvedWorldSpawn(resolvedExit, { mode: exitModeName });
  } else {
    if (exitMode === 'walk' && appCtx.Walk?.state?.walker) {
      const walker = appCtx.Walk.state.walker;
      walker.x = exitX;
      walker.z = exitZ;
      walker.y = appCtx.GroundHeight?.walkSurfaceY ? appCtx.GroundHeight.walkSurfaceY(exitX, exitZ) : appCtx.elevationWorldYAtWorldXZ(exitX, exitZ) + 1.7;
      walker.vy = 0;
      walker.angle = exitAngle;
      walker.yaw = exitAngle;
      if (appCtx.Walk.state.characterMesh) {
        appCtx.Walk.state.characterMesh.position.set(walker.x, walker.y - 1.7, walker.z);
        appCtx.Walk.state.characterMesh.rotation.y = exitAngle;
        appCtx.Walk.state.characterMesh.visible = true;
      }
    }

    appCtx.car.x = exitX;
    appCtx.car.z = exitZ;
    appCtx.car.angle = exitAngle;
    appCtx.car.speed = 0;
    appCtx.car.vx = 0;
    appCtx.car.vz = 0;
    appCtx.car.y = (appCtx.GroundHeight?.roadSurfaceY ? appCtx.GroundHeight.roadSurfaceY(exitX, exitZ) : appCtx.elevationWorldYAtWorldXZ(exitX, exitZ)) + 1.1;
    if (appCtx.carMesh) {
      appCtx.carMesh.position.set(appCtx.car.x, appCtx.car.y, appCtx.car.z);
      appCtx.carMesh.rotation.y = appCtx.car.angle;
      appCtx.carMesh.visible = exitMode !== 'walk';
    }
  }
  if (appCtx.carMesh) appCtx.carMesh.visible = exitMode !== 'walk';
  if (appCtx.Walk?.state?.characterMesh) {
    appCtx.Walk.state.characterMesh.visible = exitMode === 'walk';
  }
  updateWaterWaveVisuals();
  updateBoatMenuUi();
  hideBoatPrompt();
  if (typeof appCtx.updateInteriorInteraction === 'function') {
    appCtx.updateInteriorInteraction();
  }
  syncBoatPromptState(true);
  appCtx.onVesselTripEnded?.(vesselSnapshot);
  return true;
}

function handleBoatAction() {
  if (appCtx.oceanMode?.active) {
    void transferSubmarineToBoat({ source: 'submarine_prompt_entry' });
    return true;
  }
  if (appCtx.boatMode?.active) {
    if (typeof appCtx.setTravelMode === 'function') {
      appCtx.setTravelMode(appCtx.boatMode.lastEntryMode || 'walk', { source: 'boat_prompt_exit', force: true });
    } else {
      stopBoatMode({ targetMode: appCtx.boatMode.lastEntryMode || 'walk' });
    }
    return true;
  }
  const candidate = syncBoatPromptState(true);
  if (!candidate) return false;
  if (typeof appCtx.setTravelMode === 'function') {
    const resolved = appCtx.setTravelMode('boat', {
      source: 'boat_prompt_entry',
      force: true,
      candidate,
      spawnX: candidate.spawnX,
      spawnZ: candidate.spawnZ
    });
    return resolved === 'boat';
  } else {
    return startBoatMode({ candidate, source: 'boat_prompt_entry' });
  }
}

function cycleBoatSeaState() {
  const idx = SEA_STATE_SEQUENCE.indexOf(appCtx.boatMode?.seaState || 'moderate');
  const nextState = SEA_STATE_SEQUENCE[(idx + 1 + SEA_STATE_SEQUENCE.length) % SEA_STATE_SEQUENCE.length];
  setBoatWaveIntensity(intensityFromSeaState(nextState));
  return nextState;
}

const updateBoatMode = createBoatRuntimeDynamics({
  appCtx,
  applyBoatWavePose,
  findNearestBoatCandidate,
  getBoatWaveProfile,
  getSeaStateConfig,
  localizeBoatCandidate,
  measureBoatShorelineDistance,
  minimumBoatShorelineDistance,
  resolveBoatSpawnPoint,
  setBoatActorPose,
  updateBoatFoamFx,
  updateBoatLodBias,
  updateBoatMesh,
  updateBoatWaterPatch,
  syncOpenOceanSurfaceLayers,
  onBoatImpact: applyBoatImpact
});

function initBoatMode() {
  ensureBoatPromptRefs();
  const waveSlider = getWaveSlider();
  syncWaterMeshCache();
  ensureBoatWaterPatch();
  if (!Number.isFinite(appCtx.boatMode.waveIntensity)) {
    appCtx.boatMode.waveIntensity = DEFAULT_WAVE_INTENSITY;
    appCtx.boatMode.seaState = seaStateFromIntensity(DEFAULT_WAVE_INTENSITY);
  }
  if (waveSlider && !waveSlider.dataset.bound) {
    waveSlider.dataset.bound = 'true';
    waveSlider.value = String(Math.round(getWaveIntensity() * 100));
    waveSlider.addEventListener('input', (event) => {
      const nextValue = Number(event?.target?.value);
      if (!Number.isFinite(nextValue)) return;
      setBoatWaveIntensity(nextValue / 100, { skipUi: true });
      updateBoatMenuUi();
    });
    const blurWaveSlider = () => {
      window.requestAnimationFrame(() => {
        if (document.activeElement === waveSlider) waveSlider.blur();
      });
    };
    waveSlider.addEventListener('pointerup', blurWaveSlider);
    waveSlider.addEventListener('mouseup', blurWaveSlider);
    waveSlider.addEventListener('touchend', blurWaveSlider, { passive: true });
  }
  updateBoatMenuUi();
}

Object.assign(appCtx, {
  boatHudLabel,
  canDiveBoatMode,
  canExitBoatMode,
  cycleBoatSeaState,
  handleBoatAction,
  enterBoatAtWorldPoint,
  inspectBoatCandidate: findNearestBoatCandidate,
  getBoatModeSnapshot,
  getBoatWaveIntensity: getWaveIntensity,
  initBoatMode,
  isPointInsideWaterFootprint,
  refreshBoatAvailability: syncBoatPromptState,
  sampleDynamicWaterAt,
  setBoatWaveIntensity,
  transferBoatToSubmarine,
  transferSubmarineToBoat,
  startBoatMode,
  stopBoatMode,
  waterSurfaceYAt,
  updateBoatMode,
  updateWaterWaveVisuals,
  updateBoatMenuUi
});

export {
  boatHudLabel,
  canDiveBoatMode,
  canExitBoatMode,
  cycleBoatSeaState,
  handleBoatAction,
  enterBoatAtWorldPoint,
  findNearestBoatCandidate as inspectBoatCandidate,
  getBoatModeSnapshot,
  getWaveIntensity as getBoatWaveIntensity,
  initBoatMode,
  isPointInsideWaterFootprint,
  syncBoatPromptState as refreshBoatAvailability,
  sampleDynamicWaterAt,
  setBoatWaveIntensity,
  transferBoatToSubmarine,
  transferSubmarineToBoat,
  startBoatMode,
  stopBoatMode,
  waterSurfaceYAt,
  updateBoatMode,
  updateWaterWaveVisuals,
  updateBoatMenuUi
};
