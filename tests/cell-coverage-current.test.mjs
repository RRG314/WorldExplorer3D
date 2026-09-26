import test from 'node:test';
import assert from 'node:assert/strict';
import { createCellCoverage } from '../app/js/world/cell-coverage.js';
import { createBuildingRoadFootprintGuards } from '../app/js/world/building-road-footprint.js';

test('compressed coverage matches the original explicit cells for overlaps, gaps and negative coordinates', () => {
  const actual = createCellCoverage(), expected = new Set();
  let seed = 713;
  const next = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0);
  const stamps = [[0, 0, 0], [0, 4, 1], [0, 1, 1], [-5, -5, 2], [0, 0, 0]];
  for (let i = 0; i < 500; i++) stamps.push([next() % 150 - 75, next() % 150 - 75, next() % 5]);
  for (const [x, z, radius] of stamps) {
    actual.addSquare(x, z, radius);
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) expected.add(`${x + dx},${z + dz}`);
    assert.equal(actual.stats().coveredCells, expected.size);
  }
  for (let x = -85; x <= 85; x++) for (let z = -85; z <= 85; z++) {
    assert.equal(actual.has(x, z), expected.has(`${x},${z}`), `${x},${z}`);
  }
});

test('wide overlapping corridors retain rows of intervals rather than one record per cell', () => {
  const actual = createCellCoverage();
  for (let z = -1000; z <= 1000; z += 10) actual.addSquare(0, z, 20);
  assert.deepEqual(actual.stats(), { rows: 41, intervals: 41, coveredCells: 41 * 2041 });
  assert.equal(actual.has(20, 1020), true);
  assert.equal(actual.has(21, 0), false);
  assert.equal(actual.has(0, 1021), false);
});

test('row merging preserves a real gap and coordinates beyond signed 32-bit range', () => {
  const c = createCellCoverage(), x = 2 ** 32;
  c.addSquare(x, 0, 1); c.addSquare(x, 5, 1);
  assert.equal(c.has(x, 2), false);
  c.addSquare(x, 2, 0);
  assert.equal(c.has(x, 2), true);
  assert.equal(c.has(x, 3), false);
  c.addSquare(x, 3, 0);
  assert.equal(c.has(x, 3), true);
  assert.equal(c.has(NaN, 0), false);
  assert.throws(() => c.addSquare(Number.MAX_SAFE_INTEGER, 0, 1), RangeError);
});

test('building placement keeps the same world-space corridor boundaries across negative grid cells', async () => {
  const guards = await createBuildingRoadFootprintGuards({
    roads: [{ width: 8, pts: [{ x: -10, z: 0 }, { x: 10, z: 0 }] }],
    yieldToMainThread: async () => {}
  });
  for (let x = -24; x <= 24; x += .5) for (let z = -12; z <= 16; z += .5) {
    assert.equal(guards.pointOnRoadCorridor(x, z), x >= -20 && x < 20 && z >= -8 && z < 12, `${x},${z}`);
  }
  assert.equal(guards.pointOnRoadCorridor(NaN, 0), false);
});
