import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import { sampleFieldSurfacePoints } from '../app/js/campaign/field-surface-samples.js';
import { createFieldOpacitySampler } from '../app/js/campaign/field-opacity-sampler.js';
import { inspectFieldPhoto } from '../app/js/campaign/field-photo-tool.js';
const sandbox = { console };
vm.runInNewContext(
  await fs.readFile(new URL('../app/vendor/three/build/three.min.js', import.meta.url), 'utf8'),
  sandbox
);
const T = (globalThis.THREE = sandbox.THREE);
test('surface probes retain only opaque triangle pixels, cap work and leave geometry unchanged', () => {
  const bytes = new Uint8Array([
      255, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 255
    ]),
    map = new T.DataTexture(bytes, 2, 2, T.RGBAFormat),
    root = new T.Group(),
    mesh = new T.Mesh(
      new T.PlaneGeometry(2, 2),
      new T.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.5, side: T.DoubleSide })
    );
  root.add(mesh);
  const source = Array.from(mesh.geometry.attributes.position.array),
    opacity = createFieldOpacitySampler(),
    points = sampleFieldSurfacePoints({
      THREE: T,
      root,
      opacity,
      maxPoints: 12,
      maxCandidates: 256
    });
  assert.equal(points.length, 12);
  for (const p of points) {
    assert.ok(p.x >= 0 && p.x <= 1);
    assert.ok(p.y >= -0.7 && p.y <= 1);
    assert.equal(p.z, 0);
  }
  assert.deepEqual(Array.from(mesh.geometry.attributes.position.array), source);
  bytes.fill(0);
  opacity.dispose();
  assert.equal(
    sampleFieldSurfacePoints({
      THREE: T,
      root,
      opacity: createFieldOpacitySampler(),
      maxCandidates: 17
    }).length,
    0
  );
});
test('additional surface targets never bypass a real opaque wall', () => {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(60, 1, 0.1, 100),
    root = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial()),
    wall = new T.Mesh(new T.BoxGeometry(3, 3, 0.1), new T.MeshBasicMaterial());
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);
  wall.position.z = 2;
  scene.add(root, wall);
  const runtime = { scene, camera, getEnv: () => 'EARTH', getCurrentTravelMode: () => 'walk' },
    opacity = createFieldOpacitySampler();
  assert.throws(
    () =>
      inspectFieldPhoto(
        runtime,
        { id: 'plant', objects: [root] },
        {
          acceptIntersection: opacity.accepts,
          sampleSurfacePoints: (root) => sampleFieldSurfacePoints({ THREE: T, root, opacity })
        }
      ),
    /obscured/
  );
  opacity.dispose();
});
