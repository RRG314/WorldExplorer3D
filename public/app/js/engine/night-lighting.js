import { ctx as appCtx } from '../shared-context.js?v=55';

const STREET_LIGHT_COLOR = 0xffd7a3;
const HEADLIGHT_COLOR = 0xfff1d2;
const STREET_LIGHT_DISTANCE = 42;
const STREET_LIGHT_HEIGHT = 6.05;
const UPDATE_INTERVAL_MS = 240;
const HEADLIGHT_INTENSITY = 1100;
const STREET_LIGHT_INTENSITY = 72;

const headlightLocalPosition = new THREE.Vector3();
const headlightLocalTarget = new THREE.Vector3();

let lastStreetUpdateAt = 0;

function nightFactor() {
  if (appCtx.onMoon || appCtx.onMars) return 0;
  if (appCtx.timeOfDay === 'night') return 1;
  if (appCtx.timeOfDay === 'sunset' || appCtx.timeOfDay === 'sunrise') return 0.52;
  return 0;
}

function streetLightBudget() {
  const tier = String(appCtx.getDynamicBudgetState?.().tier || 'balanced').toLowerCase();
  if (tier === 'performance') return 5;
  if (tier === 'quality') return 12;
  return 8;
}

function ensureStreetLightPool() {
  const desired = streetLightBudget();
  if (!Array.isArray(appCtx.streetLightPool)) appCtx.streetLightPool = [];
  while (appCtx.streetLightPool.length < desired) {
    const light = new THREE.PointLight(STREET_LIGHT_COLOR, 0, STREET_LIGHT_DISTANCE, 2);
    light.visible = false;
    light.castShadow = false;
    light.userData.worldStreetLight = true;
    appCtx.scene?.add(light);
    appCtx.streetLightPool.push(light);
  }
  return appCtx.streetLightPool;
}

export function createVehicleHeadlightRig(carMesh) {
  if (!carMesh || carMesh.userData.headlightRig) return carMesh?.userData?.headlightRig || null;
  const rig = [];
  for (const x of [-0.56, 0.56]) {
    const target = new THREE.Object3D();
    const light = new THREE.SpotLight(HEADLIGHT_COLOR, 0, 110, 0.52, 0.52, 1.15);
    light.target = target;
    light.castShadow = false;
    light.visible = false;
    target.visible = false;
    appCtx.scene?.add(light);
    appCtx.scene?.add(target);
    rig.push({ light, target, x });
  }
  carMesh.userData.headlightRig = rig;
  return rig;
}

export function resetStreetLampFixtures() {
  appCtx.streetLampFixtures = [];
}

export function registerStreetLamp(group, head) {
  if (!group) return;
  if (!Array.isArray(appCtx.streetLampFixtures)) appCtx.streetLampFixtures = [];
  appCtx.streetLampFixtures.push({ group, head });
}

function updateHeadlights(factor) {
  const rig = appCtx.carMesh?.userData?.headlightRig || [];
  const active = factor > 0.02 && appCtx.carMesh?.visible !== false && !appCtx.boatMode?.active;
  for (const entry of rig) {
    entry.light.visible = active;
    entry.light.intensity = active ? HEADLIGHT_INTENSITY * factor : 0;
    if (active) {
      headlightLocalPosition.set(entry.x, -0.55, 1.6);
      headlightLocalTarget.set(entry.x * 0.25, -3, 38);
      appCtx.carMesh.localToWorld(headlightLocalPosition);
      appCtx.carMesh.localToWorld(headlightLocalTarget);
      entry.light.position.copy(headlightLocalPosition);
      entry.target.position.copy(headlightLocalTarget);
      entry.light.updateMatrixWorld();
      entry.target.updateMatrixWorld();
    }
  }
  appCtx.carMesh?.traverse?.((child) => {
    if (!child?.userData?.vehicleHeadlightLens || !child.material) return;
    child.material.emissiveIntensity = 0.35 + factor * 2.2;
  });
}

function nearestFixtures(limit) {
  const origin = appCtx.carMesh?.visible === false || appCtx.droneMode
    ? appCtx.camera?.position
    : appCtx.carMesh?.position;
  if (!origin) return [];
  const candidates = [];
  for (const fixture of appCtx.streetLampFixtures || []) {
    const group = fixture?.group;
    if (!group?.parent || group.visible === false) continue;
    const dx = group.position.x - origin.x;
    const dz = group.position.z - origin.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > 150 * 150) continue;
    candidates.push({ fixture, distanceSq });
  }
  candidates.sort((a, b) => a.distanceSq - b.distanceSq);
  return candidates.slice(0, limit);
}

function updateStreetLights(factor, now) {
  const pool = ensureStreetLightPool();
  const enabled = factor > 0.02 && !appCtx.onMoon && !appCtx.onMars;
  if (enabled && now - lastStreetUpdateAt < UPDATE_INTERVAL_MS) return;
  lastStreetUpdateAt = now;
  const fixtures = enabled ? nearestFixtures(pool.length) : [];
  for (let index = 0; index < pool.length; index++) {
    const light = pool[index];
    const fixture = fixtures[index]?.fixture;
    if (!fixture) {
      light.visible = false;
      light.intensity = 0;
      continue;
    }
    light.position.set(
      fixture.group.position.x,
      fixture.group.position.y + STREET_LIGHT_HEIGHT,
      fixture.group.position.z
    );
    light.intensity = STREET_LIGHT_INTENSITY * factor;
    light.visible = true;
  }

  const lampMaterial = appCtx.streetLampHeadMaterial;
  if (lampMaterial) lampMaterial.emissiveIntensity = enabled ? 0.45 + factor * 1.7 : 0.08;
}

export function updateNightLighting() {
  if (!appCtx.scene) return;
  const factor = nightFactor();
  updateHeadlights(factor);
  updateStreetLights(factor, typeof performance !== 'undefined' ? performance.now() : Date.now());
}
