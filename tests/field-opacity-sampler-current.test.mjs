import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createFieldOpacitySampler } from '../app/js/campaign/field-opacity-sampler.js';
const sandbox = {};
vm.runInNewContext(
  await fs.readFile(new URL('../app/vendor/three/build/three.min.js', import.meta.url), 'utf8'),
  sandbox
);
const T = sandbox.THREE;
const texture = (data, w = 2, h = 2) => {
  const t = new T.DataTexture(new Uint8Array(data), w, h, T.RGBAFormat);
  t.flipY = false;
  return t;
};
const hit = (material, u = 0.1, v = 0.1, index = 0) => ({
  object: { material },
  uv: new T.Vector2(u, v),
  face: { materialIndex: index }
});
test('cutout pixels and texture orientation determine a leaf hit, not its rectangular mesh', () => {
  const map = texture([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0]),
    material = new T.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.45 }),
    sampler = createFieldOpacitySampler();
  assert.equal(sampler.accepts(hit(material)), false);
  assert.equal(sampler.accepts(hit(material, 0.6)), true);
  map.flipY = true;
  assert.equal(sampler.accepts(hit(material)), true);
  sampler.dispose();
});
test('material slots, opacity and alpha-map green channel retain actual render cutoffs', () => {
  const alpha = texture([0, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255]),
    solid = new T.MeshBasicMaterial(),
    leaf = new T.MeshBasicMaterial({
      alphaMap: alpha,
      transparent: true,
      opacity: 0.5,
      alphaTest: 0.45
    }),
    sampler = createFieldOpacitySampler();
  assert.equal(sampler.accepts(hit([solid, leaf], 0.1, 0.1, 0)), true);
  assert.equal(sampler.accepts(hit([solid, leaf], 0.1, 0.1, 1)), false);
  assert.equal(sampler.accepts(hit([solid, leaf], 0.6, 0.1, 1)), true);
  leaf.opacity = 0.4;
  assert.equal(sampler.accepts(hit(leaf, 0.6)), false);
  sampler.dispose();
});
test('sampled pixels obey the memory bound, evict safely and release on field disposal', () => {
  const sampler = createFieldOpacitySampler({ maxBytes: 4 }),
    a = new T.MeshBasicMaterial({ map: texture([0, 0, 0, 255], 1, 1), transparent: true }),
    b = new T.MeshBasicMaterial({ map: texture([0, 0, 0, 0], 1, 1), transparent: true });
  assert.equal(sampler.accepts(hit(a)), true);
  assert.equal(sampler.accepts(hit(b)), false);
  assert.deepEqual(sampler.snapshot(), { textures: 1, bytes: 4, maxBytes: 4 });
  assert.equal(sampler.accepts(hit(a)), true);
  sampler.dispose();
  assert.deepEqual(sampler.snapshot(), { textures: 0, bytes: 0, maxBytes: 4 });
  assert.throws(() => sampler.accepts(hit(a)), /stopped/);
});
