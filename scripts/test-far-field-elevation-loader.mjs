import assert from 'node:assert/strict';
import {
  FAR_TERRAIN_REQUEST_CONCURRENCY,
  loadFarTerrainElevationWithParentFallback,
  loadFarTerrainElevationTiles
} from '../app/js/terrain/far-field-elevation-loader.js';
import { parentTerrainTile } from '../app/js/terrain/far-field.js';

assert.deepEqual(parentTerrainTile({ z: 12, tx: 1364, ty: 3127 }), { z: 11, tx: 682, ty: 1563 });
assert.deepEqual(parentTerrainTile({ z: 1, tx: 1, ty: 1 }, 2), { z: 0, tx: 0, ty: 0 });

const tiles = Array.from({ length: 80 }, (_, index) => ({ key: `tile-${index}` }));
let inFlight = 0;
let measuredMaximum = 0;
const complete = await loadFarTerrainElevationTiles({
  tiles,
  concurrency: 7,
  loadTile: async () => {
    inFlight += 1;
    measuredMaximum = Math.max(measuredMaximum, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight -= 1;
    return true;
  }
});
assert.equal(complete.started, tiles.length);
assert.equal(complete.completed, tiles.length);
assert.equal(complete.cancelled, false);
assert.equal(complete.maxInFlight, 7);
assert.equal(measuredMaximum, 7);
assert.ok(complete.ready.every(Boolean));

let active = true;
let cancelledCompletions = 0;
const cancelled = await loadFarTerrainElevationTiles({
  tiles,
  concurrency: FAR_TERRAIN_REQUEST_CONCURRENCY,
  isActive: () => active,
  loadTile: async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    cancelledCompletions += 1;
    if (cancelledCompletions === 1) active = false;
    return true;
  }
});
assert.equal(cancelled.cancelled, true);
assert.equal(cancelled.maxInFlight, FAR_TERRAIN_REQUEST_CONCURRENCY);
assert.ok(cancelled.started <= FAR_TERRAIN_REQUEST_CONCURRENCY, 'cancellation must not start another request batch');
assert.equal(cancelled.unstarted, tiles.length - cancelled.started);

const parentAttempts = [];
const recovered = await loadFarTerrainElevationWithParentFallback({
  tiles: [
    { z: 12, tx: 100, ty: 200, key: '12/100/200' },
    { z: 12, tx: 101, ty: 200, key: '12/101/200' },
    { z: 12, tx: 104, ty: 202, key: '12/104/202' }
  ],
  parentTile: parentTerrainTile,
  loadTile: async (tile) => {
    if (tile.z === 12) return tile.tx === 100;
    parentAttempts.push(tile.key);
    return true;
  }
});
assert.equal(recovered.ready, true);
assert.equal(recovered.missingSourceTiles.length, 2);
assert.deepEqual(parentAttempts.sort(), ['11/50/100', '11/52/101']);

const unrecovered = await loadFarTerrainElevationWithParentFallback({
  tiles: [{ z: 12, tx: 100, ty: 200, key: '12/100/200' }],
  parentTile: parentTerrainTile,
  loadTile: async () => false
});
assert.equal(unrecovered.ready, false);

await assert.rejects(
  loadFarTerrainElevationTiles({ tiles: [{}] }),
  /requires loadTile/
);

console.log(JSON.stringify({
  ok: true,
  contract: 'far-terrain-elevation-request-budget',
  defaultConcurrency: FAR_TERRAIN_REQUEST_CONCURRENCY,
  fullLoadMaximum: complete.maxInFlight,
  cancellationStarted: cancelled.started,
  cancellationUnstarted: cancelled.unstarted,
  parentFallbackRecovered: recovered.missingSourceTiles.length
}, null, 2));
