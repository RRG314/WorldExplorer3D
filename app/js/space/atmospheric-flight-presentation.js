import { ctx as appCtx } from '../shared-context.js?v=55';
import { disposeThreeObjectTree } from '../engine/webgl-lifecycle.js?v=2';

const BODY_STYLE = Object.freeze({
  jupiter: Object.freeze({ sky: 0x9f6a4d, haze: 0xd7a77c, deck: 0xc28e67, cloud: 0xf0d1ad }),
  saturn: Object.freeze({ sky: 0xa88b62, haze: 0xe5c994, deck: 0xcdb181, cloud: 0xf4dfb2 }),
  uranus: Object.freeze({ sky: 0x568f9b, haze: 0xa8e1e6, deck: 0x72bdc7, cloud: 0xc9f0ee }),
  neptune: Object.freeze({ sky: 0x1d376f, haze: 0x527fd1, deck: 0x294f9e, cloud: 0x8ab0ef })
});

let active = null;
let localUp = null;
let deckQuaternion = null;
let deckNormal = null;

function createCloudTexture(style) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const base = `#${style.deck.toString(16).padStart(6, '0')}`;
  const cloud = `#${style.cloud.toString(16).padStart(6, '0')}`;
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 256);
  const random = (() => {
    let seed = 0x51a7c3;
    return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  })();
  for (let index = 0; index < 90; index += 1) {
    const x = random() * 256;
    const y = random() * 256;
    const radius = 8 + random() * 34;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `${cloud}bb`);
    gradient.addColorStop(1, `${cloud}00`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function hideOrbitalPresentation() {
  const spaceBodies = appCtx.getAllSpaceBodies?.() || [];
  const solarBodyGroup = spaceBodies.find((body) => body?.mesh?.parent && body.mesh.parent !== appCtx.spaceFlight?.scene)?.mesh?.parent || null;
  const objects = [
    appCtx.spaceFlight?.celestialCatalog?.group,
    solarBodyGroup,
    appCtx.spaceFlight?.earth,
    appCtx.spaceFlight?.moon,
    appCtx.universeRuntime?.frameGroup,
    ...spaceBodies.map((body) => body?.mesh)
  ].filter(Boolean);
  const hidden = [...new Set(objects)].map((object) => {
    const visible = object.visible;
    object.visible = false;
    return { object, visible };
  });
  ['solarSystemScale', 'ssProximity', 'solarSystemInfo'].forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    hidden.push({ object: element, visible: element.style.display });
    element.style.display = 'none';
  });
  if (typeof appCtx.setSolarSystemFrameVisibility === 'function') {
    const restoreVisible = solarBodyGroup?.visible !== false;
    appCtx.setSolarSystemFrameVisibility(false);
    hidden.push({ restore: () => appCtx.setSolarSystemFrameVisibility(restoreVisible) });
  }
  return hidden;
}

function ensureAtmosphericFlightPresentation(bodyId) {
  const scene = appCtx.spaceFlight?.scene;
  const rocket = appCtx.spaceFlight?.rocket;
  const style = BODY_STYLE[bodyId];
  if (!scene || !rocket || !style) return null;
  if (active?.bodyId === bodyId && active.group?.parent === scene) return active;
  releaseAtmosphericFlightPresentation();

  const group = new THREE.Group();
  group.name = `${bodyId} atmospheric flight volume`;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(850, 32, 20),
    new THREE.MeshBasicMaterial({ color: style.sky, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  dome.name = 'atmospheric sky enclosure';
  group.add(dome);

  const cloudTexture = createCloudTexture(style);
  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600, 1, 1),
    new THREE.MeshPhongMaterial({
      color: style.deck,
      emissive: style.sky,
      emissiveIntensity: 0.18,
      map: cloudTexture,
      side: THREE.DoubleSide,
      depthWrite: true,
      fog: true
    })
  );
  deck.name = 'atmospheric cloud deck';
  group.add(deck);

  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 560),
    new THREE.MeshBasicMaterial({
      color: style.haze,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: true
    })
  );
  haze.name = 'atmospheric horizon haze';
  group.add(haze);
  scene.add(group);
  active = { bodyId, group, deck, haze, cloudTexture, hidden: hideOrbitalPresentation() };
  appCtx.spaceFlight.atmosphericPresentation = active;
  return active;
}

function updateAtmosphericFlightPresentation(bodyId, options = {}) {
  const presentation = ensureAtmosphericFlightPresentation(bodyId);
  const rocket = appCtx.spaceFlight?.rocket;
  if (!presentation || !rocket) return false;
  presentation.group.position.copy(rocket.position);
  localUp ||= new THREE.Vector3(0, 1, 0);
  deckQuaternion ||= new THREE.Quaternion();
  deckNormal ||= new THREE.Vector3(0, 0, 1);
  localUp.set(
    Number(options.radial?.x) || 0,
    Number(options.radial?.y) || 1,
    Number(options.radial?.z) || 0
  ).normalize();
  presentation.deck.position.copy(localUp).multiplyScalar(-180);
  deckQuaternion.setFromUnitVectors(deckNormal, localUp);
  presentation.deck.quaternion.copy(deckQuaternion);
  presentation.haze.position.copy(localUp).multiplyScalar(-120);
  presentation.haze.quaternion.copy(appCtx.spaceFlight.camera?.quaternion || rocket.quaternion);
  presentation.cloudTexture.offset.x = (presentation.cloudTexture.offset.x + (Number(options.horizontalSpeedMps) || 0) * 0.0000008) % 1;
  return true;
}

function releaseAtmosphericFlightPresentation() {
  if (!active) return false;
  active.hidden?.forEach(({ object, visible, restore }) => {
    if (typeof restore === 'function') {
      restore();
      return;
    }
    if (!object) return;
    if (typeof HTMLElement !== 'undefined' && object instanceof HTMLElement) object.style.display = visible;
    else object.visible = visible;
  });
  active.group?.parent?.remove?.(active.group);
  if (active.group) disposeThreeObjectTree(active.group);
  if (appCtx.spaceFlight) appCtx.spaceFlight.atmosphericPresentation = null;
  active = null;
  return true;
}

export {
  ensureAtmosphericFlightPresentation,
  releaseAtmosphericFlightPresentation,
  updateAtmosphericFlightPresentation
};
