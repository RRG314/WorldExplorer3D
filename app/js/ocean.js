import { ctx as appCtx } from "./shared-context.js?v=55";
import {
  createAuxiliaryRenderer,
  disposeThreeRenderer,
  getPrimaryWorldCanvas
} from "./engine/webgl-lifecycle.js?v=1";
import {
  createDeepOceanBackdrop as createDeepOceanBackdropAsset,
  createMarineParticles as createMarineParticlesAsset,
  createReefCluster as createReefClusterAsset,
  createSeabedMesh as createSeabedMeshAsset,
  createSubmarineMesh as createSubmarineMeshAsset,
  disposeObject3D as disposeOceanObject3D
} from "./ocean/scene-assets.js?v=1";
import {
  getRockTextureSet as getRockTextureSetAsset,
  getSeabedTextureSet as getSeabedTextureSetAsset
} from "./ocean/scene-textures.js?v=1";
import { createOceanFishLifeApi } from "./ocean/fish-life.js?v=1";
import { createOceanBathymetryApi } from "./ocean/bathymetry.js?v=1";
import { updateOceanHud as updateOceanHudView } from "./ocean/hud.js?v=2";
import {
  beginEnvironmentTransition,
  commitEnvironment,
  exitCurrentEnvironmentSync
} from './session-coordinator.js?v=2';

const OCEAN_SITE = Object.freeze({
  name: 'Coral Shelf Reserve',
  region: 'Great Barrier Reef',
  lat: -18.2861,
  lon: 147.7000
});

const OCEAN_CONSTANTS = Object.freeze({
  MAX_SPEED: 32.0,
  MAX_VERTICAL_SPEED: 7.4,
  MAX_TURN_SPEED: 1.8,
  SPEED_RESPONSE: 3.1,
  TURN_RESPONSE: 4.4,
  VERTICAL_RESPONSE: 3.4,
  DRAG: 0.94,
  MIN_CLEARANCE: 1.6,
  SURFACE_Y: -0.15,
  HARD_MIN_Y: -210,
  WORLD_RADIUS: 1200,
  SUB_SCALE: 0.86,
  FOLLOW_DISTANCE: 19,
  FOLLOW_HEIGHT: 6.6,
  LOOK_AHEAD: 13,
  LOOK_HEIGHT: 1.8,
  FOLLOW_LERP: 4.4,
  LOOK_LERP: 5.6,
  MODEL_YAW_OFFSET: 0,
  MAX_PITCH: 0.52,
  MAX_ROLL: 0.5,
  PITCH_FROM_VERTICAL: 0.09,
  ROLL_FROM_TURN: 0.3,
  BATHYMETRY_WAIT_MS: 3200
});

const oceanMode = appCtx.oceanMode && typeof appCtx.oceanMode === 'object' ? appCtx.oceanMode : {};
Object.assign(oceanMode, {
  active: false,
  scene: null,
  camera: null,
  renderer: null,
  canvas: null,
  animationId: null,
  fishEntities: [],
  fishSchools: [],
  sharkEntity: null,
  launchSite: OCEAN_SITE,
  lastFrameMs: 0,
  cameraLookTarget: null,
  seabedMesh: null,
  reefGroup: null,
  marineParticles: null,
  deepBackdrop: null,
  bathymetryReady: false,
  bathymetryBlend: 0.0,
  bathymetryCache: new Map(),
  bathymetryPromise: null,
  bathymetryTileKeys: [],
  localBathymetryGrid: null,
  localBathymetryReady: false,
  localBathymetryPromise: null,
  weatherRefreshTimer: 0,
  submarine: {
    mesh: null,
    position: new THREE.Vector3(0, -10.5, 62),
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    turnSpeed: 0,
    verticalSpeed: 0
  }
});

const oceanFrameOwnerDefinition = Object.freeze({
  id: 'ocean.mode-renderer',
  label: 'Ocean mode renderer',
  kind: 'continuous-renderer',
  exclusiveGroup: 'environment-renderer',
  getState: () => ({
    active: !!oceanMode.active && oceanMode.animationId != null && !document.hidden,
    scheduled: !!oceanMode.active && oceanMode.animationId != null,
    suspended: !!oceanMode.active && oceanMode.animationId != null && document.hidden
  })
});
appCtx.oceanMode = oceanMode;
let oceanSessionScope = null;

const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _tmpVecC = new THREE.Vector3();
const _tmpVecD = new THREE.Vector3();

const {
  clamp01,
  expApproachFactor,
  lerp,
  primeBathymetryTiles,
  primeLocalBathymetryGrid,
  sampleSeabedHeight,
  smoothstep,
  valueNoise2D
} = createOceanBathymetryApi({
  appCtx,
  bathymetryGridUrl: './data/ocean-bathymetry-great-barrier-reef.json',
  constants: OCEAN_CONSTANTS,
  oceanMode
});

const oceanSceneAssetDeps = {
  OCEAN_CONSTANTS,
  lerp,
  sampleSeabedHeight,
  smoothstep,
  valueNoise2D
};

function getSeabedTextureSet(renderer = null) {
  return getSeabedTextureSetAsset(renderer, oceanSceneAssetDeps);
}

function getRockTextureSet(renderer = null) {
  return getRockTextureSetAsset(renderer, oceanSceneAssetDeps);
}

function disposeObject3D(obj) {
  return disposeOceanObject3D(obj);
}

function createSeabedMesh(renderer = null) {
  return createSeabedMeshAsset(renderer, oceanSceneAssetDeps);
}

function createReefCluster(renderer = null) {
  return createReefClusterAsset(renderer, oceanSceneAssetDeps);
}

function createMarineParticles() {
  return createMarineParticlesAsset();
}

function createDeepOceanBackdrop() {
  return createDeepOceanBackdropAsset();
}

function createSubmarineMesh() {
  return createSubmarineMeshAsset(oceanSceneAssetDeps);
}
const { clearFishLife, initFishLife, updateFishLife } = createOceanFishLifeApi({
  oceanMode,
  disposeObject3D
});

function rebuildOceanTerrainLayers(scene = oceanMode.scene, renderer = oceanMode.renderer) {
  if (!scene) return;

  if (oceanMode.seabedMesh) {
    scene.remove(oceanMode.seabedMesh);
    disposeObject3D(oceanMode.seabedMesh);
    oceanMode.seabedMesh = null;
  }
  if (oceanMode.reefGroup) {
    scene.remove(oceanMode.reefGroup);
    disposeObject3D(oceanMode.reefGroup);
    oceanMode.reefGroup = null;
  }

  oceanMode.bathymetryCache.clear();

  const seabed = createSeabedMesh(renderer);
  const reef = createReefCluster(renderer);
  scene.add(seabed);
  scene.add(reef);

  oceanMode.seabedMesh = seabed;
  oceanMode.reefGroup = reef;
}

function createOceanScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f496e);
  scene.fog = new THREE.FogExp2(0x0b3551, 0.0032);

  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 3600);
  camera.position.set(0, -9, 44);

  const renderer = createAuxiliaryRenderer({
    canvas: oceanMode.canvas,
    pixelRatioCap: 1.5,
    size: { width: window.innerWidth, height: window.innerHeight },
    optionsList: [
      { antialias: true, alpha: false, powerPreference: 'low-power' },
      { antialias: false, alpha: false, powerPreference: 'low-power' },
      { antialias: false, alpha: false }
    ]
  });
  if (!renderer) {
    throw new Error('Ocean renderer unavailable');
  }
  if (typeof renderer.outputColorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  getSeabedTextureSet(renderer);
  getRockTextureSet(renderer);

  const ambient = new THREE.AmbientLight(0x84d9ef, 0.8);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xa8e9ff, 0x143246, 0.94);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xb8f1ff, 1.3);
  keyLight.position.set(110, 210, 40);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 560;
  keyLight.shadow.camera.left = -220;
  keyLight.shadow.camera.right = 220;
  keyLight.shadow.camera.top = 220;
  keyLight.shadow.camera.bottom = -220;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x3f9dca, 0.48);
  fillLight.position.set(-140, 120, -60);
  scene.add(fillLight);

  const backdrop = createDeepOceanBackdrop();
  scene.add(backdrop);

  const particles = createMarineParticles();
  scene.add(particles);

  const submarineMesh = createSubmarineMesh();
  scene.add(submarineMesh);

  oceanMode.scene = scene;
  oceanMode.camera = camera;
  oceanMode.renderer = renderer;
  oceanMode.cameraLookTarget = new THREE.Vector3(0, -15, 96);
  oceanMode.submarine.mesh = submarineMesh;
  oceanMode.deepBackdrop = backdrop;
  oceanMode.marineParticles = particles;
  oceanMode.ambientLight = ambient;
  oceanMode.hemiLight = hemi;
  oceanMode.keyLight = keyLight;
  oceanMode.fillLight = fillLight;

  rebuildOceanTerrainLayers(scene, renderer);
  initFishLife(scene);

  primeLocalBathymetryGrid().then((ready) => {
    if (!ready || oceanMode.scene !== scene) return;
    rebuildOceanTerrainLayers(scene, renderer);
  });

  primeBathymetryTiles().then((ready) => {
    if (!ready || oceanMode.scene !== scene) return;
    rebuildOceanTerrainLayers(scene, renderer);
  });
}

function applyOceanSkyState(state = null) {
  if (!oceanMode.scene || !oceanMode.renderer || !state) return;

  const dayFactor = Number(state.sun?.daylightFactor || 0);
  const twilightFactor = Number(state.sun?.twilightFactor || 0);
  const nightFactor = 1 - dayFactor;

  oceanMode.scene.fog.color.setHex(dayFactor > 0.35 ? 0x0b3551 : twilightFactor > 0.25 ? 0x10253c : 0x06131d);
  oceanMode.scene.fog.density = 0.0028 + nightFactor * 0.0018;
  oceanMode.renderer.toneMappingExposure = 0.82 + dayFactor * 0.24 + twilightFactor * 0.08;

  if (oceanMode.ambientLight) {
    oceanMode.ambientLight.color.setHex(dayFactor > 0.4 ? 0x84d9ef : twilightFactor > 0.2 ? 0x537ba2 : 0x1a3149);
    oceanMode.ambientLight.intensity = 0.3 + dayFactor * 0.55 + twilightFactor * 0.12;
  }
  if (oceanMode.hemiLight) {
    oceanMode.hemiLight.color.setHex(dayFactor > 0.4 ? 0xa8e9ff : twilightFactor > 0.2 ? 0x7fa9cb : 0x173149);
    oceanMode.hemiLight.groundColor.setHex(dayFactor > 0.4 ? 0x143246 : twilightFactor > 0.2 ? 0x122f42 : 0x081521);
    oceanMode.hemiLight.intensity = 0.42 + dayFactor * 0.52 + twilightFactor * 0.14;
  }
  if (oceanMode.keyLight) {
    const sun = state.sun?.direction || { x: 0.45, y: 0.8, z: 0.18 };
    oceanMode.keyLight.color.setHex(dayFactor > 0.35 ? 0xb8f1ff : twilightFactor > 0.2 ? 0xffc48a : 0x5870a2);
    oceanMode.keyLight.intensity = 0.16 + dayFactor * 1.1 + twilightFactor * 0.26;
    oceanMode.keyLight.position.set(sun.x * 210, Math.max(60, sun.y * 240), sun.z * 210);
  }
  if (oceanMode.fillLight) {
    const sun = state.sun?.direction || { x: 0.45, y: 0.8, z: 0.18 };
    oceanMode.fillLight.intensity = 0.12 + dayFactor * 0.36 + twilightFactor * 0.1;
    oceanMode.fillLight.position.set(-sun.x * 160, Math.max(40, Math.abs(sun.y) * 110), -sun.z * 160);
  }
}

function getWorldCanvas() {
  return getPrimaryWorldCanvas(appCtx);
}

function destroyOceanScene() {
  clearFishLife(oceanMode.scene);
  if (oceanMode.scene) {
    disposeObject3D(oceanMode.scene);
  }
  oceanMode.renderer = disposeThreeRenderer(oceanMode.renderer);
  oceanMode.scene = null;
  oceanMode.camera = null;
  oceanMode.cameraLookTarget = null;
  oceanMode.seabedMesh = null;
  oceanMode.reefGroup = null;
  oceanMode.marineParticles = null;
  oceanMode.deepBackdrop = null;
  oceanMode.ambientLight = null;
  oceanMode.hemiLight = null;
  oceanMode.keyLight = null;
  oceanMode.fillLight = null;
  oceanMode.submarine.mesh = null;
}

function updateOceanHud(nowSeconds = 0) {
  updateOceanHudView(appCtx, oceanMode, nowSeconds);
}

function normalizeOceanLaunchSite(site = null) {
  const lat = Number(site?.lat);
  const lon = Number(site?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    name: String(site?.name || 'Ocean Site'),
    region: String(site?.region || 'Open Water'),
    lat,
    lon
  };
}

function resetOceanLaunchSite(site = null) {
  const nextSite = normalizeOceanLaunchSite(site);
  if (!nextSite) return false;
  oceanMode.launchSite = nextSite;
  oceanMode.bathymetryCache.clear();
  oceanMode.bathymetryTileKeys = [];
  oceanMode.bathymetryPromise = null;
  oceanMode.bathymetryReady = false;
  oceanMode.bathymetryBlend = 0;
  return true;
}

function resetSubmarineAtLaunch(spawn = null) {
  const sub = oceanMode.submarine;
  sub.position.set(
    Number.isFinite(spawn?.x) ? spawn.x : 0,
    Number.isFinite(spawn?.y) ? spawn.y : -10.5,
    Number.isFinite(spawn?.z) ? spawn.z : 62
  );
  sub.yaw = Number.isFinite(spawn?.yaw) ? spawn.yaw : 0;
  sub.pitch = Number.isFinite(spawn?.pitch) ? spawn.pitch : 0;
  sub.roll = Number.isFinite(spawn?.roll) ? spawn.roll : 0;
  sub.speed = 0;
  sub.turnSpeed = 0;
  sub.verticalSpeed = 0;

  if (sub.mesh) {
    sub.mesh.position.copy(sub.position);
    sub.mesh.rotation.order = 'YXZ';
    sub.mesh.rotation.set(sub.pitch, sub.yaw + OCEAN_CONSTANTS.MODEL_YAW_OFFSET, sub.roll);
  }

  if (oceanMode.camera) {
    const sinYaw = Math.sin(sub.yaw);
    const cosYaw = Math.cos(sub.yaw);
    oceanMode.camera.position.set(
      sub.position.x - sinYaw * OCEAN_CONSTANTS.FOLLOW_DISTANCE,
      sub.position.y + OCEAN_CONSTANTS.FOLLOW_HEIGHT,
      sub.position.z - cosYaw * OCEAN_CONSTANTS.FOLLOW_DISTANCE
    );
  }
  if (oceanMode.cameraLookTarget) {
    const sinYaw = Math.sin(sub.yaw);
    const cosYaw = Math.cos(sub.yaw);
    oceanMode.cameraLookTarget.set(
      sub.position.x + sinYaw * OCEAN_CONSTANTS.LOOK_AHEAD,
      sub.position.y + OCEAN_CONSTANTS.LOOK_HEIGHT,
      sub.position.z + cosYaw * OCEAN_CONSTANTS.LOOK_AHEAD
    );
  }
}

function updateSubmarine(dt) {
  const sub = oceanMode.submarine;
  const actions = appCtx.readControlActions?.('ocean') || {};
  const forwardInput = Number(actions.move) || 0;
  const yawInput = Number(actions.turn) || 0;
  const verticalInput = Number(actions.vertical) || 0;

  const targetSpeed = forwardInput * OCEAN_CONSTANTS.MAX_SPEED;
  const speedFactor = expApproachFactor(OCEAN_CONSTANTS.SPEED_RESPONSE, dt);
  sub.speed += (targetSpeed - sub.speed) * speedFactor;
  sub.speed *= Math.pow(OCEAN_CONSTANTS.DRAG, dt * 60);

  const targetTurnSpeed = yawInput * OCEAN_CONSTANTS.MAX_TURN_SPEED;
  const turnFactor = expApproachFactor(OCEAN_CONSTANTS.TURN_RESPONSE, dt);
  sub.turnSpeed += (targetTurnSpeed - sub.turnSpeed) * turnFactor;
  sub.turnSpeed *= Math.pow(0.9, dt * 60);
  sub.yaw += sub.turnSpeed * dt;

  const targetVertical = verticalInput * OCEAN_CONSTANTS.MAX_VERTICAL_SPEED;
  const verticalFactor = expApproachFactor(OCEAN_CONSTANTS.VERTICAL_RESPONSE, dt);
  sub.verticalSpeed += (targetVertical - sub.verticalSpeed) * verticalFactor;
  sub.verticalSpeed *= Math.pow(0.9, dt * 60);

  const sinYaw = Math.sin(sub.yaw);
  const cosYaw = Math.cos(sub.yaw);
  sub.position.x += sinYaw * sub.speed * dt;
  sub.position.z += cosYaw * sub.speed * dt;
  sub.position.y += sub.verticalSpeed * dt;

  _tmpVecA.set(sub.position.x, 0, sub.position.z);
  if (_tmpVecA.length() > OCEAN_CONSTANTS.WORLD_RADIUS) {
    _tmpVecA.setLength(OCEAN_CONSTANTS.WORLD_RADIUS);
    sub.position.x = _tmpVecA.x;
    sub.position.z = _tmpVecA.z;
    sub.speed *= 0.84;
  }

  const floorY = sampleSeabedHeight(sub.position.x, sub.position.z);
  const minY = Math.max(floorY + OCEAN_CONSTANTS.MIN_CLEARANCE, OCEAN_CONSTANTS.HARD_MIN_Y);
  if (sub.position.y < minY) {
    sub.position.y = minY;
    if (sub.verticalSpeed < 0) sub.verticalSpeed = 0;
  }
  if (sub.position.y > OCEAN_CONSTANTS.SURFACE_Y) {
    sub.position.y = OCEAN_CONSTANTS.SURFACE_Y;
    if (sub.verticalSpeed > 0) sub.verticalSpeed = 0;
  }

  const targetPitch = THREE.MathUtils.clamp(-sub.verticalSpeed * OCEAN_CONSTANTS.PITCH_FROM_VERTICAL, -OCEAN_CONSTANTS.MAX_PITCH, OCEAN_CONSTANTS.MAX_PITCH);
  const targetRoll = THREE.MathUtils.clamp(-sub.turnSpeed * OCEAN_CONSTANTS.ROLL_FROM_TURN, -OCEAN_CONSTANTS.MAX_ROLL, OCEAN_CONSTANTS.MAX_ROLL);
  sub.pitch += (targetPitch - sub.pitch) * expApproachFactor(5.6, dt);
  sub.roll += (targetRoll - sub.roll) * expApproachFactor(4.5, dt);

  if (sub.mesh) {
    sub.mesh.position.copy(sub.position);
    sub.mesh.rotation.order = 'YXZ';
    sub.mesh.rotation.set(sub.pitch, sub.yaw + OCEAN_CONSTANTS.MODEL_YAW_OFFSET, sub.roll);

    const propeller = sub.mesh.userData && sub.mesh.userData.propeller;
    if (propeller) {
      propeller.rotation.z += (sub.speed * 0.36 + 0.22) * dt * 12;
    }
  }

  _tmpVecB.set(
    sub.position.x - sinYaw * OCEAN_CONSTANTS.FOLLOW_DISTANCE,
    sub.position.y + OCEAN_CONSTANTS.FOLLOW_HEIGHT,
    sub.position.z - cosYaw * OCEAN_CONSTANTS.FOLLOW_DISTANCE
  );
  oceanMode.camera.position.lerp(_tmpVecB, expApproachFactor(OCEAN_CONSTANTS.FOLLOW_LERP, dt));

  _tmpVecC.set(
    sub.position.x + sinYaw * OCEAN_CONSTANTS.LOOK_AHEAD,
    sub.position.y + OCEAN_CONSTANTS.LOOK_HEIGHT,
    sub.position.z + cosYaw * OCEAN_CONSTANTS.LOOK_AHEAD
  );
  oceanMode.cameraLookTarget.lerp(_tmpVecC, expApproachFactor(OCEAN_CONSTANTS.LOOK_LERP, dt));
  oceanMode.camera.lookAt(oceanMode.cameraLookTarget);
}

function animateOceanMode(nowMs = 0) {
  if (!oceanMode.active) return;
  oceanMode.animationId = oceanSessionScope?.animationFrame(animateOceanMode) ?? null;
  if (oceanMode.animationId == null) {
    oceanMode.active = false;
    return;
  }
  if (document.hidden) {
    oceanMode.lastFrameMs = nowMs;
    return;
  }

  if (!oceanMode.lastFrameMs) oceanMode.lastFrameMs = nowMs;
  const dt = Math.min(0.05, Math.max(0.001, (nowMs - oceanMode.lastFrameMs) / 1000));
  oceanMode.lastFrameMs = nowMs;

  updateSubmarine(dt);
  if (typeof appCtx.refreshAstronomicalSky === 'function') {
    appCtx.refreshAstronomicalSky(false);
  }
  oceanMode.weatherRefreshTimer = (oceanMode.weatherRefreshTimer || 0) + dt;
  if (oceanMode.weatherRefreshTimer >= 5 && typeof appCtx.refreshLiveWeather === 'function') {
    oceanMode.weatherRefreshTimer = 0;
    void appCtx.refreshLiveWeather(false);
  }
  updateFishLife(nowMs * 0.001);

  if (oceanMode.marineParticles) {
    oceanMode.marineParticles.rotation.y += dt * 0.02;
    oceanMode.marineParticles.position.y = -10 + Math.sin(nowMs * 0.00025) * 1.2;
  }

  updateOceanHud(nowMs * 0.001);
  oceanMode.renderer.render(oceanMode.scene, oceanMode.camera);
}

function startOceanMode(options = {}) {
  if (oceanMode.active) return true;
  try {
    const transition = beginEnvironmentTransition(appCtx.ENV.OCEAN, { source: 'ocean_start' });
    if (appCtx.ENV?.OCEAN) exitCurrentEnvironmentSync(appCtx.ENV.OCEAN, { source: 'ocean_start' });
    if (!commitEnvironment(appCtx.ENV.OCEAN, { token: transition })) {
      throw new Error('Ocean destination commit was rejected.');
    }
    oceanSessionScope = transition.session.scope;

    if (options.launchSite) {
      resetOceanLaunchSite(options.launchSite);
    }
    if (!oceanMode.scene || !oceanMode.renderer || !oceanMode.camera) createOceanScene();
    resetSubmarineAtLaunch(options.submarinePose || null);
    rebuildOceanTerrainLayers(oceanMode.scene, oceanMode.renderer);

    const worldCanvas = getWorldCanvas();
    if (worldCanvas) worldCanvas.style.display = 'none';
    if (oceanMode.canvas) oceanMode.canvas.style.display = 'block';

    oceanMode.active = true;
    oceanMode.lastFrameMs = 0;
    oceanMode.weatherRefreshTimer = 0;
    oceanMode.animationId = oceanSessionScope.animationFrame(animateOceanMode);
    if (typeof appCtx.refreshAstronomicalSky === 'function') {
      appCtx.refreshAstronomicalSky(true);
    }
    if (typeof appCtx.refreshLiveWeather === 'function') {
      void appCtx.refreshLiveWeather(true);
    }

    if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
    if (typeof appCtx.refreshBoatAvailability === 'function') appCtx.refreshBoatAvailability(true);
    updateOceanHud(performance.now() * 0.001);

    primeLocalBathymetryGrid().then(oceanSessionScope.guard((ready) => {
      if (!ready || !oceanMode.scene) return;
      rebuildOceanTerrainLayers(oceanMode.scene, oceanMode.renderer);
    }));

    primeBathymetryTiles().then(oceanSessionScope.guard((ready) => {
      if (!ready || !oceanMode.scene) return;
      rebuildOceanTerrainLayers(oceanMode.scene, oceanMode.renderer);
    }));

    return true;
  } catch (error) {
    console.error('[OceanMode] start failed', error);
    oceanMode.active = false;
    oceanSessionScope?.dispose('ocean-start-failed');
    oceanSessionScope = null;
    if (oceanMode.animationId) {
      cancelAnimationFrame(oceanMode.animationId);
      oceanMode.animationId = null;
    }
    if (oceanMode.canvas) oceanMode.canvas.style.display = 'none';
    const worldCanvas = getWorldCanvas();
    if (worldCanvas) worldCanvas.style.display = 'block';
    if (appCtx.ENV?.EARTH) commitEnvironment(appCtx.ENV.EARTH, { source: 'ocean_start_rollback' });
    if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
    return false;
  }
}

function stopOceanMode(options = {}) {
  const wasActive = !!oceanMode.active;
  oceanMode.active = false;
  oceanSessionScope?.dispose('ocean-mode-exit');
  oceanSessionScope = null;
  if (oceanMode.animationId) {
    cancelAnimationFrame(oceanMode.animationId);
    oceanMode.animationId = null;
  }

  if (oceanMode.canvas) oceanMode.canvas.style.display = 'none';
  const worldCanvas = getWorldCanvas();
  if (worldCanvas) worldCanvas.style.display = 'block';

  const speedUnitEl = document.getElementById('speedUnitLabel');
  const limitLabelEl = document.getElementById('limitLabel');
  const indBrake = document.getElementById('indBrake');
  const indBoost = document.getElementById('indBoost');
  const indDrift = document.getElementById('indDrift');
  const indOff = document.getElementById('indOff');
  const offRoadWarn = document.getElementById('offRoadWarn');
  if (speedUnitEl) speedUnitEl.textContent = 'MPH';
  if (limitLabelEl) limitLabelEl.textContent = 'LIMIT';
  if (indBrake) {
    indBrake.textContent = 'BRK';
    indBrake.classList.remove('on');
  }
  if (indBoost) {
    indBoost.textContent = 'BOOST';
    indBoost.classList.remove('on');
  }
  if (indDrift) indDrift.textContent = 'DRIFT';
  if (indOff) {
    indOff.textContent = 'OFF';
    indOff.classList.remove('on', 'warn');
  }
  if (offRoadWarn) offRoadWarn.classList.remove('active');

  if (options.commitEnvironment !== false && appCtx.ENV?.EARTH) {
    commitEnvironment(appCtx.ENV.EARTH, { source: 'ocean_stop' });
  }
  if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
  if (typeof appCtx.refreshBoatAvailability === 'function') appCtx.refreshBoatAvailability(true);
  destroyOceanScene();
  return wasActive;
}

const oceanDestinationAdapter = Object.freeze({
  exitSync: () => stopOceanMode({ commitEnvironment: false }),
  snapshot: () => ({
    active: !!oceanMode.active,
    animationActive: oceanMode.animationId != null,
    bathymetryReady: !!oceanMode.bathymetryReady,
    localBathymetryReady: !!oceanMode.localBathymetryReady,
    rendererReady: !!oceanMode.renderer,
    sceneReady: !!oceanMode.scene,
    scope: oceanSessionScope?.snapshot() || null
  })
});

function initOceanModeUI() {
  if (oceanMode.canvas) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'oceanModeCanvas';
  canvas.style.cssText = [
    'position:fixed',
    'inset:0',
    'width:100vw',
    'height:100vh',
    'display:none',
    'z-index:2',
    'pointer-events:none'
  ].join(';');
  document.body.appendChild(canvas);
  oceanMode.canvas = canvas;
  const legacyHud = document.getElementById('oceanModeHUD');
  if (legacyHud && legacyHud.parentElement) legacyHud.parentElement.removeChild(legacyHud);

  window.addEventListener('resize', () => {
    if (!oceanMode.renderer || !oceanMode.camera) return;
    oceanMode.camera.aspect = window.innerWidth / window.innerHeight;
    oceanMode.camera.updateProjectionMatrix();
    oceanMode.renderer.setSize(window.innerWidth, window.innerHeight, false);
  });
}

function getOceanModeDebugState() {
  const sub = oceanMode.submarine || {};
  return {
    active: !!oceanMode.active,
    env: typeof appCtx.getEnv === 'function' ? appCtx.getEnv() : null,
    yaw: Number.isFinite(sub.yaw) ? sub.yaw : null,
    pitch: Number.isFinite(sub.pitch) ? sub.pitch : null,
    roll: Number.isFinite(sub.roll) ? sub.roll : null,
    speed: Number.isFinite(sub.speed) ? sub.speed : null,
    turnSpeed: Number.isFinite(sub.turnSpeed) ? sub.turnSpeed : null,
    verticalSpeed: Number.isFinite(sub.verticalSpeed) ? sub.verticalSpeed : null,
    position: sub.position ? {
      x: Number.isFinite(sub.position.x) ? sub.position.x : null,
      y: Number.isFinite(sub.position.y) ? sub.position.y : null,
      z: Number.isFinite(sub.position.z) ? sub.position.z : null
    } : null,
    localBathymetryReady: !!oceanMode.localBathymetryReady,
    bathymetryReady: !!oceanMode.bathymetryReady
  };
}

Object.assign(appCtx, {
  applyOceanSkyState,
  animateOceanMode,
  startOceanMode,
  stopOceanMode,
  getOceanModeDebugState
});

export {
  animateOceanMode,
  initOceanModeUI,
  oceanDestinationAdapter,
  oceanFrameOwnerDefinition,
  startOceanMode,
  stopOceanMode
};

if (typeof globalThis !== 'undefined') {
  globalThis.getOceanModeDebugState = getOceanModeDebugState;
}
