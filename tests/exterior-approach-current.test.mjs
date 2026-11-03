import test from 'node:test';
import assert from 'node:assert/strict';
import { exteriorApproach } from '../app/js/interiors/exterior-approach.js';
const support = {
  enterable: true,
  entryAnchor: { x: 0, z: 1.8 },
  footprint: [
    { x: -4, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 10 },
    { x: -4, z: 10 },
  ],
};
test('outdoor approach uses the published door approach rather than its wall point or interior spawn', () => {
  assert.deepEqual(
    exteriorApproach(
      { ...support, exteriorEntrance: { x: 0, z: 0, approachX: 0, approachZ: -1.8 } },
      { x: 10, z: 20 },
      1
    ),
    { x: 0, z: -1.8 }
  );
  assert.equal(exteriorApproach({ enterable: false }), null);
});
test('a personal room without a published facade door routes outside the actual closest wall at original world scale', () => {
  const p = exteriorApproach(support, { x: 1, z: -5 }, 1.11);
  assert.deepEqual(p, { x: 1, z: -1.2 / 1.11 });
  assert.ok(Math.hypot(p.x - support.entryAnchor.x, p.z - support.entryAnchor.z) < 5);
  const reverse = exteriorApproach(
    { ...support, footprint: [...support.footprint].reverse() },
    { x: 1, z: -5 },
    1.11
  );
  assert.deepEqual(reverse, p);
  const insideOrigin = exteriorApproach(support, { x: 0, z: 5 }, 1);
  assert.ok(insideOrigin.x < -4 || insideOrigin.x > 4 || insideOrigin.z < 0 || insideOrigin.z > 10);
});
