import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  createAuxiliaryRenderer,
  disposeThreeObjectTree,
  disposeThreeRenderer
} from "../engine/webgl-lifecycle.js?v=2";
import { SPACE_CONSTANTS } from "./constants.js?v=3";
import { PLANETARY_BODIES, configureColorTexture } from "../planetary/catalog.js?v=1";
import { createSpaceCelestialCatalog } from "./celestial-catalog.js?v=5";
import { initUniverseRuntime, releaseUniverseRuntimeScene } from "../universe/runtime.js?v=36";
import { releaseGaiaSkyLayers } from '../sky/gaia-catalog.js?v=4';
import { createExpeditionSpacecraftMesh } from "./expedition-spacecraft-mesh.js?v=5";
import { createExpeditionPodMesh } from './expedition-pod-mesh.js?v=7';
import { createSolisReachExteriorMesh } from './solis-reach-exterior-mesh.js?v=1';
import { SPACE_CRAFT_IDENTITY } from './craft-identity.js?v=1';
import { restoreExpeditionDiscoveries } from '../expedition/contact-authority.js?v=4';
import { releaseAtmosphericFlightPresentation } from './atmospheric-flight-presentation.js?v=1';

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

function orientSpacecraftForForward(rocket, forwardInput, preferredUpInput = new THREE.Vector3(0, 1, 0)) {
  if (!rocket || !forwardInput) return false;
  const forward = forwardInput.clone().normalize();
  if (forward.lengthSq() <= 1e-8) return false;
  const preferredUp = preferredUpInput.clone().normalize();
  const up = preferredUp.addScaledVector(forward, -preferredUp.dot(forward));
  if (up.lengthSq() <= 1e-6) {
    up.set(0, 0, 1).addScaledVector(forward, -forward.z);
  }
  up.normalize();
  const right = up.clone().cross(forward).normalize();
  const localZ = up.clone().negate();
  const basis = new THREE.Matrix4().makeBasis(right, forward, localZ);
  rocket.quaternion.setFromRotationMatrix(basis).normalize();
  return true;
}

export function ensureSolisReachDockTarget(options = {}) {
  const scene = appCtx.spaceFlight?.scene;
  const earth = appCtx.spaceFlight?.earth;
  if (!scene) return null;
  let starship = scene.getObjectByName(`${SPACE_CRAFT_IDENTITY.starship.name} Orbital Starship`);
  if (!starship) {
    starship = createSolisReachExteriorMesh();
    scene.add(starship);
  } else if (starship.parent !== scene) {
    const worldPosition = starship.getWorldPosition(new THREE.Vector3());
    const worldQuaternion = starship.getWorldQuaternion(new THREE.Quaternion());
    scene.attach(starship);
    starship.position.copy(worldPosition);
    starship.quaternion.copy(worldQuaternion);
  }
  const rocket = appCtx.spaceFlight?.rocket;
  const rendezvousFrameId = String(appCtx.universeRuntime?.current?.id || 'sol');
  const needsLocalAnchor = starship.userData.rendezvousFrameId !== rendezvousFrameId;
  if (options.nearActiveCraft === true && rocket) {
    if (needsLocalAnchor) {
      const approach = new THREE.Vector3(0, 1, 0).applyQuaternion(rocket.quaternion).normalize();
      if (approach.lengthSq() <= 1e-8) approach.set(0, 0, -1);
      starship.position.copy(rocket.position).addScaledVector(approach, Math.max(90, Number(options.distance) || 130));
      orientSpacecraftForForward(starship, approach.clone().negate());
      // Anchor once per local Universe frame. Re-running acquisition in the same
      // frame must not move the ship farther away from an approaching
      // pod and create an endless leapfrog rendezvous.
      starship.userData.rendezvousFrameId = rendezvousFrameId;
    }
  } else if (earth) {
    const earthPosition = earth.getWorldPosition(new THREE.Vector3());
    starship.position.copy(earthPosition).add(new THREE.Vector3(0, SPACE_CONSTANTS.EARTH_SIZE + 260, 0));
  }
  const session = appCtx.getSpaceTravelSession?.();
  starship.visible = session?.active === true
    && session.activeCraftId === SPACE_CRAFT_IDENTITY.pod.id
    && session.phase === 'rendezvous';
  appCtx.spaceFlight.solisReachDockTarget = starship;
  return starship;
}

export function getSolisReachDockTarget() {
  const starship = appCtx.spaceFlight?.solisReachDockTarget;
  const session = appCtx.getSpaceTravelSession?.();
  if (session?.activeCraftId !== SPACE_CRAFT_IDENTITY.pod.id || session.phase !== 'rendezvous') return null;
  if (!starship?.visible || !starship.parent) return null;
  const dockingCollar = starship.getObjectByName('solis-reach-docking-collar');
  const position = new THREE.Vector3();
  (dockingCollar || starship).getWorldPosition(position);
  const approachDirection = new THREE.Vector3(0, 0, 1);
  if (dockingCollar) {
    approachDirection.applyQuaternion(dockingCollar.getWorldQuaternion(new THREE.Quaternion())).normalize();
  } else {
    approachDirection.applyQuaternion(starship.getWorldQuaternion(new THREE.Quaternion())).normalize();
  }
  const rocket = appCtx.spaceFlight?.rocket;
  const distance = rocket?.position?.distanceTo?.(position) ?? Infinity;
  const relativeSpeed = appCtx.spaceFlight?.velocity?.length?.() || Number(appCtx.spaceFlight?.speed || 0);
  const radius = Number(starship.userData.dockingRadius || 18);
  return {
    id: 'solis-reach-rendezvous',
    name: SPACE_CRAFT_IDENTITY.starship.name,
    position,
    approachDirection,
    radius,
    distance,
    relativeSpeed,
    canDock: distance < radius + 24 && relativeSpeed <= 1.35,
    mesh: starship,
    landable: false,
    targetKind: 'expedition-dock'
  };
}

export function orientActiveCraftTowardSolisReach(options = {}) {
  const rocket = appCtx.spaceFlight?.rocket;
  const target = getSolisReachDockTarget();
  if (!rocket || !target?.position) return false;
  const forward = target.position.clone().sub(rocket.position);
  if (forward.lengthSq() <= 1e-8) return false;
  const radialUp = rocket.position.clone().normalize();
  orientSpacecraftForForward(rocket, forward, radialUp.lengthSq() > 1e-8 ? radialUp : undefined);
  if (options.snapCamera !== false) appCtx.spaceFlight._snapCameraToCraft = true;
  return true;
}

export function orientActiveCraftForAtmosphere(bodyPosition) {
  const rocket = appCtx.spaceFlight?.rocket;
  if (!rocket || !bodyPosition) return false;
  const radialUp = rocket.position.clone().sub(bodyPosition).normalize();
  if (radialUp.lengthSq() <= 1e-8) return false;
  const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(rocket.quaternion);
  forward.addScaledVector(radialUp, -forward.dot(radialUp));
  if (forward.lengthSq() <= 1e-6) {
    forward.set(1, 0, 0).addScaledVector(radialUp, -radialUp.x);
  }
  orientSpacecraftForForward(rocket, forward, radialUp);
  appCtx.spaceFlight._snapCameraToCraft = true;
  return true;
}

export function positionSpacecraftAtSolisReachDock(distance = 36) {
  const target = getSolisReachDockTarget();
  const rocket = appCtx.spaceFlight?.rocket;
  if (!target || !rocket) return false;
  const approachDirection = target.approachDirection?.clone?.().normalize()
    || target.position.clone().normalize();
  rocket.position.copy(target.position).addScaledVector(approachDirection, Math.max(target.radius + 8, Number(distance) || 36));
  orientSpacecraftForForward(rocket, approachDirection.clone().negate());
  appCtx.spaceFlight.velocity?.set?.(0, 0, 0);
  appCtx.spaceFlight.gravityVelocity?.set?.(0, 0, 0);
  appCtx.spaceFlight.speed = 0;
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

function buildActiveSpaceCraft(craftId) {
  if (craftId === SPACE_CRAFT_IDENTITY.pod.id) {
    const pod = createExpeditionPodMesh();
    pod.name = `${SPACE_CRAFT_IDENTITY.pod.name} Flight Pod`;
    pod.userData.spaceCraftId = SPACE_CRAFT_IDENTITY.pod.id;
    pod.scale.setScalar(0.62);
    return pod;
  }
  const starship = createExpeditionSpacecraftMesh();
  starship.name = `${SPACE_CRAFT_IDENTITY.starship.name} Exploration Starship`;
  starship.userData.spaceCraftId = SPACE_CRAFT_IDENTITY.starship.id;
  starship.scale.setScalar(1.45);
  return starship;
}

function syncOrbitalStarshipVisibility() {
  const target = appCtx.spaceFlight?.solisReachDockTarget;
  if (!target) return;
  const session = appCtx.getSpaceTravelSession?.();
  target.visible = session?.active === true
    && session.activeCraftId === SPACE_CRAFT_IDENTITY.pod.id
    && session.phase === 'rendezvous';
}

function replaceActiveSpaceCraft(craftId) {
  const scene = appCtx.spaceFlight?.scene;
  if (!scene) return false;
  const current = appCtx.spaceFlight.rocket;
  if (current?.userData?.spaceCraftId === craftId) {
    appCtx.updateSpaceTravelSession?.({ activeCraftId: craftId, reason: 'active-craft-confirmed' });
    syncOrbitalStarshipVisibility();
    return true;
  }
  const position = current?.position?.clone?.() || new THREE.Vector3();
  const quaternion = current?.quaternion?.clone?.() || new THREE.Quaternion();
  if (current) {
    current.parent?.remove?.(current);
    disposeThreeObjectTree(current);
  }
  const next = buildActiveSpaceCraft(craftId);
  next.position.copy(position);
  next.quaternion.copy(quaternion);
  scene.add(next);
  appCtx.spaceFlight.rocket = next;
  appCtx.updateSpaceTravelSession?.({ activeCraftId: craftId, reason: 'active-craft-changed' });
  syncOrbitalStarshipVisibility();
  return true;
}

function createSpaceRocket() {
  const craftId = appCtx.getActiveSpaceCraftId?.() || SPACE_CRAFT_IDENTITY.starship.id;
  appCtx.spaceFlight.rocket = buildActiveSpaceCraft(craftId);
  appCtx.spaceFlight.scene.add(appCtx.spaceFlight.rocket);
  syncOrbitalStarshipVisibility();
}

export function setExpeditionPodFlightPresentation(active) {
  return active === true
    ? replaceActiveSpaceCraft(SPACE_CRAFT_IDENTITY.pod.id)
    : replaceActiveSpaceCraft(SPACE_CRAFT_IDENTITY.starship.id);
}

export function setSolisReachFlightPresentation(active) {
  if (active === true) return replaceActiveSpaceCraft(SPACE_CRAFT_IDENTITY.starship.id);
  syncOrbitalStarshipVisibility();
  return true;
}

export function updateExpeditionPodFlightPresentation(dt = 0) {
  const pod = appCtx.spaceFlight?.rocket;
  if (pod?.userData?.spaceCraftId !== SPACE_CRAFT_IDENTITY.pod.id) return false;
  const phase = appCtx.getSpaceTravelSession?.()?.phase || '';
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
    touchdown.visible = ['descent', 'ascent', 'launch'].includes(phase);
    touchdown.children.forEach((light, index) => { light.material.opacity = 0.6 + Math.sin(time * 6 + index) * 0.25; });
  }
  const docking = pod.getObjectByName('podDockingGuide');
  if (docking) {
    docking.visible = phase === 'rendezvous';
    docking.rotation.y += Math.max(0, Number(dt) || 0) * 0.32;
    docking.position.y = Math.sin(time * 1.8) * 0.22;
  }
  if (['launch', 'ascent'].includes(phase)) {
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
  orientSpacecraftForForward(appCtx.spaceFlight.rocket, launchDirection);

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
  orientSpacecraftForForward(
    appCtx.spaceFlight.rocket,
    earthPos.clone().sub(appCtx.spaceFlight.rocket.position)
  );

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
  const scene = appCtx.spaceFlight.scene;
  releaseAtmosphericFlightPresentation();
  appCtx.resetSolarSystemRuntime?.();
  releaseUniverseRuntimeScene(scene);
  releaseGaiaSkyLayers(appCtx.spaceFlight.celestialCatalog?.gaiaSky);
  if (scene) {
    disposeThreeObjectTree(scene);
    scene.clear();
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
  appCtx.spaceFlight.solisReachDockTarget = null;
  appCtx.spaceFlight.celestialCatalog = null;
  appCtx.spaceFlight._snapCameraToCraft = false;
}
