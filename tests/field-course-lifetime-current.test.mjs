import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import { createFieldCourseScene } from '../app/js/campaign/field-course-scene.js';
import { modelAssetCacheSnapshot } from '../app/js/assets/model-asset-runtime.js?v=16';
const sandbox = { console };
vm.runInNewContext(
  await fs.readFile(new URL('../app/vendor/three/build/three.min.js', import.meta.url), 'utf8'),
  sandbox
);
const T = (globalThis.THREE = sandbox.THREE),
  loads = [];
T.GLTFLoader = class {
  register() {
    return this;
  }
  load(url, loaded) {
    loads.push(loaded);
  }
};
const nextLoad = async () => {
  for (let i = 0; i < 10 && !loads.length; i++) await new Promise((r) => setImmediate(r));
  assert.ok(loads.length);
  return loads.shift();
};
function context() {
  const runtime = { scene: new T.Scene(), dynamicBuildingColliders: [] },
    qualified = { metersPerUnit: 2, points: { bench: { x: 3, y: 4, z: 5 } } };
  return { runtime, qualified };
}
function model() {
  const root = new T.Group(),
    mesh = new T.Mesh(new T.BoxGeometry(2, 2, 2), new T.MeshStandardMaterial());
  mesh.position.y = 1;
  root.position.set(7, 8, 9);
  root.add(mesh);
  return { scene: root, animations: [] };
}
test('a superseded field acquisition releases the new lease and stops construction', async () => {
  const c = context();
  let current = true;
  const scene = createFieldCourseScene(c.runtime, c.qualified, 'late', {
      isCurrent: () => current
    }),
    pending = scene.table('bench'),
    loaded = await nextLoad();
  scene.dispose();
  current = false;
  loaded(model());
  await assert.rejects(pending, /changed|cancel|stopped/i);
  assert.equal(c.runtime.dynamicBuildingColliders.length, 0);
  assert.equal(modelAssetCacheSnapshot().entries.find((e) => e.id === 'workspace-table').leases, 0);
});
test('aborting a pending field model keeps no scene or lease after its loader resolves', async () => {
  const c = context(),
    abort = new AbortController(),
    scene = createFieldCourseScene(c.runtime, c.qualified, 'abort', { signal: abort.signal }),
    pending = scene.asset('nature-fern', { x: 0, y: 0, z: 0 }, 0.7),
    loaded = await nextLoad();
  abort.abort();
  loaded(model());
  await assert.rejects(pending, /cancel/i);
  assert.equal(c.runtime.scene.children.length, 0);
  assert.equal(modelAssetCacheSnapshot().entries.find((e) => e.id === 'nature-fern').leases, 0);
});
test('measured asset mounting handles source offsets and releases its owned resources', async () => {
  const c = context(),
    scene = createFieldCourseScene(c.runtime, c.qualified, 'asset'),
    root = await scene.asset('nature-fern', { x: 3, y: 4, z: 5 }, 0.7),
    bounds = new T.Box3().setFromObject(root),
    size = bounds.getSize(new T.Vector3()),
    center = bounds.getCenter(new T.Vector3());
  assert.ok(Math.abs(size.y - 0.35) < 1e-6);
  assert.ok(Math.abs(bounds.min.y - 4) < 1e-6);
  assert.ok(Math.abs(center.x - 3) < 1e-6 && Math.abs(center.z - 5) < 1e-6);
  scene.attach();
  scene.dispose();
  assert.equal(c.runtime.scene.children.length, 0);
  assert.equal(modelAssetCacheSnapshot().entries.find((e) => e.id === 'nature-fern').leases, 0);
});
