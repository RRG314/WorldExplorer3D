import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
globalThis.THREE = THREE;
const {ctx} = await import('../app/js/shared-context.js?v=55');
const {createVehicleHeadlightRig, registerStreetLamp, updateNightLighting} = await import('../app/js/engine/night-lighting.js');

test('pooled light count stays stable while daylight, vehicles and nearby fixtures change', () => {
  const originalPerformance = globalThis.performance;
  let now = 1000;
  globalThis.performance = {now: () => now};
  try {
    ctx.scene = new THREE.Scene();
    ctx.carMesh = new THREE.Group();
    ctx.camera = new THREE.PerspectiveCamera();
    ctx.scene.add(ctx.carMesh);
    ctx.streetLampFixtures = [];
    ctx.streetLightPool = [];
    ctx.getDynamicBudgetState = () => ({tier: 'performance'});
    ctx.timeOfDay = 'day';
    ctx.onMoon = ctx.onMars = false;
    const rig = createVehicleHeadlightRig(ctx.carMesh);
    const group = new THREE.Group(), head = new THREE.Object3D();
    head.position.set(3, 5, 4); group.add(head); ctx.scene.add(group);
    registerStreetLamp(group, head);
    const lights = () => ctx.scene.children.filter(node => node.isLight && node.visible);
    updateNightLighting();
    assert.equal(lights().length, 7);
    assert.ok(lights().every(light => light.intensity === 0), 'Daylight has no artificial illumination');
    ctx.timeOfDay = 'night'; now += 300; updateNightLighting();
    assert.equal(lights().length, 7);
    assert.ok(rig.every(entry => entry.light.intensity > 0));
    assert.equal(ctx.streetLightPool.filter(entry => entry.light.intensity > 0).length, 1);
    assert.deepEqual(ctx.streetLightPool[0].light.position.toArray(), [3, 5, 4]);
    ctx.carMesh.visible = false; group.visible = false; now += 300; updateNightLighting();
    assert.equal(lights().length, 7, 'Changing travel mode and leaving lamps cannot introduce new light-count shaders');
    assert.ok(lights().every(light => light.intensity === 0), 'Inactive slots contribute no illumination');
    group.visible = true; ctx.onMoon = true; now += 300; updateNightLighting();
    assert.equal(lights().length, 7);
    assert.ok(lights().every(light => light.intensity === 0), 'Earth lights remain dark on another world');
    assert.equal(createVehicleHeadlightRig(ctx.carMesh), rig, 'A second request cannot duplicate lights');
  } finally { globalThis.performance = originalPerformance; }
});
