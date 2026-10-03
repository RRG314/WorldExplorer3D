import { ctx as appCtx } from '../shared-context.js?v=55';

const STREET_LIGHT_COLOR = 0xffd7a3;
const HEADLIGHT_COLOR = 0xfff1d2;
const STREET_LIGHT_DISTANCE = 58;
const UPDATE_INTERVAL_MS = 240;
const HEADLIGHT_INTENSITY = 180;
const STREET_LIGHT_INTENSITY = 260;

const headlightLocalPosition = new THREE.Vector3();
const headlightLocalTarget = new THREE.Vector3();

let lastStreetUpdateAt = 0;

// Fixed pools keep shader variants stable. Lights outside their exact cutoff
// contribute zero; skip their BRDF work without changing range or intensity.
function installLocalLightShortcut(three, variable, collection, label) {
  const chunk = three?.ShaderChunk?.lights_fragment_begin;
  const marker = `// WE3D inactive ${label} slot`;
  if (typeof chunk !== 'string' || chunk.includes(marker)) return false;
  const assignment = `${variable} = ${collection}[ i ];`;
  const direct = 'RE_Direct( directLight, geometry, material, reflectedLight );';
  const start = chunk.indexOf(assignment), end = chunk.indexOf(direct, start);
  if (start < 0 || end < start) return false;
  const tail = end + direct.length;
  // Legacy lights with decay zero have no cutoff, even when distance is set.
  const inRange = `(${variable}.distance <= 0.0 ||
#ifndef PHYSICALLY_CORRECT_LIGHTS
    ${variable}.decay <= 0.0 ||
#endif
    dot(${variable}.position - geometry.position, ${variable}.position - geometry.position) <= ${variable}.distance * ${variable}.distance)`;
  const body = chunk.slice(start + assignment.length, tail)
    .replace(direct, `if (directLight.visible) { ${direct} }`);
  three.ShaderChunk.lights_fragment_begin = chunk.slice(0, start) + assignment +
    `\n${marker}\nif (any(notEqual(${variable}.color, vec3(0.0))) && ${inRange}) {\n` +
    body + '\n}' + chunk.slice(tail);
  return true;
}

export function installInactiveSpotLightShortcut(three) {
  return installLocalLightShortcut(three, 'spotLight', 'spotLights', 'spotlight');
}

export function installInactivePointLightShortcut(three) {
  return installLocalLightShortcut(three, 'pointLight', 'pointLights', 'point-light');
}

installInactivePointLightShortcut(THREE);
installInactiveSpotLightShortcut(THREE);

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
  // Allocate the maximum once, before the first world render. Quality
  // changes choose active fixtures; they must not grow the shader light array.
  const desired = 12;
  if (!Array.isArray(appCtx.streetLightPool)) appCtx.streetLightPool = [];
  while (appCtx.streetLightPool.length < desired) {
    const target = new THREE.Object3D();
    const light = new THREE.SpotLight(STREET_LIGHT_COLOR, 0, STREET_LIGHT_DISTANCE, 0.78, 0.62, 1.5);
    light.target = target;
    light.visible = true;
    light.castShadow = false;
    light.userData.worldStreetLight = true;
    appCtx.scene?.add(light);
    appCtx.scene?.add(target);
    appCtx.streetLightPool.push({ light, target });
  }
  return appCtx.streetLightPool;
}

export function createVehicleHeadlightRig(carMesh) {
  if (!carMesh || carMesh.userData.headlightRig) return carMesh?.userData?.headlightRig || null;
  const rig = [];
  for (const x of [-0.56, 0.56]) {
    const target = new THREE.Object3D();
    const light = new THREE.SpotLight(HEADLIGHT_COLOR, 0, 76, 0.34, 0.68, 1.35);
    light.target = target;
    light.castShadow = false;
    light.visible = true;
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
  lastStreetUpdateAt = -Infinity;
  for (const entry of appCtx.streetLightPool || []) {
    entry.light.visible = true;
    entry.light.intensity = 0;
  }
}

export function registerStreetLamp(group, head, target = null) {
  if (!group) return;
  if (!Array.isArray(appCtx.streetLampFixtures)) appCtx.streetLampFixtures = [];
  appCtx.streetLampFixtures.push({ group, head, target });
}

function updateHeadlights(factor) {
  const rig = appCtx.carMesh?.userData?.headlightRig || [];
  const active = factor > 0.02 && appCtx.carMesh?.visible !== false && !appCtx.boatMode?.active;
  if (active) appCtx.carMesh?.updateWorldMatrix?.(true, false);
  for (const entry of rig) {
    entry.light.visible = true;
    entry.light.intensity = active ? HEADLIGHT_INTENSITY * factor : 0;
    if (active) {
      headlightLocalPosition.set(entry.x, -0.48, 1.65);
      headlightLocalTarget.set(entry.x * 0.22, -1.25, 32);
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
  const origin = appCtx.activeEarthActorPosition?.() || appCtx.camera?.position || appCtx.carMesh?.position;
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
  const fixtures = enabled ? nearestFixtures(streetLightBudget()) : [];
  for (let index = 0; index < pool.length; index++) {
    const entry = pool[index];
    const light = entry.light;
    const fixture = fixtures[index]?.fixture;
    if (!fixture) {
      light.visible = true;
      light.intensity = 0;
      continue;
    }
    fixture.head.getWorldPosition(light.position);
    const targetX = Number(fixture.target?.x);
    const targetZ = Number(fixture.target?.z);
    entry.target.position.set(
      Number.isFinite(targetX) ? targetX : fixture.group.position.x,
      fixture.group.position.y + 0.15,
      Number.isFinite(targetZ) ? targetZ : fixture.group.position.z
    );
    entry.target.updateMatrixWorld();
    light.intensity = STREET_LIGHT_INTENSITY * factor;
    light.visible = true;
    light.updateMatrixWorld();
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
