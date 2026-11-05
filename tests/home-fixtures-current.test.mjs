import test from 'node:test';
import assert from 'node:assert/strict';
import { planHomeFixtures } from '../app/js/interiors/home-fixtures.js';
test('small and irregular rooms retain clear entry circulation and fitted furniture never crosses the shell', () => {
  for (const [width, depth] of [
    [4, 4],
    [3, 5],
    [8, 7],
  ]) {
    const state = {
      usableFootprint: [
        { x: 0, z: 0 },
        { x: width, z: 0 },
        { x: width, z: depth },
        { x: 0, z: depth },
      ],
      entryPoint: { x: width / 2, z: 0.5 },
      center: { x: width / 2, z: depth / 2 },
    };
    const contains = (x, z) => x > 0 && x < width && z > 0 && z < depth;
    const planned = planHomeFixtures(state, { contains });
    assert.ok(planned.some((p) => p.kind === 'bed'));
    for (const p of planned) {
      assert.ok(
        p.x - p.width / 2 > 0 &&
          p.x + p.width / 2 < width &&
          p.z - p.depth / 2 > 0 &&
          p.z + p.depth / 2 < depth
      );
      // Independently sample a walking capsule down the entry-to-center
      // path. Its rounded endpoint can pass beside a furniture corner.
      for (let z = 0.5; z <= depth / 2; z += 0.025) {
        const dx = Math.max(0, Math.abs(p.x - width / 2) - p.width / 2);
        const dz = Math.max(0, Math.abs(p.z - z) - p.depth / 2);
        assert.ok(Math.hypot(dx, dz) >= 0.65);
      }
    }
  }
  const triangle = {
    usableFootprint: [
      { x: 0, z: 0 },
      { x: 5, z: 0 },
      { x: 0, z: 5 },
    ],
    entryPoint: { x: 0.4, z: 0.4 },
    center: { x: 1.6, z: 1.6 },
  };
  for (const p of planHomeFixtures(triangle, { contains: (x, z) => x > 0 && z > 0 && x + z < 5 }))
    assert.ok(p.x + p.width / 2 + p.z + p.depth / 2 < 5);
});
