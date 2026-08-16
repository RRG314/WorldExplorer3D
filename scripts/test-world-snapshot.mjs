import assert from 'node:assert/strict';
import { createWorldLoadRequest } from '../app/js/earth-core/world-load-request.js';
import {
  createWorldSnapshot,
  createWorldSnapshotStore,
  WORLD_SNAPSHOT_LAYERS
} from '../app/js/earth-core/world-snapshot.js';

const request = createWorldLoadRequest({
  key: 'monaco',
  name: 'Monaco',
  lat: 43.7384,
  lon: 7.4246
}, 7);
const first = createWorldSnapshot({
  request,
  createdAt: 100,
  counts: { roads: 1 },
  layers: {
    terrain: {
      authority: 'accepted-ground',
      completeness: 'complete',
      source: { providerId: 'mapzen-terrarium', release: 'location-fixed' },
      records: [{ id: 'terrain:district', verticalDatum: 'egm96' }]
    },
    transport: {
      authority: 'overture-transport',
      completeness: 'complete',
      records: [{ id: 'road:1', kind: 'residential', geometry: { points: [[0, 0], [1, 1]] } }]
    }
  }
});

assert.equal(first.type, 'WorldSnapshot');
assert.equal(first.requestId, request.id);
assert.equal(first.sequence, request.sequence);
assert.equal(first.publishedAt, 100);
assert.deepEqual(first.counts, { roads: 1 });
assert.equal(Object.isFrozen(first), true);
assert.equal(Object.isFrozen(first.layers), true);
assert.equal(Object.isFrozen(first.layers.terrain.records), true);
assert.equal(Object.isFrozen(first.layers.terrain.records[0]), true);
assert.equal(Object.isFrozen(first.layers.transport.records[0].geometry.points[0]), true);
assert.deepEqual(Object.keys(first.layers), WORLD_SNAPSHOT_LAYERS);
assert.equal(first.layers.hydrology.completeness, 'empty');

assert.throws(() => createWorldSnapshot({
  request,
  layers: { buildings: { records: [{ id: 'building:1' }] } }
}), /explicit authority/);
assert.throws(() => createWorldSnapshot({
  request,
  layers: {
    transport: {
      authority: 'overture-transport',
      records: [{ id: 'road:1' }, { id: 'road:1' }]
    }
  }
}), /duplicate record id/);

const disposed = [];
const store = createWorldSnapshotStore({ dispose: (snapshot) => disposed.push(snapshot.id) });
const rejected = store.publish(first, { expectedRequestId: 'different-request' });
assert.equal(rejected.published, false);
assert.equal(store.snapshot().current, null, 'rejected publication must not mutate the current world');

assert.equal(store.publish(first).published, true);
assert.equal(store.snapshot().current, first);
assert.equal(store.publish(first).reason, 'already-current');
assert.equal(store.snapshot().revision, 1, 'idempotent publication must not increment revision');
const secondRequest = createWorldLoadRequest({
  key: 'baltimore',
  name: 'Baltimore',
  lat: 39.2913,
  lon: -76.6097
}, 8);
const second = createWorldSnapshot({ request: secondRequest, createdAt: 200 });
const replacement = store.publish(second);
assert.equal(replacement.previous, first);
assert.equal(store.snapshot().current, second);
assert.deepEqual(disposed, [first.id]);

console.log(JSON.stringify({
  ok: true,
  contract: 'immutable-world-snapshot-and-atomic-store',
  layers: WORLD_SNAPSHOT_LAYERS,
  revision: store.snapshot().revision
}, null, 2));
