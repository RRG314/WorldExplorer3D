import { inspectWildlifeObservation } from '../app/js/campaign/wildlife-sight.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import { inspectWildlifeSensor } from '../app/js/campaign/wildlife-tools.js';
const sandbox = { console };
vm.runInNewContext(
  await fs.readFile(new URL('../app/vendor/three/build/three.min.js', import.meta.url), 'utf8'),
  sandbox
);
const T = (globalThis.THREE = sandbox.THREE);
test('mounted sensor requires alignment, a bounded cone, range and real unoccluded geometry', () => {
  const scene = new T.Scene(),
    object = new T.Group(),
    animal = new T.Mesh(new T.BoxGeometry(1, 1.5, 0.6), new T.MeshBasicMaterial());
  animal.position.y = 0.75;
  object.add(animal);
  object.position.z = -7;
  scene.add(object);
  scene.add(new T.Sprite(new T.SpriteMaterial()));
  scene.updateMatrixWorld(true);
  const runtime = { scene, METERS_PER_WORLD_UNIT: 1 },
    sensor = { origin: { x: 0, y: 1, z: 0 }, bearing: Math.PI, aligned: true },
    subject = { object };
  assert.ok(inspectWildlifeSensor(runtime, sensor, subject));
  sensor.aligned = false;
  assert.equal(inspectWildlifeSensor(runtime, sensor, subject), null);
  sensor.aligned = true;
  sensor.bearing = 0;
  assert.equal(inspectWildlifeSensor(runtime, sensor, subject), null);
  sensor.bearing = Math.PI;
  object.position.z = -15;
  scene.updateMatrixWorld(true);
  assert.equal(inspectWildlifeSensor(runtime, sensor, subject), null);
  object.position.z = -7;
  const wall = new T.Mesh(new T.BoxGeometry(3, 3, 0.2), new T.MeshBasicMaterial());
  wall.position.set(0, 1, -3);
  scene.add(wall);
  scene.updateMatrixWorld(true);
  assert.equal(inspectWildlifeSensor(runtime, sensor, subject), null);
  wall.visible = false;
  assert.ok(inspectWildlifeSensor(runtime, sensor, subject));
  object.visible = false;
  assert.equal(inspectWildlifeSensor(runtime, sensor, subject), null);
});

test('walking observation probes require a visible framed subject, ignoring only the observer avatar', () => {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(60, 1, 0.1, 100),
    object = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial());
  object.position.set(0, 0.8, -6);
  scene.add(object);
  camera.position.set(0, 1.6, 0);
  camera.lookAt(0, 0.8, -6);
  camera.updateMatrixWorld();
  const avatar = new T.Group(),
    body = new T.Mesh(new T.BoxGeometry(1, 2, 0.3), new T.MeshBasicMaterial());
  body.position.set(0, 1, -0.5);
  avatar.add(body);
  scene.add(avatar);
  scene.add(new T.Sprite(new T.SpriteMaterial()));
  scene.updateMatrixWorld(true);
  const runtime = {
    scene,
    camera,
    METERS_PER_WORLD_UNIT: 1,
    Walk: { state: { characterMesh: avatar } }
  };
  assert.ok(inspectWildlifeObservation(runtime, [object]));
  const wall = new T.Mesh(new T.BoxGeometry(2, 3, 0.1), new T.MeshBasicMaterial());
  wall.position.set(0, 1, -3);
  scene.add(wall);
  scene.updateMatrixWorld(true);
  assert.equal(inspectWildlifeObservation(runtime, [object]), null);
  wall.visible = false;
  object.visible = false;
  assert.equal(inspectWildlifeObservation(runtime, [object]), null);
  object.visible = true;
  camera.lookAt(0, 1, 6);
  assert.equal(inspectWildlifeObservation(runtime, [object]), null);
});
