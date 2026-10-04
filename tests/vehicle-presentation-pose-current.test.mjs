import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLivingWorldPopulation } from '../app/js/living-world/population.js';
import { VEHICLE_ROOT_TO_GROUND_METERS } from '../app/js/engine/vehicle-catalog.js';

// Real population/traffic/contact code; GLB loading is deliberately cancelled.
// Actual mesh attachment and road contacts are covered by the four-city journey.
function fixture() {
  const prior = globalThis.THREE;
  globalThis.THREE = { ...THREE, GLTFLoader: class {
    constructor() { throw Object.assign(new Error('No asset I/O in component test'), { name: 'AbortError' }); }
  } };
  let seed = 73271, samples = 0, height = 0;
  const points = [{x:0,y:0,z:0},{x:150,y:0,z:0},{x:150,y:0,z:150},{x:0,y:0,z:150}];
  const graph = { nodes: [], edges: points.map((p1, i) => ({
    id: `road-${i}`, from: `n${i}`, to: `n${(i+1)%4}`,
    p1, p2: points[(i+1)%4], length: 150, roadClass: 'residential'
  })) };
  const population = createLivingWorldPopulation({
    tier: 'low', trafficGraph: graph, pedestrianGraph: {nodes:[],edges:[]},
    random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296),
    getReferencePosition: () => ({x:75,z:75}),
    sampleVehicleSurface: (_edge,x,z) => { samples++; return height + .08*x - .03*z; }
  });
  return { population, samples: () => samples, setHeight: value => {height=value;},
    close() { population.dispose(); globalThis.THREE = prior; } };
}

test('vehicle presentation uses the fixed-step contact pose without resampling on draws', async () => {
  const f = fixture();
  try {
    const retained = f.population.vehiclePresentationSnapshots();
    assert.equal(retained.length, 6);
    const original = JSON.stringify(retained);
    for (let frame = 0; frame < 180; frame++) {
      f.population.fixedUpdate(1/30);
      const expected = f.population.vehicleSnapshots();
      const samples = f.samples();
      for (let draw = 0; draw < 3; draw++) {
        const actual = f.population.vehiclePresentationSnapshots();
        assert.deepEqual(actual, expected);
        assert.ok(Object.isFrozen(actual) && actual.every(Object.isFrozen));
        assert.equal(f.samples(), samples, 'Presentation cannot invoke the surface solver');
      }
      const roots = f.population.pickableRoots();
      for (const snapshot of expected) {
        const host = roots.find(root => root.userData.worldClickTarget().id === snapshot.id);
        assert.ok(host);
        assert.equal(host.position.x, snapshot.x); assert.equal(host.position.z, snapshot.z);
        assert.equal(host.position.y, snapshot.y + VEHICLE_ROOT_TO_GROUND_METERS * host.scale.x);
        assert.equal(host.rotation.x, snapshot.pitch); assert.equal(host.rotation.y, snapshot.yaw);
        assert.equal(host.rotation.z, snapshot.roll);
      }
    }
    assert.equal(JSON.stringify(retained), original, 'Saved snapshots remain independent');
    assert.ok(f.samples() > 4000);
  } finally { f.close(); await new Promise(resolve => setImmediate(resolve)); }
});

test('surface changes publish on simulation and promotion/retirement preserve pose authority', async () => {
  const f = fixture();
  try {
    const initial = f.population.vehiclePresentationSnapshots();
    f.setHeight(12);
    const fresh = f.population.vehicleSnapshots();
    assert.ok(Math.abs(fresh[0].y - initial[0].y - 12) < 1e-10);
    assert.deepEqual(f.population.vehiclePresentationSnapshots(), initial, 'A draw uses the visible simulation pose');
    f.population.fixedUpdate(1/30);
    assert.deepEqual(f.population.vehiclePresentationSnapshots(), f.population.vehicleSnapshots());
    const id = initial[0].id;
    assert.ok(f.population.promoteVehicleDetail(id));
    assert.deepEqual(f.population.vehiclePresentationSnapshots(), f.population.vehicleSnapshots());
    f.population.fixedUpdate(.1);
    assert.deepEqual(f.population.vehiclePresentationSnapshots(), f.population.vehicleSnapshots());
    assert.equal(f.population.releaseVehicleDetail(id), true);
    assert.deepEqual(f.population.vehiclePresentationSnapshots(), f.population.vehicleSnapshots());
    assert.ok(f.population.promoteVehicleDetail(id));
    assert.equal(f.population.retireVehicleDetail(id), true);
    assert.deepEqual(f.population.vehiclePresentationSnapshots(), f.population.vehicleSnapshots());
    assert.ok(f.population.promoteVehicle(id));
    assert.equal(f.population.restoreRoomVehicle(id), true);
    assert.deepEqual(f.population.vehiclePresentationSnapshots(), f.population.vehicleSnapshots());
    f.population.dispose();
    const samples = f.samples();
    assert.deepEqual(f.population.vehiclePresentationSnapshots(), []);
    f.population.fixedUpdate(1); assert.equal(f.samples(), samples);
  } finally { f.close(); await new Promise(resolve => setImmediate(resolve)); }
});
