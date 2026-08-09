import assert from 'node:assert/strict';
import {
  cancelTerrainTileRequest,
  waitForTerrainTileRequest
} from '../app/js/terrain/tile-request-lifecycle.js';

const cache = new Map();
let sourceCleared = false;
let readyResolved = null;
const tile = {
  key: '12/1/2', loaded: false, loading: true, failed: false, attempts: 1,
  ready: new Promise((resolve) => { readyResolved = resolve; }),
  resolveReady: null,
  img: {
    onload: () => {},
    onerror: () => {},
    set src(value) { if (value === '') sourceCleared = true; }
  }
};
tile.resolveReady = readyResolved;
cache.set(tile.key, tile);
assert.equal(cancelTerrainTileRequest(cache, 12, 1, 2), true);
assert.equal(cache.has(tile.key), false);
assert.equal(tile.evicted, true);
assert.equal(sourceCleared, true);
assert.equal(await tile.ready, false);

const controller = new AbortController();
const activeTile = {
  loaded: false, loading: true, failed: false, attempts: 1,
  nextRetryAt: 0, ready: new Promise(() => {})
};
let cancelled = 0;
const waiting = waitForTerrainTileRequest({
  z: 12, x: 3, y: 4, deadline: 10000, deps: {}, signal: controller.signal,
  getOrLoadTerrainTile: () => activeTile,
  failTerrainTileAttempt: () => assert.fail('aborted tile must not be marked as a timeout'),
  terrainNow: () => 0,
  cancelTile: () => { cancelled += 1; return true; },
  maxAttempts: 3,
  attemptTimeoutMs: 2400
});
controller.abort('generation-replaced');
assert.equal(await waiting, false);
assert.equal(cancelled, 1);

console.log(JSON.stringify({
  ok: true,
  contract: 'terrain-tile-generation-cancellation',
  behaviors: [
    'active-image-request-cleared',
    'cache-entry-evicted',
    'waiter-resolved',
    'abort-not-misreported-as-timeout'
  ]
}, null, 2));
