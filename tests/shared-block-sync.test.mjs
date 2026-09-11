import assert from 'node:assert/strict';
import test from 'node:test';
import { createSharedBlockSync } from '../app/js/block-builder/shared-sync.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function createSync(overrides = {}) {
  return createSharedBlockSync({
    blockKey: (gx, gy, gz) => `${gx}|${gy}|${gz}`,
    toVerticalGridCoord: (value) => Math.round(Number(value) * 2) / 2,
    onRefresh: () => {},
    ...overrides
  });
}

test('disconnected upsert never creates optimistic shared state', () => {
  const sync = createSync();
  sync.configure({ enabled: true, roomId: 'ROOM01', connected: false, upsert: async () => {} });
  const result = sync.upsert({ gx: 1, gy: 0.5, gz: 2, shape: 'wall', materialIndex: 2, rotation: 1 });
  assert.equal(result, null);
  assert.deepEqual(sync.getEntries(), []);
  assert.deepEqual(sync.getStatus(), {
    enabled: true,
    roomId: 'ROOM01',
    totalCount: 0,
    connected: false,
    pendingCount: 0,
    detail: 'Room connection is offline. Reconnect and try again.'
  });
});

test('connection loss rolls back an unresolved upsert and preserves its failure identity', async () => {
  const request = deferred();
  const failures = [];
  const sync = createSync();
  sync.configure({ enabled: true, roomId: 'ROOM02', upsert: () => request.promise });
  const placed = sync.upsert(
    { gx: 3, gy: 1, gz: 4, shape: 'ramp', materialIndex: 4, rotation: 2 },
    (error, entry) => failures.push({ message: error.message, entry })
  );
  assert.equal(sync.getEntries().length, 1);
  assert.equal(sync.getStatus().pendingCount, 1);
  sync.setConnected(false);
  assert.deepEqual(sync.getEntries(), []);
  assert.equal(sync.getStatus().pendingCount, 0);
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /not committed/i);
  assert.equal(failures[0].entry.id, placed.id);
  request.resolve();
  await request.promise;
  assert.deepEqual(sync.getEntries(), []);
});

test('the same actor can reconnect, commit, and remove without stale rollback', async () => {
  const writes = [];
  const removals = [];
  const sync = createSync();
  sync.configure({
    enabled: true,
    roomId: 'ROOM03',
    connected: false,
    upsert: async (entry) => writes.push(entry.id),
    remove: async (entry) => removals.push(entry.id)
  });
  const input = { gx: 5, gy: 0.5, gz: 6, shape: 'cube', materialIndex: 1, rotation: 0 };
  assert.equal(sync.upsert(input), null);
  sync.setConnected(true);
  const committed = sync.upsert(input);
  await Promise.resolve();
  assert.equal(sync.getEntries().length, 1);
  assert.deepEqual(writes, [committed.id]);
  const removed = sync.remove(input);
  await Promise.resolve();
  assert.equal(removed.id, committed.id);
  assert.deepEqual(sync.getEntries(), []);
  assert.deepEqual(removals, [committed.id]);
  assert.equal(sync.getStatus().pendingCount, 0);
});

test('a second action for one coordinate waits for the first commit instead of creating a rollback race', async () => {
  const request = deferred();
  const sync = createSync();
  sync.configure({ enabled: true, roomId: 'ROOM04', upsert: () => request.promise, remove: async () => {} });
  const input = { gx: 7, gy: 0.5, gz: 8, shape: 'cube', materialIndex: 0, rotation: 0 };
  const pending = sync.upsert(input);
  assert.ok(pending);
  assert.equal(sync.remove(input), null);
  assert.equal(sync.getEntries().length, 1);
  assert.equal(sync.getStatus().pendingCount, 1);
  request.resolve();
  await request.promise;
  await Promise.resolve();
  assert.equal(sync.getStatus().pendingCount, 0);
  assert.ok(sync.remove(input));
  await Promise.resolve();
  assert.deepEqual(sync.getEntries(), []);
});
