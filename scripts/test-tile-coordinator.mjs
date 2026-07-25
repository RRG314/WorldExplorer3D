import assert from 'node:assert/strict';
import { createTileCoordinator } from '../app/js/world/tile-coordinator.js';

const events = [];
const attempts = new Map();
let concurrentLoads = 0;
let peakConcurrentLoads = 0;

const coordinator = createTileCoordinator({
  sourceIdentity: 'openstreetmap/shortbread-v1/fixture',
  maxConcurrent: 2,
  maxQueue: 4,
  retryCount: 1,
  retryDelay: () => 0,
  async load({ address, cacheKey, signal }) {
    concurrentLoads += 1;
    peakConcurrentLoads = Math.max(peakConcurrentLoads, concurrentLoads);
    events.push(`load:${address.key}:${cacheKey}`);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const attempt = attempts.get(address.key) || 0;
      attempts.set(address.key, attempt + 1);
      if (address.key === '4/2/2' && attempt === 0) throw new Error('transient');
      if (address.key === '4/3/3') {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (signal.aborted) {
          const error = new Error('aborted');
          error.name = 'AbortError';
          throw error;
        }
      }
      return { key: address.key };
    } finally {
      concurrentLoads -= 1;
    }
  },
  async compile({ raw, generation }) {
    return Object.freeze({ id: `${raw.key}@${generation}` });
  },
  async commit(tile, context) {
    assert.equal(context.isCurrent(), true);
    events.push(`commit:${tile.id}`);
    if (tile.id === '4/1/1@2') throw new Error('commit rejected');
    return Object.freeze({ owner: tile.id });
  },
  async retire(ownership, context) {
    events.push(`retire:${ownership.owner}:${context.reason}`);
  },
  async disposeCandidate(tile, reason) {
    events.push(`dispose:${tile.id}:${reason}`);
  }
});

const generationOne = coordinator.beginGeneration(1);
assert.equal(generationOne, 1);
const firstRequest = coordinator.request({ z: 4, x: 1, y: 1 });
const duplicateRequest = coordinator.request({ z: 4, x: 1, y: 1 });
assert.equal(firstRequest, duplicateRequest, 'Duplicate in-flight tile requests must share one promise.');
const retryRequest = coordinator.request({ z: 4, x: 2, y: 2 });
const [firstResult, duplicateResult, retryResult] = await Promise.all([
  firstRequest,
  duplicateRequest,
  retryRequest
]);
assert.equal(firstResult.status, 'committed');
assert.equal(duplicateResult.status, 'committed');
assert.equal(retryResult.status, 'committed');
assert.equal(attempts.get('4/2/2'), 2);
assert.equal(peakConcurrentLoads, 2);

const activeHit = await coordinator.request({ z: 4, x: 1, y: 1 });
assert.equal(activeHit.status, 'active');

const staleInFlight = coordinator.request({ z: 4, x: 3, y: 3 });
coordinator.beginGeneration(2);
const staleResult = await staleInFlight;
assert.equal(staleResult.status, 'stale');
assert.equal(staleResult.reason, 'superseded');

const beforeFailure = coordinator.snapshot();
const replacementFailure = await coordinator.request({ z: 4, x: 1, y: 1 });
assert.equal(replacementFailure.status, 'failed');
assert.deepEqual(coordinator.snapshot().activeKeys, beforeFailure.activeKeys);
assert.deepEqual(
  coordinator.snapshot().activeEntries.find((entry) => entry.key === '4/1/1'),
  {
    key: '4/1/1',
    generation: 1,
    cacheKey: 'openstreetmap/shortbread-v1/fixture:4/1/1'
  },
  'A failed replacement must preserve the previously committed tile.'
);
assert.ok(events.includes('dispose:4/1/1@2:commit-failed'));

const reconcileResults = await coordinator.reconcile([
  { z: 4, x: 5, y: 5 },
  { z: 4, x: 6, y: 6 }
]);
assert.deepEqual(reconcileResults.map((result) => result.status), ['committed', 'committed']);
assert.deepEqual(coordinator.snapshot().activeKeys, ['4/5/5', '4/6/6']);
assert.ok(events.some((event) => event === 'retire:4/1/1@1:outside-desired-set'));
assert.ok(events.some((event) => event === 'retire:4/2/2@1:outside-desired-set'));

const bounded = createTileCoordinator({
  maxConcurrent: 1,
  maxQueue: 1,
  load: () => new Promise(() => {}),
  compile: async ({ raw }) => raw,
  commit: async () => ({}),
  retire: async () => {}
});
bounded.beginGeneration(1);
void bounded.request({ z: 4, x: 1, y: 1 });
const dropped = await bounded.request({ z: 4, x: 2, y: 2 });
assert.equal(dropped.status, 'dropped');
assert.equal(bounded.snapshot().counters.dropped, 1);

await coordinator.close();
assert.equal(coordinator.snapshot().active, 0);
assert.equal(coordinator.snapshot().closed, true);
assert.equal(coordinator.snapshot().counters.retried, 1);
assert.equal(coordinator.snapshot().counters.deduplicated, 1);
assert.ok(coordinator.snapshot().counters.retired >= 4);

console.log(JSON.stringify({
  ok: true,
  maxConcurrent: peakConcurrentLoads,
  retryCertified: true,
  staleGenerationRejected: true,
  atomicFailurePreservedActiveSet: true,
  boundedQueueCertified: true,
  final: coordinator.snapshot()
}, null, 2));
