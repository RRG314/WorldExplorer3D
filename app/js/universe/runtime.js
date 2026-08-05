import { ctx as appCtx } from '../shared-context.js?v=55';
import { disposeThreeObjectTree } from '../engine/webgl-lifecycle.js?v=1';
import { getGalaxyEntryDestination, resolveUniverseAddress } from './catalog.js?v=9';
import { updateBlackHoleEncounter, updateBlackHoleVisual } from './black-hole.js?v=2';
import { createDeepSkyLayer, setDeepSkyFrame, updateDeepSkyLayer } from './deep-sky.js?v=2';
import { createRegionEncounter, fireEncounterPulse, updateRegionEncounter } from './encounters.js?v=1';
import { getUniverseNavigationMetrics } from './navigation-scale.js?v=1';
import { createUniverseSky, setUniverseSkyFrame, updateUniverseSky } from './sky-field.js?v=5';
import { createUniverseFrameVisual, updateUniverseFrameVisual } from './visuals.js?v=16';
import {
  closeUniverseNavigator,
  createUniverseNavigator,
  hideUniverseNavigator,
  setUniverseSelection,
  showUniverseNavigator,
  updateUniverseNavigator
} from './ui.js?v=3';
import {
  createWormholeVisual,
  getWormholeRoute,
  startWormholeVisual,
  stopWormholeVisual,
  updateWormholeVisual
} from './wormhole.js?v=1';

const TRANSIT_DURATION_MS = 3400;
const WORMHOLE_DURATION_MS = 4800;
const FRAME_REBASE_DISTANCE = 30000;
const _rebase = new THREE.Vector3();
const _forward = new THREE.Vector3();

const universeRuntime = {
  initialized: false,
  scene: null,
  frameGroup: null,
  transitGroup: null,
  wormholeGroup: null,
  sky: null,
  deepSky: null,
  current: resolveUniverseAddress('sol'),
  selected: resolveUniverseAddress('sol'),
  transition: null,
  pendingEarthReturn: false,
  elapsedSeconds: 0,
  canonicalFrameOffset: new THREE.Vector3(),
  encounter: null,
  captureRecoveryAt: 0,
  galaxyEntry: null,
  inputReady: false
};

function showMessage(text, color = '#8ab4ff') {
  if (typeof appCtx.showSpaceFlightMessage === 'function') {
    appCtx.showSpaceFlightMessage(text, color);
    return;
  }
  console.info('[Universe]', text);
}

function setSolVisibility(visible) {
  appCtx.setSolarSystemFrameVisibility?.(visible);
  if (appCtx.spaceFlight?.earth) appCtx.spaceFlight.earth.visible = visible;
  if (appCtx.spaceFlight?.moon) appCtx.spaceFlight.moon.visible = visible;
  if (appCtx.spaceFlight?.celestialCatalog?.group) appCtx.spaceFlight.celestialCatalog.group.visible = visible;
  const moonButton = document.getElementById('orbitsToggle');
  const marsButton = document.getElementById('marsLandingToggle');
  if (moonButton) moonButton.style.display = visible ? '' : 'none';
  if (marsButton) marsButton.style.display = visible ? '' : 'none';
  const scale = document.getElementById('solarSystemScale');
  if (scale) scale.style.display = visible ? 'block' : 'none';
}

function disposeActiveFrame() {
  if (!universeRuntime.frameGroup) return;
  universeRuntime.scene?.remove(universeRuntime.frameGroup);
  disposeThreeObjectTree(universeRuntime.frameGroup);
  universeRuntime.frameGroup = null;
  universeRuntime.encounter = null;
  universeRuntime.galaxyEntry = null;
}

function resetFlightMotion() {
  if (appCtx.spaceFlight?.velocity) appCtx.spaceFlight.velocity.set(0, 0, 0);
  if (appCtx.spaceFlight?.gravityVelocity) appCtx.spaceFlight.gravityVelocity.set(0, 0, 0);
  if (appCtx.spaceFlight?._gravityVec) appCtx.spaceFlight._gravityVec.set(0, 0, 0);
  appCtx.spaceFlight.speed = 0;
  appCtx.spaceFlight._nearestBody = null;
  appCtx.spaceFlight._manualLandingTarget = null;
  appCtx.spaceFlight._autopilotTarget = null;
  appCtx.spaceFlight._launchSource = null;
}

function positionRocketForFrame(entity) {
  const rocket = appCtx.spaceFlight?.rocket;
  if (!rocket) return;
  if (entity.id === 'sol') {
    const earthPosition = appCtx.getEarthHelioScenePosition?.() || new THREE.Vector3(800, 0, 0);
    rocket.position.copy(earthPosition).add(new THREE.Vector3(0, 180, 420));
    _forward.copy(earthPosition).sub(rocket.position).normalize();
  } else {
    const distance = entity.objectClass === 'nebula' ? 4800
      : entity.objectClass === 'stellar_region' ? 1400
        : entity.objectClass === 'black_hole' ? 1900
          : entity.objectClass === 'galaxy_cluster' ? 2200 : 1100;
    rocket.position.set(0, distance * 0.22, distance);
    _forward.copy(rocket.position).multiplyScalar(-1).normalize();
  }
  rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _forward);
  if (appCtx.spaceFlight.camera) {
    appCtx.spaceFlight.camera.position.copy(rocket.position).add(new THREE.Vector3(0, 35, 90));
    appCtx.spaceFlight.camera.lookAt(rocket.position);
  }
}

function installFrame(entity) {
  disposeActiveFrame();
  universeRuntime.current = entity;
  universeRuntime.galaxyEntry = getGalaxyEntryDestination(entity.id);
  universeRuntime.canonicalFrameOffset.set(0, 0, 0);
  setSolVisibility(entity.id === 'sol');
  setUniverseSkyFrame(universeRuntime.sky, entity, entity.id !== 'sol');
  setDeepSkyFrame(universeRuntime.deepSky, entity, entity.id !== 'sol');
  if (entity.id !== 'sol') {
    universeRuntime.frameGroup = createUniverseFrameVisual(entity);
    universeRuntime.scene.add(universeRuntime.frameGroup);
    universeRuntime.encounter = createRegionEncounter(universeRuntime.frameGroup, entity);
  }
  positionRocketForFrame(entity);
  resetFlightMotion();
  updateUniverseNavigator(universeRuntime);
}

function createTransitVisual(scene) {
  const positions = [];
  const colors = [];
  for (let i = 0; i < 360; i++) {
    const angle = i * 2.399963;
    const radius = 18 + i % 31 * 4.2;
    const z = -900 + i * 5.2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    positions.push(x, y, z, x * 1.08, y * 1.08, z + 110);
    const tone = 0.65 + i % 7 * 0.045;
    colors.push(tone * 0.68, tone * 0.82, tone, tone * 0.68, tone * 0.82, tone);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  lines.name = 'Universe transit field';
  lines.visible = false;
  scene.add(lines);
  return lines;
}

function setSelectedDestination(id) {
  const entity = resolveUniverseAddress(id);
  if (!entity) return false;
  universeRuntime.selected = entity;
  setUniverseSelection(entity);
  updateUniverseNavigator(universeRuntime);
  return true;
}

function travelToUniverseDestination(addressOrId, options = {}) {
  if (!appCtx.spaceFlight?.active || universeRuntime.transition) return false;
  const destination = resolveUniverseAddress(addressOrId);
  if (!destination || destination.id === universeRuntime.current.id) return false;
  universeRuntime.selected = destination;
  universeRuntime.pendingEarthReturn = Boolean(options.returnToEarth);
  universeRuntime.transition = {
    from: universeRuntime.current,
    to: destination,
    startedAt: performance.now(),
    swapped: false,
    kind: options.kind || 'navigation',
    routeLabel: options.routeLabel || ''
  };
  appCtx.spaceFlight.mode = 'transit';
  resetFlightMotion();
  if (universeRuntime.transitGroup) {
    universeRuntime.transitGroup.visible = universeRuntime.transition.kind !== 'wormhole';
  }
  closeUniverseNavigator();
  showMessage(`NAVIGATING TO ${destination.name.toUpperCase()}`, '#8ab4ff');
  updateUniverseNavigator(universeRuntime);
  return true;
}

function returnUniverseToSol(options = {}) {
  if (universeRuntime.current.id === 'sol' && !universeRuntime.transition) {
    if (options.returnToEarth) return forceEarthLandingFromSol();
    return true;
  }
  return travelToUniverseDestination('sol', options);
}

function forceEarthLandingFromSol() {
  universeRuntime.pendingEarthReturn = false;
  const earth = appCtx.getAllSpaceBodies?.().find((body) => body.name === 'Earth');
  if (earth?.position && appCtx.spaceFlight?.rocket) {
    appCtx.spaceFlight.rocket.position.copy(earth.position).add(new THREE.Vector3(0, earth.radius + 150, 0));
    resetFlightMotion();
  }
  appCtx.spaceFlight.destination = 'earth';
  appCtx.spaceFlight._manualLandingTarget = 'Earth';
  return Boolean(appCtx.forceSpaceFlightLanding?.('Earth'));
}

function returnToEarthFromUniverse() {
  if (universeRuntime.current.id === 'sol' && !universeRuntime.transition) return forceEarthLandingFromSol();
  return returnUniverseToSol({ returnToEarth: true });
}

function returnUniverseToSolImmediate() {
  universeRuntime.transition = null;
  universeRuntime.pendingEarthReturn = false;
  if (universeRuntime.transitGroup) universeRuntime.transitGroup.visible = false;
  stopWormholeVisual(universeRuntime.wormholeGroup);
  if (universeRuntime.scene) installFrame(resolveUniverseAddress('sol'));
  return true;
}

function enterCurrentGalaxy() {
  if (!universeRuntime.galaxyEntry || universeRuntime.transition) return false;
  return travelToUniverseDestination(universeRuntime.galaxyEntry.id);
}

function fireCurrentEncounterPulse() {
  if (
    universeRuntime.transition ||
    universeRuntime.encounter?.type !== 'generated-asteroids'
  ) return false;
  const fired = fireEncounterPulse(universeRuntime.encounter, appCtx.spaceFlight.rocket);
  if (fired) showMessage('MINING PULSE FIRED', '#8fe7ff');
  return fired;
}

function setupUniverseInput() {
  if (universeRuntime.inputReady) return;
  universeRuntime.inputReady = true;
  document.addEventListener('keydown', (event) => {
    if (
      event.repeat ||
      event.key.toLowerCase() !== 'x' ||
      !appCtx.spaceFlight?.active ||
      universeRuntime.transition ||
      universeRuntime.encounter?.type !== 'generated-asteroids'
    ) return;
    fireCurrentEncounterPulse();
  });
}

function updateTransition(nowMs) {
  const transition = universeRuntime.transition;
  if (!transition) return;
  const duration = transition.kind === 'wormhole' ? WORMHOLE_DURATION_MS : TRANSIT_DURATION_MS;
  const progress = Math.min(1, (nowMs - transition.startedAt) / duration);
  if (transition.kind === 'wormhole') {
    updateWormholeVisual(
      universeRuntime.wormholeGroup,
      appCtx.spaceFlight.camera,
      progress,
      universeRuntime.elapsedSeconds
    );
  } else if (universeRuntime.transitGroup) {
    universeRuntime.transitGroup.position.copy(appCtx.spaceFlight.rocket.position);
    universeRuntime.transitGroup.rotation.z += 0.012 * (appCtx.spaceFlight._frameScale || 1);
    universeRuntime.transitGroup.material.opacity = Math.sin(progress * Math.PI) * 0.86;
  }
  if (!transition.swapped && progress >= 0.5) {
    transition.swapped = true;
    installFrame(transition.to);
    universeRuntime.transition = transition;
  }
  if (progress < 1) return;
  universeRuntime.transition = null;
  if (universeRuntime.transitGroup) universeRuntime.transitGroup.visible = false;
  stopWormholeVisual(universeRuntime.wormholeGroup);
  appCtx.spaceFlight.mode = 'flying';
  updateUniverseNavigator(universeRuntime);
  showMessage(`${transition.to.name.toUpperCase()} FRAME ACQUIRED`, '#68d8c0');
  if (universeRuntime.pendingEarthReturn && transition.to.id === 'sol') {
    window.setTimeout(forceEarthLandingFromSol, 250);
  }
}

function startCapturedWormhole(route) {
  const destination = resolveUniverseAddress(route.destinationId);
  if (!destination) return false;
  universeRuntime.captureRecoveryAt = performance.now() + WORMHOLE_DURATION_MS + 1500;
  startWormholeVisual(universeRuntime.wormholeGroup);
  const started = travelToUniverseDestination(destination.id, {
    kind: 'wormhole',
    routeLabel: route.label
  });
  if (started) {
    showMessage('SPECULATIVE WORMHOLE TRANSIT - CATALOG ENDPOINTS', '#bf9bff');
  }
  return started;
}

function updateBlackHole(frameScale) {
  const group = universeRuntime.frameGroup;
  if (universeRuntime.transition || universeRuntime.current.objectClass !== 'black_hole' || !group) {
    return;
  }
  updateBlackHoleVisual(group, appCtx.spaceFlight.camera, universeRuntime.elapsedSeconds);
  universeRuntime.encounter = updateBlackHoleEncounter(
    group,
    appCtx.spaceFlight.rocket,
    appCtx.spaceFlight.gravityVelocity,
    frameScale
  );
  if (!universeRuntime.encounter?.captured || performance.now() < universeRuntime.captureRecoveryAt) return;
  const route = getWormholeRoute(universeRuntime.current.id);
  if (route && startCapturedWormhole(route)) return;
  universeRuntime.captureRecoveryAt = performance.now() + 4000;
  const radius = group.userData.blackHole.visualRadius;
  appCtx.spaceFlight.rocket.position.copy(group.position).add(new THREE.Vector3(0, radius * 2.2, radius * 12));
  resetFlightMotion();
  appCtx.spaceFlight.mode = 'flying';
  showMessage('EVENT HORIZON CROSSED - SAFETY RECOVERY', '#ff8066');
}

function rebaseActiveFrame() {
  const rocket = appCtx.spaceFlight?.rocket;
  if (!rocket || rocket.position.length() < FRAME_REBASE_DISTANCE || universeRuntime.transition) return;
  _rebase.copy(rocket.position);
  rocket.position.sub(_rebase);
  appCtx.spaceFlight.camera?.position.sub(_rebase);
  if (universeRuntime.current.objectClass === 'nebula' || universeRuntime.current.objectClass === 'stellar_region') {
    universeRuntime.frameGroup?.position.set(0, 0, 0);
  } else {
    universeRuntime.frameGroup?.position.sub(_rebase);
  }
  universeRuntime.transitGroup?.position.sub(_rebase);
  universeRuntime.canonicalFrameOffset.add(_rebase);
}

function getUniverseHudTarget() {
  if (universeRuntime.current.id === 'sol') return null;
  const group = universeRuntime.frameGroup;
  const radius = universeRuntime.current.objectClass === 'black_hole'
    ? group?.userData?.blackHole?.visualRadius || 100
    : universeRuntime.current.objectClass === 'planetary_system' ? 24
      : universeRuntime.current.objectClass === 'nebula' ? 240
        : universeRuntime.current.objectClass === 'stellar_region' ? 180 : 80;
  return {
    name: universeRuntime.current.name,
    position: group?.position || new THREE.Vector3(),
    radius,
    landable: false,
    objectClass: universeRuntime.current.objectClass,
    address: universeRuntime.current.address,
    encounter: universeRuntime.encounter,
    navigation: getUniverseNavigationMetrics(
      universeRuntime.current,
      appCtx.spaceFlight?.rocket,
      universeRuntime.canonicalFrameOffset,
      appCtx.spaceFlight?.speed
    )
  };
}

function getUniverseGravityBodies() {
  if (universeRuntime.current.objectClass !== 'planetary_system') return [];
  return (universeRuntime.frameGroup?.userData?.gravityBodies || []).map((mesh) => {
    const position = new THREE.Vector3();
    mesh.getWorldPosition(position);
    const planet = mesh.userData.planet;
    return {
      name: mesh.name,
      position,
      radius: planet ? Math.max(3.5, Math.min(10, Number(planet.radiusEarth || 1) * 4.5)) :
        Math.max(18, Math.min(38, 24 + Number(universeRuntime.current.physical?.hostMassSolar || 1) * 8)),
      massKg: mesh.userData.massKg,
      physicalRadiusKm: mesh.userData.physicalRadiusKm,
      mesh,
      landable: false
    };
  });
}

function updateUniverseRuntime(frameSeconds = 1 / 60) {
  if (!universeRuntime.initialized || !appCtx.spaceFlight?.active) return;
  const frameScale = appCtx.spaceFlight._frameScale || 1;
  universeRuntime.elapsedSeconds += Math.min(0.1, Math.max(0, frameSeconds));
  updateTransition(performance.now());
  updateUniverseFrameVisual(universeRuntime.frameGroup, universeRuntime.elapsedSeconds, frameScale);
  updateBlackHole(frameScale);
  if (universeRuntime.encounter?.type === 'generated-asteroids') {
    updateRegionEncounter(universeRuntime.encounter, frameSeconds);
  }
  rebaseActiveFrame();
  updateUniverseSky(universeRuntime.sky, appCtx.spaceFlight.rocket);
  updateDeepSkyLayer(
    universeRuntime.deepSky,
    appCtx.spaceFlight.rocket,
    universeRuntime.elapsedSeconds
  );
}

function initUniverseRuntime(scene) {
  if (!scene) return null;
  if (universeRuntime.scene !== scene) {
    disposeActiveFrame();
    universeRuntime.scene = scene;
    universeRuntime.transitGroup = createTransitVisual(scene);
    universeRuntime.wormholeGroup = createWormholeVisual(scene);
    universeRuntime.sky = createUniverseSky(scene);
    universeRuntime.deepSky = createDeepSkyLayer(scene);
    universeRuntime.initialized = true;
    universeRuntime.transition = null;
    universeRuntime.pendingEarthReturn = false;
    universeRuntime.current = resolveUniverseAddress('sol');
    universeRuntime.selected = universeRuntime.current;
    setSolVisibility(true);
    setUniverseSkyFrame(universeRuntime.sky, universeRuntime.current, false);
    setDeepSkyFrame(universeRuntime.deepSky, universeRuntime.current, false);
  }
  setupUniverseInput();
  createUniverseNavigator({
    onSelection: setSelectedDestination,
    onTravel: travelToUniverseDestination,
    onEnterGalaxy: enterCurrentGalaxy,
    onPulse: fireCurrentEncounterPulse,
    onReturnSol: () => returnUniverseToSol(),
    onReturnEarth: returnToEarthFromUniverse
  });
  updateUniverseNavigator(universeRuntime);
  return universeRuntime;
}

function showUniverseUI() {
  showUniverseNavigator();
  updateUniverseNavigator(universeRuntime);
}

function hideUniverseUI() {
  hideUniverseNavigator();
}

Object.assign(appCtx, {
  getUniverseHudTarget,
  getUniverseGravityBodies,
  hideUniverseUI,
  initUniverseRuntime,
  returnToEarthFromUniverse,
  returnUniverseToSol,
  returnUniverseToSolImmediate,
  setUniverseDestination: setSelectedDestination,
  showUniverseUI,
  travelToUniverseDestination,
  universeRuntime,
  updateUniverseRuntime
});

export {
  getUniverseHudTarget,
  getUniverseGravityBodies,
  hideUniverseUI,
  initUniverseRuntime,
  returnToEarthFromUniverse,
  returnUniverseToSol,
  returnUniverseToSolImmediate,
  showUniverseUI,
  travelToUniverseDestination,
  universeRuntime,
  updateUniverseRuntime
};
