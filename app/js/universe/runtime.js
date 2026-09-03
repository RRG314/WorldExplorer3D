import { ctx as appCtx } from '../shared-context.js?v=55';
import { getAstronomicalBody, normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=3';
import { disposeThreeObjectTree } from '../engine/webgl-lifecycle.js?v=1';
import { getGalaxyEntryDestination, getUniverseFrame, resolveUniverseAddress } from './catalog.js?v=11';
import { updateBlackHoleEncounter, updateBlackHoleVisual } from './black-hole.js?v=4';
import { createDeepSkyLayer, setDeepSkyFrame, updateDeepSkyLayer } from './deep-sky.js?v=3';
import { createRegionEncounter, fireEncounterPulse, updateRegionEncounter } from './encounters.js?v=1';
import { getUniverseNavigationMetrics } from './navigation-scale.js?v=1';
import {
  createUniverseCourse,
  setUniverseCourseGuidance,
  setUniverseCourseStatus,
  UNIVERSE_GUIDANCE_MODE
} from './course-authority.js?v=3';
import { SPACE_CONSTANTS } from '../space/constants.js?v=3';
import { initDestinationMissionRuntime, updateDestinationMissionRuntime } from './mission-runtime.js?v=7';
import { createUniverseSky, setUniverseSkyFrame, updateUniverseSky } from './sky-field.js?v=6';
import { releaseGaiaSkyLayers } from '../sky/gaia-catalog.js?v=4';
import {
  createUniverseFrameVisual,
  getUniverseDestinationMesh,
  setUniverseCourseMarker,
  updateUniverseFrameVisual
} from './visuals.js?v=19';
import {
  closeUniverseNavigator,
  createUniverseNavigator,
  hideUniverseNavigator,
  setUniverseSelection,
  showUniverseNavigator,
  updateUniverseCourseCue,
  updateUniverseNavigator
} from './ui.js?v=8';
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
const _courseTarget = new THREE.Vector3();
const _courseDirection = new THREE.Vector3();
const _courseCameraDirection = new THREE.Vector3();
const _courseCameraLocal = new THREE.Vector3();
const _courseCameraInverse = new THREE.Quaternion();
const _courseDesiredRotation = new THREE.Quaternion();
const _courseProjected = new THREE.Vector3();
const _courseDesiredVelocity = new THREE.Vector3();
const _courseForwardAxis = new THREE.Vector3(0, 1, 0);
const _localCourseTarget = {
  destination: null,
  position: _courseTarget,
  radius: 0,
  mesh: null
};
const _localCourseCue = {
  visible: false,
  onScreen: false,
  x: 0,
  y: 0,
  angleDeg: 0,
  label: '',
  assisted: false,
  ndcX: 0,
  ndcY: 0
};
const missionScanEffects = [];

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
  course: null,
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
  missionScanEffects.length = 0;
  universeRuntime.scene?.remove(universeRuntime.frameGroup);
  disposeThreeObjectTree(universeRuntime.frameGroup);
  universeRuntime.frameGroup = null;
  universeRuntime.encounter = null;
  universeRuntime.galaxyEntry = null;
}

function releaseUniverseRuntimeScene(scene = universeRuntime.scene, options = {}) {
  if (scene && universeRuntime.scene && scene !== universeRuntime.scene) return false;
  if (options.disposeObjects === true) {
    const ownedRoots = new Set([
      universeRuntime.frameGroup,
      universeRuntime.transitGroup,
      universeRuntime.wormholeGroup,
      universeRuntime.sky?.group,
      universeRuntime.deepSky?.group
    ].filter(Boolean));
    ownedRoots.forEach((root) => {
      root.parent?.remove?.(root);
      disposeThreeObjectTree(root);
      root.clear?.();
    });
  }
  missionScanEffects.length = 0;
  if (universeRuntime.sky) {
    universeRuntime.sky.disposed = true;
    releaseGaiaSkyLayers(universeRuntime.sky.gaiaSky);
  }
  if (universeRuntime.deepSky) {
    universeRuntime.deepSky.sprites = [];
    universeRuntime.deepSky.currentEntity = null;
  }
  Object.assign(universeRuntime, {
    initialized: false,
    scene: null,
    frameGroup: null,
    transitGroup: null,
    wormholeGroup: null,
    sky: null,
    deepSky: null,
    current: resolveUniverseAddress('sol'),
    selected: resolveUniverseAddress('sol'),
    course: null,
    transition: null,
    pendingEarthReturn: false,
    elapsedSeconds: 0,
    encounter: null,
    captureRecoveryAt: 0,
    galaxyEntry: null
  });
  universeRuntime.canonicalFrameOffset.set(0, 0, 0);
  return true;
}

function playDestinationMissionScan(destinationId, operation = 'survey') {
  const mesh = getUniverseDestinationMesh(universeRuntime.frameGroup, destinationId);
  if (!mesh) return false;
  const radius = Number(mesh.geometry?.parameters?.radius) || 12;
  const thermalScale = operation.includes('thermal') ? 3.4 : 1;
  const group = new THREE.Group();
  group.name = `destination-mission-scan:${destinationId}`;
  const scanColor = operation.includes('nightside') ? 0x739dff
    : operation.includes('thermal') ? 0xffa35c
      : operation.includes('biosignature') ? 0x76f0c7 : 0x6fe8ff;
  const shellMaterial = new THREE.MeshBasicMaterial({
    color: scanColor,
    transparent: true,
    opacity: 0.68,
    wireframe: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.16 * thermalScale, 24, 16), shellMaterial);
  group.add(shell);
  for (let index = 0; index < 3; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * (1.25 + index * 0.18) * thermalScale, Math.max(0.12, radius * 0.018 * thermalScale), 8, 48),
      shellMaterial.clone()
    );
    ring.rotation.set(index * 0.73, index * 1.05, index * 0.41);
    group.add(ring);
  }
  if (operation.includes('thermal')) {
    for (let index = 0; index < 7; index += 1) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 0.065 * thermalScale, radius * (0.45 + index * 0.12) * thermalScale, radius * 0.04 * thermalScale),
        shellMaterial.clone()
      );
      band.position.x = (index - 3) * radius * 0.19 * thermalScale;
      band.position.z = radius * 1.22 * thermalScale;
      group.add(band);
    }
  }
  mesh.add(group);
  missionScanEffects.push({ group, startedAt: performance.now(), durationMs: 2200 });
  return true;
}

function updateMissionScanEffects(nowMs = performance.now()) {
  for (let index = missionScanEffects.length - 1; index >= 0; index -= 1) {
    const effect = missionScanEffects[index];
    const progress = Math.min(1, Math.max(0, (nowMs - effect.startedAt) / effect.durationMs));
    effect.group.rotation.y += 0.018;
    effect.group.rotation.x += 0.006;
    effect.group.scale.setScalar(1 + progress * 1.8);
    effect.group.children.forEach((child) => {
      if (child.material) child.material.opacity = Math.max(0, 0.72 * (1 - progress));
    });
    if (progress < 1) continue;
    effect.group.parent?.remove(effect.group);
    disposeThreeObjectTree(effect.group);
    missionScanEffects.splice(index, 1);
  }
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
    const courseDestination = universeRuntime.course?.destination;
    if (courseDestination?.objectClass === 'exoplanet' && courseDestination.parentFrameId === entity.id) {
      setUniverseCourseMarker(universeRuntime.frameGroup, courseDestination.id, true);
    }
  }
  positionRocketForFrame(entity);
  resetFlightMotion();
  updateUniverseNavigator(universeRuntime);
}

function positionRocketForCourseDestination(destination) {
  if (destination?.objectClass !== 'exoplanet' || !appCtx.spaceFlight?.rocket) return false;
  const body = getUniverseDestinationMesh(universeRuntime.frameGroup, destination.id);
  if (!body) return false;
  const target = new THREE.Vector3();
  body.getWorldPosition(target);
  const radius = Number(body.geometry?.parameters?.radius) || 6;
  const approach = target.clone().normalize();
  if (approach.lengthSq() < 0.01) approach.set(0, 0, 1);
  const rocket = appCtx.spaceFlight.rocket;
  rocket.position.copy(target).addScaledVector(approach, Math.max(90, radius * 12));
  _forward.copy(target).sub(rocket.position).normalize();
  rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _forward);
  if (appCtx.spaceFlight.camera) {
    appCtx.spaceFlight.camera.position.copy(rocket.position).addScaledVector(approach, Math.max(35, radius * 5));
    appCtx.spaceFlight.camera.position.y += Math.max(16, radius * 2);
    appCtx.spaceFlight.camera.lookAt(target);
  }
  resetFlightMotion();
  return true;
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
  const destinationFrame = getUniverseFrame(destination);
  if (!destination || !destinationFrame) return false;
  universeRuntime.selected = destination;
  universeRuntime.course = createUniverseCourse(destination, universeRuntime.current.id, performance.now());
  // Interstellar frames and the local Solar System use different physical
  // scales. End the local transfer once, then keep Wayfinder as navigation;
  // the active craft and its travel session remain unchanged.
  appCtx.releaseRenderedJourneyToManualFlight?.();
  appCtx.updateSpaceTravelSession?.({
    location: 'deep-space',
    phase: 'transfer',
    destination: { id: destination.id, kind: destination.objectClass === 'planetary_system' ? 'system' : 'contact', name: destination.name },
    guidance: 'manual',
    reason: 'wayfinder-interstellar-course-set'
  });
  if (destination.objectClass === 'exoplanet' && destinationFrame.id === universeRuntime.current.id) {
    setUniverseCourseMarker(universeRuntime.frameGroup, destination.id, true);
    showMessage(`COURSE SET · ${destination.name.toUpperCase()}`, '#6fe8ff');
    updateUniverseNavigator(universeRuntime);
    return true;
  }
  if (destination.id === universeRuntime.current.id) {
    universeRuntime.course = setUniverseCourseStatus(universeRuntime.course, 'active');
    updateUniverseNavigator(universeRuntime);
    return false;
  }
  universeRuntime.pendingEarthReturn = Boolean(options.returnToEarth);
  universeRuntime.transition = {
    from: universeRuntime.current,
    to: destinationFrame,
    destination,
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
  showMessage(`COURSE ENGAGED · ${destination.name.toUpperCase()}`, '#8ab4ff');
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
  universeRuntime.course = null;
  universeRuntime.selected = resolveUniverseAddress('sol');
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
  if (universeRuntime.course) {
    universeRuntime.course = setUniverseCourseStatus(universeRuntime.course, 'active');
  }
  positionRocketForCourseDestination(transition.destination);
  appCtx.updateSpaceTravelSession?.({
    location: 'deep-space',
    phase: 'approach',
    guidance: universeRuntime.course?.guidance || 'manual',
    reason: 'wayfinder-destination-frame-arrived'
  });
  updateUniverseNavigator(universeRuntime);
  showMessage(`${transition.destination?.name || transition.to.name} APPROACH ACQUIRED`, '#68d8c0');
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
    appCtx.spaceFlight.velocity,
    frameScale / 60
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
  if (universeRuntime.current.id === 'sol' && !universeRuntime.transition) return null;
  const group = universeRuntime.frameGroup;
  const courseDestination = universeRuntime.course?.destination;
  const courseInTransit = Boolean(universeRuntime.transition && courseDestination);
  const courseBody = courseDestination?.objectClass === 'exoplanet' && courseDestination.parentFrameId === universeRuntime.current.id
    ? getUniverseDestinationMesh(group, courseDestination.id)
    : null;
  const coursePosition = new THREE.Vector3();
  if (courseBody) courseBody.getWorldPosition(coursePosition);
  const radius = universeRuntime.current.objectClass === 'black_hole'
    ? group?.userData?.blackHole?.visualRadius || 100
    : universeRuntime.current.objectClass === 'planetary_system' ? 24
      : universeRuntime.current.objectClass === 'nebula' ? 240
        : universeRuntime.current.objectClass === 'stellar_region' ? 180 : 80;
  const activeDestination = courseBody ? courseDestination : courseInTransit ? courseDestination : universeRuntime.current;
  const missionSurface = courseBody && appCtx.isDestinationMissionSurfaceTarget?.(activeDestination?.id) === true;
  const solidSurface = courseBody && (activeDestination?.exploration?.landingMode === 'solid_surface' || missionSurface);
  return {
    name: courseBody || courseInTransit ? courseDestination.name : universeRuntime.current.name,
    position: courseBody ? coursePosition : group?.position || new THREE.Vector3(),
    radius: courseBody ? Number(courseBody.geometry?.parameters?.radius) || 6 : radius,
    physicalRadiusKm: courseBody ? Number(courseBody.userData?.physicalRadiusKm) || null : null,
    mesh: courseBody || null,
    destinationId: activeDestination?.id || null,
    exploration: activeDestination?.exploration || null,
    landable: Boolean(solidSurface),
    objectClass: courseBody ? 'exoplanet' : universeRuntime.current.objectClass,
    address: courseBody || courseInTransit ? courseDestination.address : universeRuntime.current.address,
    course: universeRuntime.course,
    targetKind: courseBody ? 'exoplanet' : courseInTransit ? 'course-transit' : 'frame',
    encounter: universeRuntime.encounter,
    navigation: getUniverseNavigationMetrics(
      universeRuntime.current,
      appCtx.spaceFlight?.rocket,
      universeRuntime.canonicalFrameOffset,
      appCtx.spaceFlight?.speed
    )
  };
}

function restoreUniverseLocalFrame(frameId, courseDestinationId = '') {
  if (!universeRuntime.initialized || !universeRuntime.scene) return false;
  const frame = resolveUniverseAddress(frameId);
  const destination = resolveUniverseAddress(courseDestinationId);
  if (!frame || frame.objectClass !== 'planetary_system') return false;
  universeRuntime.transition = null;
  universeRuntime.pendingEarthReturn = false;
  universeRuntime.selected = destination || frame;
  universeRuntime.course = destination ? createUniverseCourse(destination, frame.id, performance.now()) : null;
  installFrame(frame);
  if (destination?.parentFrameId === frame.id) positionRocketForCourseDestination(destination);
  updateUniverseNavigator(universeRuntime);
  return true;
}

function getLocalCourseTarget() {
  const course = universeRuntime.course;
  if (!course && universeRuntime.current?.id === 'sol' && !universeRuntime.transition) {
    const destinationBodyId = normalizeAstronomicalBodyId(appCtx.spaceJourney?.destinationBodyId);
    const body = destinationBodyId && appCtx.getAllSpaceBodies?.().find((entry) =>
      normalizeAstronomicalBodyId(entry?.name) === destinationBodyId
    );
    if (!body?.position) return null;
    _localCourseTarget.position.copy(body.position);
    _localCourseTarget.destination = {
      id: destinationBodyId,
      name: getAstronomicalBody(destinationBodyId)?.name || body.name || destinationBodyId
    };
    _localCourseTarget.radius = Number(body.radius) || 20;
    _localCourseTarget.mesh = body.mesh || null;
    return _localCourseTarget;
  }
  if (
    universeRuntime.transition ||
    course?.status !== 'active' ||
    course.frame?.id !== universeRuntime.current?.id ||
    !universeRuntime.frameGroup
  ) return null;
  const mesh = getUniverseDestinationMesh(universeRuntime.frameGroup, course.destination.id)
    || (course.destination.id === universeRuntime.current.id ? universeRuntime.frameGroup : null);
  if (!mesh) return null;
  mesh.getWorldPosition(_courseTarget);
  _localCourseTarget.destination = course.destination;
  _localCourseTarget.radius = Number(mesh.geometry?.parameters?.radius) || (
    course.destination.objectClass === 'planetary_system' ? 24 : 80
  );
  _localCourseTarget.mesh = mesh;
  return _localCourseTarget;
}

function toggleUniverseCourseAssist() {
  const target = getLocalCourseTarget();
  if (!target || !universeRuntime.course) {
    return Object.freeze({ accepted: false, active: false, reason: 'local-course-target-unavailable' });
  }
  const active = universeRuntime.course.guidance !== UNIVERSE_GUIDANCE_MODE.ASSISTED;
  universeRuntime.course = setUniverseCourseGuidance(
    universeRuntime.course,
    active ? UNIVERSE_GUIDANCE_MODE.ASSISTED : UNIVERSE_GUIDANCE_MODE.MANUAL
  );
  appCtx.updateSpaceTravelSession?.({
    guidance: active ? 'assisted' : 'manual',
    reason: active ? 'wayfinder-assist-engaged' : 'manual-flight-resumed'
  });
  updateUniverseNavigator(universeRuntime);
  showMessage(
    active ? `FLIGHT ASSIST · ${target.destination.name.toUpperCase()}` : 'MANUAL FLIGHT',
    active ? '#68d8c0' : '#60a5fa'
  );
  return Object.freeze({ accepted: true, active, reason: null });
}

function updateLocalCourseAssist(frameSeconds) {
  const target = getLocalCourseTarget();
  const rocket = appCtx.spaceFlight?.rocket;
  if (!target || !rocket || universeRuntime.course?.guidance !== UNIVERSE_GUIDANCE_MODE.ASSISTED) return target;
  const keys = appCtx.spaceFlight.keys || {};
  const manualInput = Boolean(
    keys[' '] || keys.shift || keys.arrowup || keys.arrowdown || keys.arrowleft || keys.arrowright
  );
  if (manualInput) {
    universeRuntime.course = setUniverseCourseGuidance(universeRuntime.course, UNIVERSE_GUIDANCE_MODE.MANUAL);
    updateUniverseNavigator(universeRuntime);
    appCtx.updateSpaceTravelSession?.({ guidance: 'manual', reason: 'manual-flight-resumed' });
    showMessage('MANUAL FLIGHT', '#60a5fa');
    return target;
  }

  _courseDirection.copy(target.position).sub(rocket.position);
  const distance = _courseDirection.length();
  if (distance <= 0.001) return target;
  _courseDirection.multiplyScalar(1 / distance);
  _courseDesiredRotation.setFromUnitVectors(_courseForwardAxis, _courseDirection);
  const turnBlend = 1 - Math.exp(-Math.max(0, frameSeconds) * 2.8);
  rocket.quaternion.slerp(_courseDesiredRotation, turnBlend).normalize();

  _forward.set(0, 1, 0).applyQuaternion(rocket.quaternion).normalize();
  const alignment = Math.max(0, _forward.dot(_courseDirection));
  const holdDistance = Math.max(90, target.radius * 12);
  const remaining = Math.max(0, distance - holdDistance);
  const desiredSpeed = remaining <= 2
    ? 0
    : Math.min(SPACE_CONSTANTS.MAX_SPEED * 0.72, Math.max(SPACE_CONSTANTS.CRUISE_SPEED, remaining / 55)) * alignment;
  const targetVelocity = _courseDesiredVelocity.copy(_courseDirection).multiplyScalar(desiredSpeed);
  const velocityBlend = 1 - Math.exp(-Math.max(0, frameSeconds) * (desiredSpeed > appCtx.spaceFlight.speed ? 1.8 : 3.2));
  appCtx.spaceFlight.velocity?.lerp?.(targetVelocity, velocityBlend);
  appCtx.spaceFlight.speed = appCtx.spaceFlight.velocity?.length?.() || 0;
  if (remaining <= 2) appCtx.spaceFlight.velocity?.multiplyScalar?.(Math.max(0, 1 - frameSeconds * 3));
  return target;
}

function updateLocalCourseCue(target = getLocalCourseTarget()) {
  const camera = appCtx.spaceFlight?.camera;
  if (!target || !camera || !appCtx.spaceFlight?.active) {
    _localCourseCue.visible = false;
    _localCourseCue.onScreen = false;
    updateUniverseCourseCue(null);
    return null;
  }
  _courseDirection.copy(target.position).sub(camera.position);
  if (_courseDirection.lengthSq() <= 0.001) {
    updateUniverseCourseCue(null);
    return null;
  }
  _courseDirection.normalize();
  camera.getWorldDirection(_courseCameraDirection);
  _courseProjected.copy(target.position).project(camera);
  const inFront = _courseCameraDirection.dot(_courseDirection) > 0;
  const onScreen = inFront && Math.abs(_courseProjected.x) < 0.78 && Math.abs(_courseProjected.y) < 0.68;
  if (onScreen) {
    _localCourseCue.visible = false;
    _localCourseCue.onScreen = true;
    _localCourseCue.ndcX = _courseProjected.x;
    _localCourseCue.ndcY = _courseProjected.y;
    updateUniverseCourseCue(null);
    return _localCourseCue;
  }

  _courseCameraInverse.copy(camera.quaternion).invert();
  _courseCameraLocal.copy(target.position).sub(camera.position).applyQuaternion(_courseCameraInverse);
  let directionX = _courseCameraLocal.x;
  let directionY = -_courseCameraLocal.y;
  if (_courseCameraLocal.z > 0) {
    directionX *= -1;
    directionY *= -1;
  }
  const directionLength = Math.hypot(directionX, directionY) || 1;
  directionX /= directionLength;
  directionY /= directionLength;
  const width = Math.max(320, window.innerWidth || 320);
  const height = Math.max(480, window.innerHeight || 480);
  const marginX = width <= 720 ? 62 : 86;
  const marginY = width <= 720 ? 190 : 88;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const edgeScale = Math.min(
    (halfWidth - marginX) / Math.max(0.001, Math.abs(directionX)),
    (halfHeight - marginY) / Math.max(0.001, Math.abs(directionY))
  );
  _localCourseCue.visible = true;
  _localCourseCue.onScreen = false;
  _localCourseCue.x = halfWidth + directionX * edgeScale;
  _localCourseCue.y = halfHeight + directionY * edgeScale;
  _localCourseCue.angleDeg = Math.atan2(directionY, directionX) * 180 / Math.PI + 90;
  _localCourseCue.label = target.destination.name;
  _localCourseCue.assisted = universeRuntime.course?.guidance === UNIVERSE_GUIDANCE_MODE.ASSISTED
    || appCtx.spaceJourneyAssistState?.active === true;
  _localCourseCue.ndcX = _courseProjected.x;
  _localCourseCue.ndcY = _courseProjected.y;
  updateUniverseCourseCue(_localCourseCue);
  return _localCourseCue;
}

function getUniverseCourseSnapshot() {
  const course = universeRuntime.course;
  const destination = course?.destination;
  const body = destination?.objectClass === 'exoplanet'
    ? getUniverseDestinationMesh(universeRuntime.frameGroup, destination.id)
    : null;
  const entry = body
    ? (universeRuntime.frameGroup?.userData?.orbitingPlanets || []).find((candidate) => candidate.body === body)
    : null;
  let targetVisual = null;
  const directionCue = updateLocalCourseCue();
  if (body && appCtx.spaceFlight?.camera && appCtx.spaceFlight?.rocket) {
    const targetWorld = new THREE.Vector3();
    const projected = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    const targetDirection = new THREE.Vector3();
    const rocketForward = new THREE.Vector3(0, 1, 0).applyQuaternion(appCtx.spaceFlight.rocket.quaternion).normalize();
    body.getWorldPosition(targetWorld);
    projected.copy(targetWorld).project(appCtx.spaceFlight.camera);
    appCtx.spaceFlight.camera.getWorldDirection(cameraDirection);
    targetDirection.copy(targetWorld).sub(appCtx.spaceFlight.camera.position).normalize();
    targetVisual = Object.freeze({
      markerVisible: entry?.marker?.visible === true,
      ndcX: Number(projected.x),
      ndcY: Number(projected.y),
      cameraTargetDot: Number(cameraDirection.dot(targetDirection)),
      rocketTargetDot: Number(rocketForward.dot(targetWorld.clone().sub(appCtx.spaceFlight.rocket.position).normalize())),
      targetDistance: Number(targetWorld.distanceTo(appCtx.spaceFlight.camera.position)),
      rocketTargetDistance: Number(targetWorld.distanceTo(appCtx.spaceFlight.rocket.position))
    });
  }
  return Object.freeze({
    currentFrameId: universeRuntime.current?.id || null,
    selectedDestinationId: universeRuntime.selected?.id || null,
    courseDestinationId: destination?.id || null,
    courseFrameId: course?.frame?.id || null,
    courseStatus: course?.status || null,
    courseGuidance: course?.guidance || null,
    transitionDestinationId: universeRuntime.transition?.destination?.id || null,
    targetVisual,
    directionCue: directionCue ? Object.freeze({ ...directionCue }) : null
  });
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
      radius: Number(mesh.geometry?.parameters?.radius) || (planet ? Math.max(7, Math.min(22, Math.sqrt(Number(planet.radiusEarth || 1)) * 7)) :
        Math.max(18, Math.min(38, 24 + Number(universeRuntime.current.physical?.hostMassSolar || 1) * 8))),
      massKg: mesh.userData.massKg,
      physicalRadiusKm: mesh.userData.physicalRadiusKm,
      mesh,
      landable: appCtx.isDestinationMissionSurfaceTarget?.(planet?.id) === true
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
  const localCourseTarget = updateLocalCourseAssist(frameSeconds);
  updateLocalCourseCue(localCourseTarget);
  updateMissionScanEffects();
  updateDestinationMissionRuntime();
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
    if (universeRuntime.scene) {
      releaseUniverseRuntimeScene(universeRuntime.scene, { disposeObjects: true });
    }
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
    universeRuntime.course = null;
    setSolVisibility(true);
    setUniverseSkyFrame(universeRuntime.sky, universeRuntime.current, false);
    setDeepSkyFrame(universeRuntime.deepSky, universeRuntime.current, false);
  }
  setupUniverseInput();
  initDestinationMissionRuntime(appCtx);
  createUniverseNavigator({
    onMission: (destinationId) => appCtx.openDestinationMission?.(destinationId),
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
  getUniverseCourseSnapshot,
  getUniverseHudTarget,
  getUniverseGravityBodies,
  hideUniverseUI,
  initUniverseRuntime,
  playDestinationMissionScan,
  releaseUniverseRuntimeScene,
  returnToEarthFromUniverse,
  returnUniverseToSol,
  returnUniverseToSolImmediate,
  restoreUniverseLocalFrame,
  setUniverseDestination: setSelectedDestination,
  showUniverseUI,
  toggleUniverseCourseAssist,
  travelToUniverseDestination,
  universeRuntime,
  updateUniverseRuntime
});

export {
  getUniverseCourseSnapshot,
  getUniverseHudTarget,
  getUniverseGravityBodies,
  hideUniverseUI,
  initUniverseRuntime,
  releaseUniverseRuntimeScene,
  returnToEarthFromUniverse,
  returnUniverseToSol,
  returnUniverseToSolImmediate,
  restoreUniverseLocalFrame,
  showUniverseUI,
  toggleUniverseCourseAssist,
  travelToUniverseDestination,
  universeRuntime,
  updateUniverseRuntime
};
