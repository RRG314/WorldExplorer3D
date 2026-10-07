import {createOceanSoundscape} from './ocean/soundscape.js';
import {createMarineHabitat} from './ocean/habitat.js';
import {getMaritimeCatalogEntry} from './transport/maritime-catalog.js?v=1';
import {createOceanParentVessel,parentHullCollision} from './ocean/parent-vessel.js';
import {ensureOceanVoyage} from './ocean/voyage.js';
import {validateOceanVoyage} from './ocean/voyage-store.js';
import { createOceanDiver } from './ocean/diver.js';
import { refreshWaterEnvironmentEvidence } from './world/water-environment.js?v=2';
import { createOceanWaterSurface } from './ocean/water-surface.js?v=1';
import { hasOceanEntry } from "./ocean/entry-policy.js?v=1";
import { ctx as appCtx } from "./shared-context.js?v=55";
import {
  createAuxiliaryRenderer,
  disposeThreeRenderer,
  getPrimaryWorldCanvas
} from "./engine/webgl-lifecycle.js?v=2";
import {
  createDeepOceanBackdrop as createDeepOceanBackdropAsset,
  createMarineParticles as createMarineParticlesAsset,
  createSeabedMesh as createSeabedMeshAsset,
  createSubmarineMesh as createSubmarineMeshAsset,
  disposeObject3D as disposeOceanObject3D
} from "./ocean/scene-assets.js?v=1";
import {
  getRockTextureSet as getRockTextureSetAsset,
  getSeabedTextureSet as getSeabedTextureSetAsset
} from "./ocean/scene-textures.js?v=1";
import { createOceanFishLifeApi } from "./ocean/fish-life.js?v=2";
import { createFishPopulationContext } from './fishing/population-authority.js?v=2';
import { createOceanBathymetryApi } from "./ocean/bathymetry.js?v=5";
import { updateOceanHud as updateOceanHudView } from "./ocean/hud.js?v=5";
import {
  commitEnvironment,
  exitCurrentEnvironmentSync,
  registerEnvironmentLifecycle
} from './session-coordinator.js?v=2';
import { createLifecycleScope } from './runtime/lifecycle-scope.js?v=2';
import {acceptedSimulationDelta} from './runtime/simulation-clock.js';

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
  fishPopulationContext: null,
  underwaterSchoolPlan: null,
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
  globalBathymetryGrid: null,
  globalBathymetryReady: false,
  globalBathymetryPromise: null,
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
appCtx.oceanMode = oceanMode;
const oceanModuleScope = createLifecycleScope('ocean-module');
let oceanSessionScope = null;
let oceanSiteGeneration = 0;

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
  sampleSeabedEvidence,
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
  oceanMode.habitat=createMarineHabitat(THREE,{site:oceanMode.launchSite,scale:appCtx.SCALE,sampleSeabedHeight,rockTextures:getRockTextureSet(renderer)});
  return oceanMode.habitat.group;
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

function oceanFishPopulationContext() {
  const site = oceanMode.launchSite || OCEAN_SITE;
  const latitude = Number(site.lat);
  const longitude = Number(site.lon);
  return createFishPopulationContext({
    accessMode: 'underwater',
    ...(oceanMode.habitat?.plan.featured?{candidateSpeciesIds:['giant_trevally'],candidatePoolBasis:'authored-coral-shelf-visual-pack-v1'}:{}),
    waterbodyId: `ocean-site:${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
    waterKind: 'open_ocean',
    waterClass: 'marine',
    waterLabel: String(site.name || site.region || 'Ocean Site'),
    sourceDataset: 'world-explorer-reviewed-ocean-site',
    sourceTruth: 'modeled-ocean-environment',
    latitude,
    longitude,
    depthTruth: oceanMode.localBathymetryReady ? 'modeled-local-bathymetry' : 'modeled-bathymetry-pending'
  });
}

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
  scene.fog = new THREE.FogExp2(0x0b3551, .009);

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
  renderer.toneMappingExposure = .92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  getSeabedTextureSet(renderer);
  getRockTextureSet(renderer);

  const ambient = new THREE.AmbientLight(0x84d9ef, .25);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xa8e9ff, 0x143246, .42);
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

  oceanMode.waterSurface=createOceanWaterSurface(appCtx,oceanMode,sampleSeabedEvidence);
  scene.add(oceanMode.waterSurface.mesh);
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
  oceanMode.diver=createOceanDiver(appCtx,oceanMode,{sampleSeabedHeight,worldRadius:OCEAN_CONSTANTS.WORLD_RADIUS});

  oceanMode.soundscape=createOceanSoundscape({host:document.getElementById('oceanDiverOptions')});

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
  oceanMode.scene.fog.density = .008 + nightFactor * .003;
  oceanMode.renderer.toneMappingExposure = .78 + dayFactor * .15 + twilightFactor * .04;

  if (oceanMode.ambientLight) {
    oceanMode.ambientLight.color.setHex(dayFactor > 0.4 ? 0x84d9ef : twilightFactor > 0.2 ? 0x537ba2 : 0x1a3149);
    oceanMode.ambientLight.intensity = .12 + dayFactor * .22 + twilightFactor * .06;
  }
  if (oceanMode.hemiLight) {
    oceanMode.hemiLight.color.setHex(dayFactor > 0.4 ? 0xa8e9ff : twilightFactor > 0.2 ? 0x7fa9cb : 0x173149);
    oceanMode.hemiLight.groundColor.setHex(dayFactor > 0.4 ? 0x143246 : twilightFactor > 0.2 ? 0x122f42 : 0x081521);
    oceanMode.hemiLight.intensity = .20 + dayFactor * .30 + twilightFactor * .07;
  }
  if (oceanMode.keyLight) {
    const sun = state.sun?.direction || { x: 0.45, y: 0.8, z: 0.18 };
    oceanMode.keyLight.color.setHex(dayFactor > 0.35 ? 0xb8f1ff : twilightFactor > 0.2 ? 0xffc48a : 0x5870a2);
    oceanMode.keyLight.intensity = .14 + dayFactor * .72 + twilightFactor * .18;
    oceanMode.keyLight.position.set(sun.x * 210, Math.max(60, sun.y * 240), sun.z * 210);
  }
  if (oceanMode.fillLight) {
    const sun = state.sun?.direction || { x: 0.45, y: 0.8, z: 0.18 };
    oceanMode.fillLight.intensity = .06 + dayFactor * .12 + twilightFactor * .05;
    oceanMode.fillLight.position.set(-sun.x * 160, Math.max(40, Math.abs(sun.y) * 110), -sun.z * 160);
  }
}

function getWorldCanvas() {
  return getPrimaryWorldCanvas(appCtx);
}

function destroyOceanScene() {
  oceanMode.soundscape?.dispose();oceanMode.soundscape=null;
  oceanMode.parentVessel?.dispose();oceanMode.parentVessel=null;
  oceanMode.diver?.dispose();
  oceanMode.diver=null;
  clearFishLife(oceanMode.scene);
  if (oceanMode.scene) {
    disposeObject3D(oceanMode.scene);
  }
  oceanMode.renderer = disposeThreeRenderer(oceanMode.renderer);
  oceanMode.waterSurface = null;
  oceanMode.scene = null;
  oceanMode.camera = null;
  oceanMode.cameraLookTarget = null;
  oceanMode.seabedMesh = null;
  oceanMode.reefGroup = null;
  oceanMode.habitat = null;
  oceanMode.marineParticles = null;
  oceanMode.deepBackdrop = null;
  oceanMode.ambientLight = null;
  oceanMode.hemiLight = null;
  oceanMode.keyLight = null;
  oceanMode.fillLight = null;
  oceanMode.submarine.mesh = null;
}

function updateOceanHud(nowSeconds = 0) {
  updateOceanHudView(appCtx, oceanMode, nowSeconds, sampleSeabedEvidence);
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
  oceanMode.globalBathymetryGrid = null;
  oceanMode.globalBathymetryReady = false;
  oceanMode.globalBathymetryPromise = null;
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
  sub.position.x=Math.max(-1100,Math.min(1100,sub.position.x));sub.position.z=Math.max(-1100,Math.min(1100,sub.position.z));
  sub.position.y=Math.min(-1.6,Math.max(sampleSeabedHeight(sub.position.x,sub.position.z)+OCEAN_CONSTANTS.MIN_CLEARANCE,sub.position.y));
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

function placeSubmarineClearOfParent() {
  const ship=appCtx.oceanVoyage?.current?.ship,sub=oceanMode.submarine;
  if(!ship||!parentHullCollision(ship,sub.position,3,oceanMode.waterSurface.sample(0,0).surfaceY))return;
  const distance=(getMaritimeCatalogEntry(ship.transportCatalogId).length/2)+12;
  sub.position.x=-Math.sin(ship.yaw)*distance;sub.position.z=-Math.cos(ship.yaw)*distance;
  resetSubmarineAtLaunch({x:sub.position.x,y:sub.position.y,z:sub.position.z,yaw:sub.yaw});
}

function updateSubmarine(dt,time) {
  placeSubmarineClearOfParent();
  const sub = oceanMode.submarine;
  const previousPosition={x:sub.position.x,y:sub.position.y,z:sub.position.z};
  const motionDt=appCtx.sharedMarine?.active&&!appCtx.sharedMarine.canPilot?0:dt;
  const actions = motionDt>0 ? appCtx.readControlActions?.('ocean') || {} : {};
  const forwardInput = Number(actions.move) || 0;
  const yawInput = Number(actions.turn) || 0;
  const verticalInput = Number(actions.vertical) || 0;

  const targetSpeed = forwardInput * OCEAN_CONSTANTS.MAX_SPEED;
  const speedFactor = expApproachFactor(OCEAN_CONSTANTS.SPEED_RESPONSE, motionDt);
  sub.speed += (targetSpeed - sub.speed) * speedFactor;
  sub.speed *= Math.pow(OCEAN_CONSTANTS.DRAG, motionDt * 60);

  const targetTurnSpeed = yawInput * OCEAN_CONSTANTS.MAX_TURN_SPEED;
  const turnFactor = expApproachFactor(OCEAN_CONSTANTS.TURN_RESPONSE, motionDt);
  sub.turnSpeed += (targetTurnSpeed - sub.turnSpeed) * turnFactor;
  sub.turnSpeed *= Math.pow(0.9, motionDt * 60);
  sub.yaw += sub.turnSpeed * motionDt;

  const targetVertical = verticalInput * OCEAN_CONSTANTS.MAX_VERTICAL_SPEED;
  const verticalFactor = expApproachFactor(OCEAN_CONSTANTS.VERTICAL_RESPONSE, motionDt);
  sub.verticalSpeed += (targetVertical - sub.verticalSpeed) * verticalFactor;
  sub.verticalSpeed *= Math.pow(0.9, motionDt * 60);

  const sinYaw = Math.sin(sub.yaw);
  const cosYaw = Math.cos(sub.yaw);
  sub.position.x += sinYaw * sub.speed * motionDt;
  sub.position.z += cosYaw * sub.speed * motionDt;
  sub.position.y += sub.verticalSpeed * motionDt;

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
  const water = oceanMode.waterSurface.sample(sub.position.x,sub.position.z,{time});
  const ceilingY = water.surfaceY - 1.4;
  oceanMode.waterSample = water.volume;
  if (sub.position.y > ceilingY) {
    sub.position.y = ceilingY;
    if (sub.verticalSpeed > 0) sub.verticalSpeed = 0;
  }

  if(parentHullCollision(appCtx.oceanVoyage?.current?.ship,sub.position,3,oceanMode.waterSurface.sample(0,0,{time}).surfaceY)||oceanMode.habitat?.collision(sub.position,3)){sub.position.set(previousPosition.x,previousPosition.y,previousPosition.z);sub.speed=0;sub.verticalSpeed=0;oceanMode.contactUntil=time+1.2;}

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
  const cameraWater=oceanMode.waterSurface.sample(oceanMode.camera.position.x,oceanMode.camera.position.z,{time});
  oceanMode.camera.position.y=Math.min(oceanMode.camera.position.y,cameraWater.surfaceY-.2);
  const parentShip=appCtx.oceanVoyage?.current?.ship;
  if(parentHullCollision(parentShip,oceanMode.camera.position,.4,oceanMode.waterSurface.sample(0,0,{time}).surfaceY))oceanMode.camera.position.y=oceanMode.waterSurface.sample(0,0,{time}).surfaceY-getMaritimeCatalogEntry(parentShip.transportCatalogId).dimensions.draft-.5;
  oceanMode.camera.lookAt(oceanMode.cameraLookTarget);
}

function animateOceanMode(nowMs = 0) {
  if (!oceanMode.active) return;
  oceanMode.animationId = oceanSessionScope?.animationFrame(animateOceanMode) ?? null;

  if (!oceanMode.lastFrameMs) oceanMode.lastFrameMs = nowMs;
  const dt = appCtx.paused || globalThis.document?.hidden ? 0 : acceptedSimulationDelta((nowMs-oceanMode.lastFrameMs)/1000);
  oceanMode.lastFrameMs = nowMs;

  appCtx.sharedMarine?.tick(dt);
  if(!oceanMode.diver?.update(dt,nowMs*.001))updateSubmarine(dt,nowMs*.001);
  oceanMode.waterSurface.update(nowMs*.001);
  oceanMode.soundscape?.update({paused:appCtx.paused,diving:oceanMode.diver?.active,speed:oceanMode.submarine.speed,time:nowMs*.001});
  oceanMode.parentVessel?.update(nowMs*.001);
  oceanMode.habitat?.update(dt,oceanMode.diver?.active?oceanMode.diver.navigationActor().position:oceanMode.submarine.position,nowMs*.001);
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

  appCtx.oceanVoyage?.tick(dt);
  updateOceanHud(nowMs * 0.001);
  oceanMode.renderer.render(oceanMode.scene, oceanMode.camera);
}

async function startOceanMode(options = {}) {
  if(options.isTransferCurrent?.()===false)return false;
  const resume=validateOceanVoyage(options.voyageResume);
  const savedEntry=resume&&resume.site.lat===options.launchSite?.lat&&resume.site.lon===options.launchSite?.lon;
  // Reject before exiting Earth or replacing an existing ocean session.
  if (options.launchSite && !savedEntry && !hasOceanEntry(options.launchSite, options.entry)) return false;
  if (!options.launchSite) options = { ...options, launchSite: OCEAN_SITE };
  const siteGeneration=++oceanSiteGeneration;
  const currentSite=()=>siteGeneration===oceanSiteGeneration&&oceanMode.active&&!!oceanMode.scene;
  if (oceanMode.active) {
    if (options.launchSite) appCtx.oceanVoyage?.checkpoint();
    if (options.launchSite && resetOceanLaunchSite(options.launchSite)) {
      oceanMode.waveOffset={x:Number(options.waveOffset?.x)||0,z:Number(options.waveOffset?.z)||0};
      oceanMode.diver?.stop();
      resetSubmarineAtLaunch(options.submarinePose || null);
      void refreshWaterEnvironmentEvidence();
      rebuildOceanTerrainLayers(oceanMode.scene, oceanMode.renderer);
      void primeBathymetryTiles().then((ready) => {
        if (ready && currentSite()) {
          rebuildOceanTerrainLayers(oceanMode.scene, oceanMode.renderer);
        }
      });
      ensureOceanVoyage(appCtx).begin(options,oceanMode);
    placeSubmarineClearOfParent();
    oceanMode.parentVessel?.dispose();oceanMode.parentVessel=createOceanParentVessel(THREE,oceanMode,appCtx.oceanVoyage);
      updateOceanHud(performance.now() * 0.001);
    }
    return true;
  }
  try {
    if (appCtx.ENV?.OCEAN) exitCurrentEnvironmentSync(appCtx.ENV.OCEAN, { source: 'ocean_start' });
    if (appCtx.ENV?.OCEAN) commitEnvironment(appCtx.ENV.OCEAN, { source: 'ocean_start' });
    oceanSessionScope?.dispose('ocean-session-replaced');
    oceanSessionScope = createLifecycleScope('ocean-session');

    if (options.launchSite) {
      resetOceanLaunchSite(options.launchSite);
    }
    if (!oceanMode.scene || !oceanMode.renderer || !oceanMode.camera) createOceanScene();
    oceanSessionScope.defer(() => destroyOceanScene(), 'renderer');
    oceanMode.waveOffset={x:Number(options.waveOffset?.x)||0,z:Number(options.waveOffset?.z)||0};
    resetSubmarineAtLaunch(options.submarinePose || null);
    rebuildOceanTerrainLayers(oceanMode.scene, oceanMode.renderer);
    initFishLife(oceanMode.scene, oceanFishPopulationContext());

    const worldCanvas = getWorldCanvas();
    if (worldCanvas) worldCanvas.style.display = 'none';
    if (oceanMode.canvas) oceanMode.canvas.style.display = 'block';

    oceanMode.active = true;
    ensureOceanVoyage(appCtx).begin(options,oceanMode);
    placeSubmarineClearOfParent();
    oceanMode.parentVessel?.dispose();oceanMode.parentVessel=createOceanParentVessel(THREE,oceanMode,appCtx.oceanVoyage);
    if(options.diverEntry) {
      const entered=await oceanMode.diver.start(options.diverEntry);
      if(!currentSite())return false;
      if(!entered)throw new Error('The research-vessel water entry was not ready.');
    }
    if(!currentSite())return false;
    void refreshWaterEnvironmentEvidence();
    appCtx.updateInteriorInteraction?.();
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
      if (!ready || !currentSite()) return;
      rebuildOceanTerrainLayers(oceanMode.scene, oceanMode.renderer);
    }));

    primeBathymetryTiles().then(oceanSessionScope.guard((ready) => {
      if (!ready || !currentSite()) return;
      rebuildOceanTerrainLayers(oceanMode.scene, oceanMode.renderer);
    }));

    return true;
  } catch (error) {
    if (siteGeneration !== oceanSiteGeneration) return false;
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
  if(wasActive)appCtx.oceanVoyage?.checkpoint();
  oceanMode.active = false;
  appCtx.oceanVoyage?.refresh();
  oceanSessionScope?.dispose('ocean-exit');
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
  if (options.commitEnvironment !== false && appCtx.ENV?.EARTH) {
    commitEnvironment(appCtx.ENV.EARTH, { source: 'ocean_stop' });
  }
  if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
  appCtx.updateInteriorInteraction?.();
  if (typeof appCtx.refreshBoatAvailability === 'function') appCtx.refreshBoatAvailability(true);
  if (oceanMode.scene || oceanMode.renderer) destroyOceanScene();
  return wasActive;
}

registerEnvironmentLifecycle(appCtx.ENV.OCEAN, {
  exitSync: () => stopOceanMode({ commitEnvironment: false }),
  snapshot: () => ({
    active: !!oceanMode.active,
    animationActive: oceanMode.animationId != null,
    bathymetryReady: !!oceanMode.bathymetryReady,
    localBathymetryReady: !!oceanMode.localBathymetryReady,
    fishPopulationContextId: oceanMode.fishPopulationContext?.contextId || null,
    fishAuthorityVersion: oceanMode.fishPopulationContext?.authorityVersion || null,
    underwaterSchoolCount: Number(oceanMode.underwaterSchoolPlan?.schools?.length || 0),
    underwaterFishCount: Number(oceanMode.fishEntities?.length || 0),
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

  oceanModuleScope.listen(window, 'resize', () => {
    if (!oceanMode.renderer || !oceanMode.camera) return;
    oceanMode.camera.aspect = window.innerWidth / window.innerHeight;
    oceanMode.camera.updateProjectionMatrix();
    oceanMode.renderer.setSize(window.innerWidth, window.innerHeight, false);
  });
}

function getOceanModeDebugState() {
  const sub = oceanMode.submarine || {};
  const marine=appCtx.sharedMarine?.snapshot();
  return {
    sharedVoyage:marine?.active?{stage:marine.state?.stage,revision:marine.state?.revision,observations:marine.state?.manifest.length,canPilot:appCtx.sharedMarine.canPilot,transition:marine.transition,error:marine.error}:null,
    active: !!oceanMode.active,
    launchSite: { ...oceanMode.launchSite },
    navigationMap: oceanMode.navigationMapSnapshot || null,
    water: oceanMode.waterSample || null,
    diver:oceanMode.diver?.snapshot() || null,
    habitat:oceanMode.habitat?.group?.userData.habitat || null,
    seabed: sub.position ? sampleSeabedEvidence(sub.position.x, sub.position.z) : null,
    env: typeof appCtx.getEnv === 'function' ? appCtx.getEnv() : null,
    yaw: Number.isFinite(sub.yaw) ? sub.yaw : null,
    pitch: Number.isFinite(sub.pitch) ? sub.pitch : null,
    roll: Number.isFinite(sub.roll) ? sub.roll : null,
    speed: Number.isFinite(sub.speed) ? sub.speed : null,
    verticalSpeed: Number.isFinite(sub.verticalSpeed) ? sub.verticalSpeed : null,
    position: sub.position ? {
      x: Number.isFinite(sub.position.x) ? sub.position.x : null,
      y: Number.isFinite(sub.position.y) ? sub.position.y : null,
      z: Number.isFinite(sub.position.z) ? sub.position.z : null
    } : null,
    localBathymetryReady: !!oceanMode.localBathymetryReady,
    bathymetryReady: !!oceanMode.bathymetryReady,
    fishPopulationContextId: oceanMode.fishPopulationContext?.contextId || null,
    fishAuthorityVersion: oceanMode.fishPopulationContext?.authorityVersion || null,
    fishPopulationEvidence: oceanMode.fishPopulationContext?.evidence?.populationTruth || null,
    underwaterSchoolCount: Number(oceanMode.underwaterSchoolPlan?.schools?.length || 0),
    underwaterFishCount: Number(oceanMode.fishEntities?.length || 0),
    underwaterSpeciesIds: (oceanMode.underwaterSchoolPlan?.schools || []).map((school) => school.speciesId),
    fishLivePresenceClaim: oceanMode.underwaterSchoolPlan?.livePresenceClaim === true
  };
}

Object.assign(appCtx, {
  applyOceanSkyState,
  animateOceanMode,
  startOceanMode,
  stopOceanMode,
  getOceanModeDebugState
});

export { animateOceanMode, startOceanMode, stopOceanMode };

if (typeof globalThis !== 'undefined') {
  globalThis.getOceanModeDebugState = getOceanModeDebugState;
}

if (document.readyState === 'loading') {
  oceanModuleScope.listen(document, 'DOMContentLoaded', initOceanModeUI, { once: true });
} else {
  initOceanModeUI();
}
