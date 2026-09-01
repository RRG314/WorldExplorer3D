import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  createAuxiliaryRenderer,
  disposeThreeObjectTree,
  disposeThreeRenderer
} from "../engine/webgl-lifecycle.js?v=1";
import { SPACE_CONSTANTS } from "./constants.js?v=1";
import { PLANETARY_BODIES, configureColorTexture } from "../planetary/catalog.js?v=1";
import { createSpaceCelestialCatalog } from "./celestial-catalog.js?v=5";
import { initUniverseRuntime } from "../universe/runtime.js?v=30";
import { createExpeditionSpacecraftMesh } from "./expedition-spacecraft-mesh.js?v=3";
import { createExpeditionPodMesh } from './expedition-pod-mesh.js?v=2';
import { restoreExpeditionDiscoveries } from '../expedition/contact-authority.js?v=4';

export function createSpaceFlightScene(options = {}) {
  console.log("Creating space flight scene...");

  appCtx.spaceFlight.scene = new THREE.Scene();
  appCtx.spaceFlight.scene.background = new THREE.Color(0x000008);
  appCtx.spaceFlight.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.5, 450000);
  if (!appCtx.spaceFlight.renderer) {
    appCtx.spaceFlight.renderer = createAuxiliaryRenderer({
      canvas: appCtx.spaceFlight.canvas,
      pixelRatioCap: 1.25,
      size: { width: window.innerWidth, height: window.innerHeight },
      optionsList: [
        {
          antialias: window.devicePixelRatio <= 1,
          alpha: false,
          powerPreference: 'low-power'
        },
        {
          antialias: false,
          alpha: false,
          powerPreference: 'low-power'
        },
        {
          antialias: false,
          alpha: false
        }
      ]
    });
  } else {
    appCtx.spaceFlight.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    appCtx.spaceFlight.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
  if (!appCtx.spaceFlight.renderer) {
    throw new Error('Space renderer unavailable');
  }

  appCtx.spaceFlight.scene.add(new THREE.AmbientLight(0x303050, 0.5));
  const sunLight = new THREE.DirectionalLight(0xfff8e8, 1.6);
  sunLight.position.set(300, 200, 100);
  appCtx.spaceFlight.scene.add(sunLight);
  const rimLight = new THREE.DirectionalLight(0x6688cc, 0.4);
  rimLight.position.set(-200, -100, -300);
  appCtx.spaceFlight.scene.add(rimLight);

  createSpaceCelestialCatalog(appCtx.spaceFlight.scene);
  createSpaceEarth();
  createSpaceMoon();
  createSpaceRocket();

  appCtx.spaceFlight._extendedSpaceLoaded = false;
  if (options.includeExtendedSpace !== false) ensureExtendedSpaceScene();

  resetSpaceFlightForMoon();
  console.log("Space flight scene ready!");
}

export function ensureExtendedSpaceScene() {
  if (!appCtx.spaceFlight?.scene) return false;
  if (appCtx.spaceFlight._extendedSpaceLoaded) return true;
  if (typeof appCtx.initSolarSystem === 'function') {
    appCtx.initSolarSystem(appCtx.spaceFlight.scene);
  }
  restoreExpeditionDiscoveries();
  initUniverseRuntime(appCtx.spaceFlight.scene);
  appCtx.spaceFlight._extendedSpaceLoaded = true;
  return true;
}

function createSpaceEarth() {
  const earthGeo = new THREE.SphereGeometry(SPACE_CONSTANTS.EARTH_SIZE, 64, 48);
  const earthTexture = configureColorTexture(
    new THREE.TextureLoader().load(PLANETARY_BODIES.earth.texture),
    appCtx.spaceFlight.renderer
  );
  const earthMat = new THREE.MeshPhongMaterial({
    map: earthTexture,
    color: 0xffffff,
    emissive: 0x050b14,
    specular: 0x101820,
    shininess: 4
  });
  appCtx.spaceFlight.earth = new THREE.Mesh(earthGeo, earthMat);
  appCtx.spaceFlight.scene.add(appCtx.spaceFlight.earth);

  const atmoGeo = new THREE.SphereGeometry(SPACE_CONSTANTS.EARTH_SIZE * 1.035, 48, 32);
  const atmoMat = new THREE.MeshBasicMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    side: THREE.FrontSide
  });
  const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
  atmosphere.renderOrder = 2;
  appCtx.spaceFlight.earth.add(atmosphere);

  const ringGeo = new THREE.TorusGeometry(SPACE_CONSTANTS.EARTH_SIZE * 1.5, 3, 12, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.6
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.name = 'landingRing';
  ring.visible = false;
  appCtx.spaceFlight.earth.add(ring);

  const moonOrbitRadius = 120;
  const moonOrbitGeo = new THREE.BufferGeometry();
  const moonOrbitPts = [];
  for (let i = 0; i <= 64; i++) {
    const angle = i / 64 * Math.PI * 2;
    moonOrbitPts.push(new THREE.Vector3(
      Math.cos(angle) * moonOrbitRadius,
      20,
      Math.sin(angle) * moonOrbitRadius
    ));
  }
  moonOrbitGeo.setFromPoints(moonOrbitPts);
  const moonOrbitMat = new THREE.LineBasicMaterial({ color: 0xaaaacc, transparent: true, opacity: 0.2 });
  const moonOrbitLine = new THREE.LineLoop(moonOrbitGeo, moonOrbitMat);
  moonOrbitLine.name = 'moonOrbitRing';
  appCtx.spaceFlight.earth.add(moonOrbitLine);
}

function createSpaceMoon() {
  const moonGeo = new THREE.SphereGeometry(SPACE_CONSTANTS.MOON_SIZE, 48, 32);
  const moonTexture = configureColorTexture(
    new THREE.TextureLoader().load(PLANETARY_BODIES.moon.texture),
    appCtx.spaceFlight.renderer
  );
  const moonMat = new THREE.MeshPhongMaterial({
    map: moonTexture,
    color: 0xffffff,
    emissive: 0x101010,
    specular: 0x202020,
    shininess: 5
  });
  appCtx.spaceFlight.moon = new THREE.Mesh(moonGeo, moonMat);
  appCtx.spaceFlight.scene.add(appCtx.spaceFlight.moon);

  const ringGeo = new THREE.TorusGeometry(SPACE_CONSTANTS.MOON_SIZE * 1.8, 2, 12, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.6
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.name = 'landingRing';
  ring.visible = false;
  appCtx.spaceFlight.moon.add(ring);
}

function createSpaceRocket() {
  appCtx.spaceFlight.rocket = createExpeditionSpacecraftMesh();
  appCtx.spaceFlight.scene.add(appCtx.spaceFlight.rocket);
  const phase = appCtx.getInterstellarExpeditionSnapshot?.()?.podJourney?.phase;
  if (['ship_launch', 'local_flight', 'descent', 'surface_launch', 'rendezvous'].includes(phase)) {
    setExpeditionPodFlightPresentation(true);
  }
}

export function setExpeditionPodFlightPresentation(active) {
  const rocket = appCtx.spaceFlight?.rocket;
  if (!rocket) return false;
  const current = rocket.userData.expeditionPodPresentation;
  if (active === true) {
    if (current?.pod) return true;
    const originals = rocket.children.map((child) => ({
      child,
      visible: child.visible,
      name: child.name
    }));
    originals.forEach((entry) => {
      entry.child.visible = false;
      if (['engineGlow', 'exhaust'].includes(entry.child.name)) entry.child.name = `wayfinder-${entry.child.name}`;
    });
    const pod = createExpeditionPodMesh();
    rocket.add(pod);
    rocket.userData.expeditionPodPresentation = { pod, originals };
    return true;
  }
  if (!current?.pod) return true;
  current.pod.parent?.remove?.(current.pod);
  disposeThreeObjectTree(current.pod);
  current.originals.forEach((entry) => {
    entry.child.visible = entry.visible;
    entry.child.name = entry.name;
  });
  delete rocket.userData.expeditionPodPresentation;
  return true;
}

export function updateExpeditionPodFlightPresentation(dt = 0) {
  const pod = appCtx.spaceFlight?.rocket?.getObjectByName('Surveyor Pathfinder Pod');
  if (!pod) return false;
  const phase = appCtx.getInterstellarExpeditionSnapshot?.()?.podJourney?.phase || '';
  const time = performance.now() * 0.001;
  const plasma = pod.getObjectByName('podEntryPlasma');
  if (plasma) {
    plasma.visible = phase === 'descent';
    plasma.rotation.y += Math.max(0, Number(dt) || 0) * 0.8;
    plasma.children.forEach((layer, index) => {
      if (layer.material) layer.material.opacity = Number(layer.userData.baseOpacity || 0.1) * (0.76 + Math.sin(time * (4.5 + index)) * 0.24);
    });
  }
  const touchdown = pod.getObjectByName('podTouchdownLights');
  if (touchdown) {
    touchdown.visible = ['descent', 'surface_launch'].includes(phase);
    touchdown.children.forEach((light, index) => { light.material.opacity = 0.6 + Math.sin(time * 6 + index) * 0.25; });
  }
  const docking = pod.getObjectByName('podDockingGuide');
  if (docking) {
    docking.visible = phase === 'rendezvous';
    docking.rotation.y += Math.max(0, Number(dt) || 0) * 0.32;
    docking.position.y = Math.sin(time * 1.8) * 0.22;
  }
  if (['ship_launch', 'surface_launch'].includes(phase)) {
    const glow = pod.getObjectByName('engineGlow');
    if (glow) glow.scale.y = 1.15 + Math.sin(time * 18) * 0.12;
  }
  return true;
}

export function resetSpaceFlightForMoon() {
  const earthPos = typeof appCtx.getEarthHelioScenePosition === 'function'
    ? appCtx.getEarthHelioScenePosition()
    : new THREE.Vector3(800, 0, 0);

  appCtx.spaceFlight.earth.position.copy(earthPos);

  const moonPos = typeof appCtx.getMoonScenePosition === 'function'
    ? appCtx.getMoonScenePosition(earthPos)
    : new THREE.Vector3(earthPos.x + 120, earthPos.y + 20, earthPos.z);
  appCtx.spaceFlight.moon.position.copy(moonPos);

  const moonDirection = moonPos.clone().sub(earthPos).normalize();
  const preferredView = new THREE.Vector3(0.64, 0.3, 0.71).normalize();
  const launchDirection = new THREE.Vector3().crossVectors(
    new THREE.Vector3(0, 1, 0),
    moonDirection
  ).normalize();
  if (launchDirection.dot(preferredView) < 0) launchDirection.negate();
  launchDirection.multiplyScalar(0.94).add(new THREE.Vector3(0, 0.34, 0)).normalize();
  appCtx.spaceFlight.rocket.position.copy(earthPos).addScaledVector(
    launchDirection,
    SPACE_CONSTANTS.EARTH_SIZE + 8
  );
  appCtx.spaceFlight.rocket.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    launchDirection
  );

  appCtx.spaceFlight.velocity.set(0, 0, 0);
  if (appCtx.spaceFlight.gravityVelocity) appCtx.spaceFlight.gravityVelocity.set(0, 0, 0);
  if (appCtx.spaceFlight._gravityVec) appCtx.spaceFlight._gravityVec.set(0, 0, 0);
  appCtx.spaceFlight.speed = 0;
  appCtx.spaceFlight.keys = {};
  appCtx.spaceFlight._lastFrameMs = 0;
  appCtx.spaceFlight._frameScale = 1;
  appCtx.spaceFlight._launchSource = 'Earth';
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  appCtx.spaceFlight._manualLandingTarget = 'Moon';
  appCtx.spaceFlight._autopilotTarget = null;

  if (typeof appCtx.setSolarSystemCenter === 'function') {
    appCtx.setSolarSystemCenter(new THREE.Vector3(0, 0, 0));
  }

  const landBtn = document.getElementById('sfLandBtn');
  if (landBtn) {
    landBtn.disabled = true;
    landBtn.style.opacity = '0.5';
    landBtn.style.background = '#667eea';
  }
}

export function resetSpaceFlightForEarth() {
  const earthPos = typeof appCtx.getEarthHelioScenePosition === 'function'
    ? appCtx.getEarthHelioScenePosition()
    : new THREE.Vector3(800, 0, 0);

  appCtx.spaceFlight.earth.position.copy(earthPos);

  const moonPos = typeof appCtx.getMoonScenePosition === 'function'
    ? appCtx.getMoonScenePosition(earthPos)
    : new THREE.Vector3(earthPos.x + 120, earthPos.y + 20, earthPos.z);
  appCtx.spaceFlight.moon.position.copy(moonPos);

  appCtx.spaceFlight.rocket.position.set(
    moonPos.x,
    moonPos.y + SPACE_CONSTANTS.MOON_SIZE + 8,
    moonPos.z
  );
  appCtx.spaceFlight.rocket.quaternion.identity();

  appCtx.spaceFlight.velocity.set(0, 0, 0);
  if (appCtx.spaceFlight.gravityVelocity) appCtx.spaceFlight.gravityVelocity.set(0, 0, 0);
  if (appCtx.spaceFlight._gravityVec) appCtx.spaceFlight._gravityVec.set(0, 0, 0);
  appCtx.spaceFlight.speed = 0;
  appCtx.spaceFlight.keys = {};
  appCtx.spaceFlight._lastFrameMs = 0;
  appCtx.spaceFlight._frameScale = 1;
  appCtx.spaceFlight._launchSource = 'Moon';
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  appCtx.spaceFlight._manualLandingTarget = 'Earth';
  appCtx.spaceFlight._autopilotTarget = null;

  if (typeof appCtx.setSolarSystemCenter === 'function') {
    appCtx.setSolarSystemCenter(new THREE.Vector3(0, 0, 0));
  }

  const landBtn = document.getElementById('sfLandBtn');
  if (landBtn) {
    landBtn.disabled = true;
    landBtn.style.opacity = '0.5';
    landBtn.style.background = '#667eea';
  }
}

export function resetSpaceFlightForMars() {
  resetSpaceFlightForMoon();
  appCtx.spaceFlight.destination = 'mars';
  appCtx.spaceFlight._manualLandingTarget = 'Mars';
}

export function destroySpaceFlightScene() {
  appCtx.resetSolarSystemRuntime?.();
  if (appCtx.spaceFlight.scene) {
    disposeThreeObjectTree(appCtx.spaceFlight.scene);
  }
  appCtx.spaceFlight.renderer?.info?.reset?.();
  appCtx.spaceFlight.renderer?.clear?.();
  appCtx.spaceFlight.renderer = disposeThreeRenderer(appCtx.spaceFlight.renderer);
  appCtx.spaceFlight.scene = null;
  appCtx.spaceFlight._extendedSpaceLoaded = false;
  appCtx.spaceFlight.camera = null;
  appCtx.spaceFlight.rocket = null;
  appCtx.spaceFlight.earth = null;
  appCtx.spaceFlight.moon = null;
}
