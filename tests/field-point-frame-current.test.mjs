import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createFieldOpacitySampler } from '../app/js/campaign/field-opacity-sampler.js';
import { sampleFieldPointFrame } from '../app/js/campaign/field-point-frame.js';
const sandbox = {};
vm.runInNewContext(
  await fs.readFile(new URL('../app/vendor/three/build/three.min.js', import.meta.url), 'utf8'),
  sandbox
);
const T = sandbox.THREE;
function plot(unit = 1) {
  const soil = new T.Mesh(new T.PlaneGeometry(1.6 / unit, 1.6 / unit), new T.MeshBasicMaterial()),
    texture = new T.DataTexture(
      new Uint8Array([0, 150, 0, 255, 0, 150, 0, 0, 0, 150, 0, 0, 0, 150, 0, 255]),
      2,
      2,
      T.RGBAFormat
    );
  texture.flipY = false;
  const plant = new T.Mesh(
    new T.PlaneGeometry(1.6 / unit, 1.6 / unit),
    new T.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.45 })
  );
  soil.rotation.x = plant.rotation.x = -Math.PI / 2;
  plant.position.y = 0.4 / unit;
  return { soil, plant, opacity: createFieldOpacitySampler() };
}
test('sixteen physical downward points count visible leaf pixels and retain the bare-soil intersections', () => {
  const p = plot(),
    before = p.plant.position.clone(),
    reading = sampleFieldPointFrame({
      THREE: T,
      plants: [p.plant],
      soil: p.soil,
      center: { x: 0, z: 0 },
      opacity: p.opacity
    });
  assert.equal(reading.vegetationHits, 8);
  assert.equal(reading.coverPercent, 50);
  assert.equal(reading.points.length, 16);
  assert.ok(
    reading.points
      .filter((row) => row.kind === 'vegetation')
      .every((row) => Math.abs(row.hitY - 0.4) < 1e-6)
  );
  assert.ok(
    reading.points.filter((row) => row.kind === 'soil').every((row) => Math.abs(row.hitY) < 1e-6)
  );
  assert.deepEqual(p.plant.position, before);
  p.opacity.dispose();
});
test('repeated fixed sampling respects world units and does not invent support under a missing surface', () => {
  const p = plot(2),
    input = {
      THREE: T,
      plants: [p.plant],
      soil: p.soil,
      center: { x: 0, z: 0 },
      metersPerUnit: 2,
      opacity: p.opacity
    },
    first = sampleFieldPointFrame(input);
  assert.deepEqual(sampleFieldPointFrame(input), first);
  p.plant.visible = false;
  assert.equal(sampleFieldPointFrame(input).coverPercent, 0);
  p.soil.visible = false;
  assert.throws(() => sampleFieldPointFrame(input), /supported plot/);
  p.opacity.dispose();
});
