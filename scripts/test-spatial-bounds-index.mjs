#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  createSpatialBoundsIndex,
  querySpatialBoundsIndex,
  querySpatialBoundsPoint
} from '../app/js/spatial-bounds-index.js';

const nearOrigin = { id: 'origin', bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } };
const crossesCells = { id: 'crosses', bounds: { minX: 90, maxX: 210, minZ: 90, maxZ: 210 } };
const distant = { id: 'distant', bounds: { minX: 800, maxX: 820, minZ: 800, maxZ: 820 } };
const overflow = { id: 'overflow', bounds: { minX: -10000, maxX: 10000, minZ: -10000, maxZ: 10000 } };
const invalid = { id: 'invalid', bounds: { minX: NaN, maxX: 0, minZ: 0, maxZ: 0 } };

const index = createSpatialBoundsIndex(
  [nearOrigin, crossesCells, distant, overflow, invalid],
  { cellSize: 100, maxCellsPerItem: 16 }
);

assert.deepEqual(
  querySpatialBoundsPoint(index, 0, 0).map((item) => item.id).sort(),
  ['crosses', 'origin', 'overflow'],
  'point queries should return only same-cell and overflow candidates'
);
const multiCellResults = querySpatialBoundsIndex(index, {
  minX: 95,
  maxX: 205,
  minZ: 95,
  maxZ: 205
});
assert.deepEqual(
  multiCellResults.map((item) => item.id).sort(),
  ['crosses', 'origin', 'overflow'],
  'queries should return candidates from every touched cell'
);
assert.equal(
  multiCellResults.filter((item) => item === crossesCells).length,
  1,
  'multi-cell items should be deduplicated'
);
assert.deepEqual(
  querySpatialBoundsPoint(index, 810, 810).map((item) => item.id).sort(),
  ['distant', 'overflow'],
  'distant cells should not scan unrelated local items'
);
assert.equal(
  querySpatialBoundsPoint(index, Number.NaN, 0).length,
  0,
  'invalid query coordinates should not fall back to a global scan'
);
assert.equal(index.allItems.includes(invalid), false, 'invalid item bounds should be excluded');

console.log(JSON.stringify({
  ok: true,
  indexedItems: index.allItems.length,
  cells: index.cells.size,
  overflowItems: index.overflow.length
}, null, 2));
