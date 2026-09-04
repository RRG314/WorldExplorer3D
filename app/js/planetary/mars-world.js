import { ctx as appCtx } from '../shared-context.js?v=55';
import { captureEarthWorldSession, resumeEarthWorldSession } from '../earth-session.js?v=17';
import { ENV, getEnv } from '../env.js?v=58';
import {
  commitEnvironment,
  exitCurrentEnvironmentSync,
  registerEnvironmentLifecycle
} from '../session-coordinator.js?v=2';
import { configureColorTexture } from './catalog.js?v=1';
import { suspendEarthModesForPlanetaryEntry } from './entry.js?v=9';
import {
  ensurePlanetarySurfaceAuthority,
  OLYMPUS_MONS_SURFACE_REGION
} from './runtime/surface-authority.js?v=4';

const MARS_SIZE = 24000;
const MARS_SEGMENTS = 256;
const MARS_SURFACE_Y = OLYMPUS_MONS_SURFACE_REGION.renderPlacement.y;
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
    image.src = OLYMPUS_MONS_SURFACE_REGION.assets.find((asset) => asset.role === 'height').url;
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

// The rendered terrain is a triangle grid. Sampling the source image again at an
// arbitrary point can disagree with the triangle that is actually on screen,
// especially where adjacent DEM pixels change sharply. Interpolate the exact
// three rendered vertices so driving, walking, props, and the visible surface
// all use one height.
function sampleMarsRenderedHeight(x, z) {
  const half = MARS_SIZE * 0.5;
  const step = MARS_SIZE / MARS_SEGMENTS;
  const clampedX = Math.max(-half, Math.min(half, Number(x) || 0));
  const clampedZ = Math.max(-half, Math.min(half, Number(z) || 0));
  const gridX = Math.min(MARS_SEGMENTS - 1, Math.max(0, Math.floor((clampedX + half) / step)));
  const gridZ = Math.min(MARS_SEGMENTS - 1, Math.max(0, Math.floor((clampedZ + half) / step)));
  const x0 = -half + gridX * step;
  const z0 = -half + gridZ * step;
  const u = Math.max(0, Math.min(1, (clampedX - x0) / step));
  const v = Math.max(0, Math.min(1, (clampedZ - z0) / step));
  const a = sampleMarsDem(x0, z0);
  const b = sampleMarsDem(x0, z0 + step);
  const c = sampleMarsDem(x0 + step, z0 + step);
  const d = sampleMarsDem(x0 + step, z0);
  return u + v <= 1
    ? a + u * (d - a) + v * (b - a)
    : c + (1 - u) * (b - c) + (1 - v) * (d - c);
}

function sampleMarsLocalHeight(x, z) {
  const accepted = appCtx.planetarySurfaceAuthority?.sampleAtLocalXZ?.(x, z, {
    bodyId: 'mars',
    regionId: OLYMPUS_MONS_SURFACE_REGION.regionId
  });
  if (accepted?.status === 'available') return accepted.local.y;
  return sampleMarsRenderedHeight(x, z);
}

function loadMarsColorTexture() {
  const asset = OLYMPUS_MONS_SURFACE_REGION.assets.find((entry) => entry.role === 'albedo');
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      asset.url,
      (texture) => resolve(configureColorTexture(texture, appCtx.renderer)),
      undefined,
      () => reject(new Error(`Unable to load Mars surface asset: ${asset.url}`))
    );
  });
}

function loadMarsReliefTexture() {
  const asset = OLYMPUS_MONS_SURFACE_REGION.assets.find((entry) => entry.role === 'height');
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      asset.url,
      (texture) => {
        texture.colorSpace = THREE.NoColorSpace;
        texture.anisotropy = Math.min(4, appCtx.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      () => reject(new Error(`Unable to load Mars relief asset: ${asset.url}`))
    );
  });
}

async function createMarsSurface() {
  const surfaceAuthority = ensurePlanetarySurfaceAuthority(appCtx);
  if (appCtx.marsSurface) {
    const activation = surfaceAuthority.activate(OLYMPUS_MONS_SURFACE_REGION.regionId);
    if (activation.status !== 'accepted') {
      throw new Error(`Mars surface could not be activated: ${activation.reason || activation.status}`);
    }
    return appCtx.marsSurface;
  }
  let candidateSurface = null;
  const publication = await surfaceAuthority.prepare(
    OLYMPUS_MONS_SURFACE_REGION.regionId,
    async () => {
      const [dem, texture, reliefTexture] = await Promise.all([
        loadMarsDemSample(),
        loadMarsColorTexture(),
        loadMarsReliefTexture()
      ]);
      if (!dem) throw new Error('Mars measured elevation asset is unavailable.');
      const geometry = new THREE.PlaneGeometry(MARS_SIZE, MARS_SIZE, MARS_SEGMENTS, MARS_SEGMENTS);
      geometry.rotateX(-Math.PI / 2);
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        positions.setY(i, sampleMarsDem(positions.getX(i), positions.getZ(i)));
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        map: texture,
        bumpMap: reliefTexture,
        bumpScale: 18,
        color: 0xdca080,
        roughness: 0.92,
        metalness: 0,
        emissive: 0x2a0d08,
        emissiveIntensity: 0.11
      });
      candidateSurface = new THREE.Mesh(geometry, material);
      candidateSurface.name = 'Mars Olympus Mons Surface';
      candidateSurface.position.set(
        OLYMPUS_MONS_SURFACE_REGION.renderPlacement.x,
        OLYMPUS_MONS_SURFACE_REGION.renderPlacement.y,
        OLYMPUS_MONS_SURFACE_REGION.renderPlacement.z
      );
      candidateSurface.receiveShadow = true;
      candidateSurface.castShadow = true;
      candidateSurface.frustumCulled = false;
      candidateSurface.userData.planetaryBody = 'mars';
      candidateSurface.userData.surfaceRegionId = OLYMPUS_MONS_SURFACE_REGION.regionId;
      candidateSurface.userData.worldAddress = OLYMPUS_MONS_SURFACE_REGION.address;
      candidateSurface.userData.worldAddressKey = OLYMPUS_MONS_SURFACE_REGION.addressKey;
      candidateSurface.userData.terrainSource = OLYMPUS_MONS_SURFACE_REGION.source.title;
      candidateSurface.userData.sourceUrl = OLYMPUS_MONS_SURFACE_REGION.source.url;
      candidateSurface.userData.reliefCalibration = {
        regionDiameterKm: OLYMPUS_REGION_DIAMETER_KM,
        summitReliefKm: OLYMPUS_RELIEF_KM,
        displayReliefScene: OLYMPUS_RELIEF_SCENE
      };
      candidateSurface.userData.surfaceDetail = {
        terrain: 'derived_from_observations',
        material: 'derived_from_observations',
        localRocksAndDust: 'generated_game_detail'
      };
      return {
        sampleHeight: sampleMarsRenderedHeight,
        renderArtifact: candidateSurface,
        readyAssetIds: OLYMPUS_MONS_SURFACE_REGION.assets.map((asset) => asset.id)
      };
    }
  );
  if (publication.status !== 'accepted' || !candidateSurface) {
    candidateSurface?.geometry?.dispose?.();
    candidateSurface?.material?.map?.dispose?.();
    candidateSurface?.material?.dispose?.();
    throw new Error(`Mars surface was not accepted: ${publication.reason || publication.status}`);
  }
  candidateSurface.userData.surfacePublication = publication;
  appCtx.marsSurface = candidateSurface;
  appCtx.scene.add(candidateSurface);
  createMarsRocks(candidateSurface);
  createMarsAtmosphericDust();
  return candidateSurface;
}

function createMarsRocks(surface) {
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x7d4432, roughness: 1, metalness: 0 });
  const regionalRockCount = 620;
  const landingAreaRockCount = 580;
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, regionalRockCount + landingAreaRockCount);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  let seed = 0x4d415253;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < regionalRockCount + landingAreaRockCount; i++) {
    let x;
    let z;
    const isLandingAreaRock = i >= regionalRockCount;
    do {
      const radius = isLandingAreaRock
        ? 18 + Math.sqrt(random()) * 900
        : 220 + Math.sqrt(random()) * MARS_SIZE * 0.46;
      const theta = random() * Math.PI * 2;
      x = (isLandingAreaRock ? MARS_SPAWN.x : 0) + Math.cos(theta) * radius;
      z = (isLandingAreaRock ? MARS_SPAWN.z : 0) + Math.sin(theta) * radius;
    } while (Math.hypot(x - MARS_SPAWN.x, z - MARS_SPAWN.z) < 14);
    const scale = isLandingAreaRock
      ? 0.35 + Math.pow(random(), 2.5) * 4.5
      : 0.7 + Math.pow(random(), 2.2) * 10;
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
  rocks.name = 'Mars Generated Regional Rocks';
  rocks.userData.planetaryBody = 'mars';
  rocks.userData.truthClass = 'generated_game_detail';
  appCtx.marsObjects = appCtx.marsObjects || [];
  appCtx.marsObjects.push(rocks);
  appCtx.scene.add(rocks);
}

function createMarsAtmosphericDust() {
  const count = 720;
  const positions = new Float32Array(count * 3);
  let seed = 0x44555354;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < count; index++) {
    const radius = 40 + Math.sqrt(random()) * 1_300;
    const theta = random() * Math.PI * 2;
    const x = MARS_SPAWN.x + Math.cos(theta) * radius;
    const z = MARS_SPAWN.z + Math.sin(theta) * radius;
    const groundY = MARS_SURFACE_Y + sampleMarsLocalHeight(x, z);
    positions[index * 3] = x;
    positions[index * 3 + 1] = groundY + 2 + Math.pow(random(), 1.8) * 85;
    positions[index * 3 + 2] = z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xd89972,
    size: 1.25,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    sizeAttenuation: true
  });
  const dust = new THREE.Points(geometry, material);
  dust.name = 'Mars Modeled Airborne Dust';
  dust.frustumCulled = false;
  dust.userData.planetaryBody = 'mars';
  dust.userData.truthClass = 'modeled_physics';
  appCtx.marsObjects = appCtx.marsObjects || [];
  appCtx.marsObjects.push(dust);
  appCtx.scene.add(dust);
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
    button.textContent = 'Launch Pathfinder to Solis Reach';
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
  appCtx.scene.background = new THREE.Color(0x6f3628);
  appCtx.scene.fog = new THREE.FogExp2(0x8a4a36, 0.000075);
  if (appCtx.renderer) appCtx.renderer.toneMappingExposure = 0.96;
  if (appCtx.camera) {
    if (!Number.isFinite(earthCameraFar)) earthCameraFar = appCtx.camera.far;
    appCtx.camera.far = Math.max(30000, appCtx.camera.far);
    appCtx.camera.updateProjectionMatrix();
  }
  if (appCtx.moonSurface) appCtx.moonSurface.visible = false;
  (window._moonObjects || []).forEach((object) => { object.visible = false; });
  if (appCtx.moonSphere) appCtx.moonSphere.visible = false;
  appCtx.setLunarEarthVisible?.(false);

  await createMarsSurface();
  if (!retainMarsTransitionOwnership(sessionId)) return false;
  appCtx.refreshBlockBuilderForCurrentLocation?.();
  setMarsObjectsVisible(true);
  enterMarsDriveMode();
  positionPlayerOnMars();
  void appCtx.setPlanetaryVehicle?.('mars');
  if (!retainMarsTransitionOwnership(sessionId)) return false;
  appCtx.setPlanetaryCharacter?.('mars');
  positionPlayerOnMars();
  if (appCtx.carMesh) appCtx.carMesh.visible = true;

  if (appCtx.sun) {
    appCtx.sun.color?.setHex?.(0xffd8b8);
    appCtx.sun.intensity = 1.7;
    appCtx.sun.position.set(-140, 210, 90);
  }
  if (appCtx.ambientLight) appCtx.ambientLight.intensity = 0.38;
  if (appCtx.fillLight) appCtx.fillLight.intensity = 0.2;
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
  if (typeof appCtx.startFastTravelJourney === 'function') {
    return appCtx.startFastTravelJourney('mars', {
      sourceBodyId: 'earth',
      arrive: arriveAtMars,
      transitionDurationMs: 900
    });
  }
  const sessionId = ++marsTransitionSessionId;
  appCtx.prepareEarthDepartureForMars?.();
  await appCtx.showTransitionLoad?.('mars', 900);
  if (!isCurrentMarsTransition(sessionId)) return false;
  return arriveAtMars(sessionId);
}

async function returnFromMars() {
  if (!appCtx.onMars || appCtx.travelingToMoon) return;
  if (typeof appCtx.startSpaceFlightToEarth === 'function') {
    const button = document.getElementById('marsReturnEarthBtn');
    if (button) button.style.display = 'none';
    return appCtx.startSpaceFlightToEarth();
  }
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

registerEnvironmentLifecycle(ENV.MARS, {
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
  prepareEarthDepartureForMars,
  prepareMarsTitleExit,
  returnFromMars,
  sampleMarsLocalHeight
};
