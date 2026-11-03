import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import { inspectFieldPhoto } from '../app/js/campaign/field-photo-tool.js';
const sandbox = { console };
vm.runInNewContext(
  await fs.readFile(new URL('../app/vendor/three/build/three.min.js', import.meta.url), 'utf8'),
  sandbox
);
const T = (globalThis.THREE = sandbox.THREE);
function course() {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 1.5, 4);
  camera.lookAt(0, 0.5, 0);
  camera.updateProjectionMatrix();
  const group = new T.Group();
  group.name = 'Actual field subject';
  const mesh = new T.Mesh(new T.BoxGeometry(2, 1, 0.5), new T.MeshBasicMaterial());
  mesh.position.y = 0.5;
  group.add(mesh);
  scene.add(group);
  const player = new T.Group();
  player.name = 'Own avatar';
  const body = new T.Mesh(new T.BoxGeometry(2, 2, 0.3), new T.MeshBasicMaterial());
  body.position.set(0, 1, 3);
  player.add(body);
  scene.add(player);
  return {
    scene,
    camera,
    group,
    player,
    runtime: {
      scene,
      camera,
      Walk: { state: { characterMesh: player } },
      METERS_PER_WORLD_UNIT: 1,
      getEnv: () => 'EARTH',
      getCurrentTravelMode: () => 'walk',
      getLiveGpsSnapshot: () => ({ active: false })
    },
    subject: { id: 'test-layer', objects: [group] }
  };
}
test('an eye-level shutter ignores only its own avatar, retaining real scene occlusion', () => {
  const c = course();
  assert.equal(inspectFieldPhoto(c.runtime, c.subject).view.subjectId, 'test-layer');
  const wall = new T.Mesh(new T.BoxGeometry(3, 3, 0.2), new T.MeshBasicMaterial());
  wall.name = 'Physical wall';
  wall.position.set(0, 1, 1.6);
  c.scene.add(wall);
  assert.throws(
    () => inspectFieldPhoto(c.runtime, c.subject),
    (error) =>
      /obscured/.test(error.message) &&
      error.fieldPhotoDiagnostics.samples.some((row) => row.hit === 'Physical wall')
  );
  wall.visible = false;
  assert.equal(inspectFieldPhoto(c.runtime, c.subject).view.visible, true);
});
test('an off-screen or hidden field subject cannot become a photo record', () => {
  const c = course();
  c.group.visible = false;
  assert.throws(() => inspectFieldPhoto(c.runtime, c.subject), /no longer exposed/);
  c.group.visible = true;
  c.camera.lookAt(0, 1.5, 10);
  assert.throws(() => inspectFieldPhoto(c.runtime, c.subject), /Aim/);
});

test('opaque world labels cannot certify a subject they obscure in the saved pixels', () => {
  const c = course(),
    label = new T.Sprite(new T.SpriteMaterial({ color: 0x17302a, depthTest: true }));
  label.position.set(0, 1, 2);
  label.scale.set(5, 4, 1);
  c.scene.add(label);
  assert.throws(() => inspectFieldPhoto(c.runtime, c.subject), /obscured/);
  label.visible = false;
  assert.equal(inspectFieldPhoto(c.runtime, c.subject).view.visible, true);
});
