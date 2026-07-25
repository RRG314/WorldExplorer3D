import { ctx as appCtx } from '../shared-context.js?v=55';
import { captureEarthWorldSession, resumeEarthWorldSession } from '../earth-session.js?v=20';
import { ENV, getEnv } from '../env.js?v=57';
import {
  commitEnvironment,
  exitCurrentEnvironmentSync
} from '../session-coordinator.js?v=2';
import { configureColorTexture } from './catalog.js?v=1';
import { suspendEarthModesForPlanetaryEntry } from './entry.js?v=9';

const MARS_SIZE = 24000;
const MARS_SEGMENTS = 200;
const MARS_SURFACE_Y = -80;
const MARS_SPAWN = Object.freeze({ x: 3200, z: 1900, angle: -2.08 });
const OLYMPUS_REGION_DIAMETER_KM = 600;
const OLYMPUS_RELIEF_KM = 21.9;
const OLYMPUS_RELIEF_SCENE = MARS_SIZE * OLYMPUS_RELIEF_KM / OLYMPUS_REGION_DIAMETER_KM;
let earthCameraFar = null;
let marsDemData = null;
let marsDemLoadPromise = null;
let marsTransitionSessionId = 0;

function isCurrentMarsTransition(sessionId) {
  return sessionId === marsTransitionSessionId;
}

function cancelPendingMarsTransition() {
  marsTransitionSessionId++;
  appCtx.setEnvironmentTransitionActive(false);
}

function retainMarsTransitionOwnership(sessionId) {
  if (!isCurrentMarsTransition(sessionId)) return false;
  appCtx.setEarthSceneVisible?.(false);
  return true;
}

function loadMarsDemSample() {
  if (marsDemData) return Promise.resolve(marsDemData);
  if (marsDemLoadPromise) return marsDemLoadPromise;
  marsDemLoadPromise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return resolve(null);
      context.drawImage(image, 0, 0);
      marsDemData = {
        width: canvas.width,
        height: canvas.height,
        pixels: context.getImageData(0, 0, canvas.width, canvas.height).data
      };
      resolve(marsDemData);
    };
    image.onerror = () => resolve(null);
    image.src = '/app/assets/textures/mars_mola_olympus_dem_512.jpg';
  });
  return marsDemLoadPromise;
}

function sampleMarsDem(x, z) {
  if (!marsDemData) return 0;
  const u = Math.max(0, Math.min(1, 0.5 + x / MARS_SIZE));
  const v = Math.max(0, Math.min(1, 0.5 + z / MARS_SIZE));
  const px = Math.round(u * (marsDemData.width - 1));
  const py = Math.round(v * (marsDemData.height - 1));
  const index = (py * marsDemData.width + px) * 4;
  const elevationByte = (
    marsDemData.pixels[index] +
    marsDemData.pixels[index + 1] +
    marsDemData.pixels[index + 2]
  ) / 3;
  return Math.max(0, Math.min(1, (elevationByte - 42) / 213)) * OLYMPUS_RELIEF_SCENE;
}

function sampleMarsLocalHeight(x, z) {
  return sampleMarsDem(x, z);
}

function createMarsSurface() {
  if (appCtx.marsSurface) return appCtx.marsSurface;
  const geometry = new THREE.PlaneGeometry(MARS_SIZE, MARS_SIZE, MARS_SEGMENTS, MARS_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, sampleMarsLocalHeight(positions.getX(i), positions.getZ(i)));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  const texture = configureColorTexture(
    new THREE.TextureLoader().load('/app/assets/textures/mars_olympus_viking_900.jpg'),
    appCtx.renderer
  );
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.98,
    metalness: 0,
    emissive: 0x35160f,
    emissiveIntensity: 0.18
  });
  const surface = new THREE.Mesh(geometry, material);
  surface.name = 'Mars Olympus Mons Surface';
  surface.position.y = MARS_SURFACE_Y;
  surface.receiveShadow = true;
  surface.castShadow = true;
  surface.frustumCulled = false;
  surface.userData.planetaryBody = 'mars';
  surface.userData.terrainSource = 'NASA MOLA regional elevation image';
  surface.userData.reliefCalibration = {
    regionDiameterKm: OLYMPUS_REGION_DIAMETER_KM,
    summitReliefKm: OLYMPUS_RELIEF_KM,
    displayReliefScene: OLYMPUS_RELIEF_SCENE
  };
  appCtx.marsSurface = surface;
  appCtx.scene.add(surface);
  createMarsRocks(surface);
  return surface;
}

function createMarsRocks(surface) {
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x7d4432, roughness: 1, metalness: 0 });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 620);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  let seed = 0x4d415253;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 620; i++) {
    let x;
    let z;
    do {
      const radius = 220 + Math.sqrt(random()) * MARS_SIZE * 0.46;
      const theta = random() * Math.PI * 2;
      x = Math.cos(theta) * radius;
      z = Math.sin(theta) * radius;
    } while (Math.hypot(x - MARS_SPAWN.x, z - MARS_SPAWN.z) < 280);
    const scale = 0.7 + Math.pow(random(), 2.2) * 10;
    transform.position.set(x, MARS_SURFACE_Y + sampleMarsLocalHeight(x, z) + scale * 0.33, z);
    transform.rotation.set(random(), random() * Math.PI * 2, random());
    transform.scale.set(scale * 1.25, scale * (0.5 + random() * 0.55), scale);
    transform.updateMatrix();
    rocks.setMatrixAt(i, transform.matrix);
    const tone = 0.7 + random() * 0.3;
    color.setRGB(0.43 * tone, 0.22 * tone, 0.15 * tone);
    rocks.setColorAt(i, color);
  }
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.userData.planetaryBody = 'mars';
  appCtx.marsObjects = [rocks];
  appCtx.scene.add(rocks);
}

function positionPlayerOnMars() {
  const groundY = MARS_SURFACE_Y + sampleMarsLocalHeight(MARS_SPAWN.x, MARS_SPAWN.z);
  Object.assign(appCtx.car, {
    x: MARS_SPAWN.x,
    z: MARS_SPAWN.z,
    y: groundY + 1.2,
    angle: MARS_SPAWN.angle,
    vx: 0,
    vz: 0,
    vy: 0,
    vFwd: 0,
    vLat: 0,
    yawRate: 0,
    rearSlip: 0,
    steerSm: 0,
    throttleSm: 0,
    speed: 0,
    isAirborne: false,
    _lastSurfaceY: null
  });
  if (appCtx.drone) {
    Object.assign(appCtx.drone, { x: MARS_SPAWN.x, z: MARS_SPAWN.z, y: groundY + 12, yaw: MARS_SPAWN.angle, pitch: -0.24, roll: 0 });
  }
  const walker = appCtx.Walk?.state?.walker;
  if (walker) Object.assign(walker, { x: MARS_SPAWN.x, z: MARS_SPAWN.z, y: groundY + 1.7, vy: 0, yaw: MARS_SPAWN.angle });
  appCtx.carMesh?.position.set(MARS_SPAWN.x, groundY + 1.2, MARS_SPAWN.z);
  if (appCtx.carMesh) appCtx.carMesh.rotation.y = MARS_SPAWN.angle;
  if (appCtx.camera) {
    appCtx.camera.position.set(MARS_SPAWN.x + 16, groundY + 9, MARS_SPAWN.z + 18);
    appCtx.camera.lookAt(0, MARS_SURFACE_Y + 900, 0);
    if (appCtx.camera.userData) delete appCtx.camera.userData.lookTarget;
  }
}

function setMarsObjectsVisible(visible) {
  if (appCtx.marsSurface) {
    appCtx.marsSurface.visible = visible;
    if (visible && appCtx.marsSurface.parent !== appCtx.scene) appCtx.scene.add(appCtx.marsSurface);
    if (!visible && appCtx.marsSurface.parent === appCtx.scene) appCtx.scene.remove(appCtx.marsSurface);
  }
  (appCtx.marsObjects || []).forEach((object) => {
    object.visible = visible;
    if (visible && object.parent !== appCtx.scene) appCtx.scene.add(object);
    if (!visible && object.parent === appCtx.scene) appCtx.scene.remove(object);
  });
}

function showMarsReturnButton() {
  let button = document.getElementById('marsReturnEarthBtn');
  if (!button) {
    button = document.createElement('button');
    button.id = 'marsReturnEarthBtn';
    button.className = 'game-btn';
    button.textContent = 'Return to Earth';
    button.style.cssText = 'position:fixed;top:82px;right:20px;z-index:1000;padding:10px 20px;font-size:16px;background:#b4532a;color:#fff;border:1px solid #efb08c;border-radius:5px;cursor:pointer;';
    button.addEventListener('click', () => void returnFromMars());
    document.body.appendChild(button);
  }
  button.style.display = 'block';
}

function setMarsInterfaceActive(active) {
  ['minimap', 'minimapZoomControls', 'coords'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.style.display = '';
  });
  document.body?.classList.toggle('mars-surface-active', !!active);
  appCtx.updateWeatherUi?.();
}

function enterMarsDriveMode() {
  appCtx.setDroneModeActive(false);
  if (appCtx.Walk?.state?.mode === 'walk') appCtx.Walk.setModeDrive();
  appCtx.setTravelMode?.('drive', { source: 'mars_arrival', emitTutorial: false });
}

async function arriveAtMars(expectedSessionId = null) {
  const sessionId = expectedSessionId ?? ++marsTransitionSessionId;
  if (!isCurrentMarsTransition(sessionId)) return false;
  suspendEarthModesForPlanetaryEntry(ENV.MARS);
  if (!isCurrentMarsTransition(sessionId)) return false;
  if (!retainMarsTransitionOwnership(sessionId)) return false;
  appCtx.setPauseReason?.('planetary_transition', true);
  appCtx.scene.background = new THREE.Color(0x9b5d43);
  appCtx.scene.fog = new THREE.FogExp2(0xb06a4e, 0.000095);
  if (appCtx.renderer) appCtx.renderer.toneMappingExposure = 1.1;
  if (appCtx.camera) {
    if (!Number.isFinite(earthCameraFar)) earthCameraFar = appCtx.camera.far;
    appCtx.camera.far = Math.max(30000, appCtx.camera.far);
    appCtx.camera.updateProjectionMatrix();
  }
  if (appCtx.moonSurface) appCtx.moonSurface.visible = false;
  (window._moonObjects || []).forEach((object) => { object.visible = false; });
  if (appCtx.moonSphere) appCtx.moonSphere.visible = false;
  appCtx.setLunarEarthVisible?.(false);

  await loadMarsDemSample();
  if (!retainMarsTransitionOwnership(sessionId)) return false;
  createMarsSurface();
  setMarsObjectsVisible(true);
  enterMarsDriveMode();
  positionPlayerOnMars();
  void appCtx.setPlanetaryVehicle?.('mars');
  if (!retainMarsTransitionOwnership(sessionId)) return false;
  appCtx.setPlanetaryCharacter?.('mars');
  positionPlayerOnMars();
  if (appCtx.carMesh) appCtx.carMesh.visible = true;

  if (appCtx.sun) {
    appCtx.sun.intensity = 1.35;
    appCtx.sun.position.set(-140, 210, 90);
  }
  if (appCtx.ambientLight) appCtx.ambientLight.intensity = 0.34;
  if (appCtx.fillLight) appCtx.fillLight.intensity = 0.18;
  if (!retainMarsTransitionOwnership(sessionId)) return false;
  if (!commitEnvironment(ENV.MARS, { source: 'mars_arrival' })) return false;
  appCtx.setPlanetarySky?.('mars');
  setMarsInterfaceActive(true);
  showMarsReturnButton();
  appCtx.setPauseReason?.('planetary_transition', false);
  appCtx.updateControlsModeUI?.();
  return true;
}

async function directTravelToMars() {
  if (appCtx.onMars) return true;
  const sessionId = ++marsTransitionSessionId;
  appCtx.prepareEarthDepartureForMars?.();
  await appCtx.showTransitionLoad?.('mars', 900);
  if (!isCurrentMarsTransition(sessionId)) return false;
  return arriveAtMars(sessionId);
}

async function returnFromMars() {
  if (!appCtx.onMars || appCtx.travelingToMoon) return;
  const sessionId = ++marsTransitionSessionId;
  appCtx.setEnvironmentTransitionActive(true);
  appCtx.setPauseReason?.('planetary_transition', true);
  const button = document.getElementById('marsReturnEarthBtn');
  if (button) button.style.display = 'none';
  await appCtx.showTransitionLoad?.('earth', 700);
  if (!isCurrentMarsTransition(sessionId)) return;
  exitCurrentEnvironmentSync(ENV.EARTH, { source: 'mars_return' });
  await appCtx.setPlanetaryVehicle?.('earth');
  if (!isCurrentMarsTransition(sessionId)) return;
  appCtx.setPlanetaryCharacter?.('earth');
  appCtx.clearPlanetarySky?.();
  appCtx.scene.fog = null;
  appCtx.scene.background = new THREE.Color(0x87ceeb);
  if (appCtx.camera && Number.isFinite(earthCameraFar)) {
    appCtx.camera.far = earthCameraFar;
    appCtx.camera.updateProjectionMatrix();
  }
  commitEnvironment(ENV.EARTH, { source: 'mars_return' });
  try {
    await resumeEarthWorldSession({
      switchEnv: false,
      transitionDurationMs: 350,
      isCurrent: () => isCurrentMarsTransition(sessionId)
    });
  } finally {
    if (isCurrentMarsTransition(sessionId)) {
      appCtx.setPauseReason?.('planetary_transition', false);
      appCtx.setEnvironmentTransitionActive(false);
    }
  }
}

function prepareEarthDepartureForMars() {
  appCtx.cancelPendingEarthArrival?.();
  if (getEnv() === ENV.EARTH) captureEarthWorldSession();
  appCtx.setEarthSceneVisible?.(false);
}

function prepareMarsTitleExit() {
  if (getEnv() !== ENV.MARS && !appCtx.onMars) return;
  setMarsObjectsVisible(false);
  setMarsInterfaceActive(false);
  appCtx.clearPlanetarySky?.();
  appCtx.scene.fog = null;
  appCtx.scene.background = new THREE.Color(0x87ceeb);
  if (appCtx.camera && Number.isFinite(earthCameraFar)) {
    appCtx.camera.far = earthCameraFar;
    appCtx.camera.updateProjectionMatrix();
  }
}

const marsDestinationAdapter = Object.freeze({
  exitSync: prepareMarsTitleExit,
  snapshot: () => ({
    active: getEnv() === ENV.MARS,
    objectCount: (appCtx.marsObjects || []).length,
    surfaceAttached: appCtx.marsSurface?.parent === appCtx.scene,
    surfaceVisible: !!appCtx.marsSurface?.visible,
    transitionSessionId: marsTransitionSessionId
  })
});

Object.assign(appCtx, {
  arriveAtMars,
  cancelPendingMarsTransition,
  directTravelToMars,
  prepareEarthDepartureForMars,
  prepareMarsTitleExit,
  returnFromMars,
  sampleMarsLocalHeight
});

export {
  arriveAtMars,
  cancelPendingMarsTransition,
  directTravelToMars,
  marsDestinationAdapter,
  prepareEarthDepartureForMars,
  prepareMarsTitleExit,
  returnFromMars,
  sampleMarsLocalHeight
};
