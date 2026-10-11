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
  assert.match(failures[0].message, /not confirmed/i);
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

test('saved receipts wait for acknowledgement and are cancelled on room switch or disconnect', async () => {
  for (const cancellation of ['none', 'room', 'offline', 'reject']) {
    const request = deferred();
    const receipts = [];
    const sync = createSync();
    sync.configure({ enabled: true, roomId: 'ORIGINAL', upsert: () => request.promise });
    sync.upsert({ gx: 2, gy: 0, gz: 4 }, () => {}, (_entry, receipt) => receipts.push(receipt));
    assert.deepEqual(receipts, [], 'optimistic placement is not saved');
    if (cancellation === 'room') sync.configure({ enabled: true, roomId: 'OTHER', upsert: async () => {} });
    if (cancellation === 'offline') sync.setConnected(false);
    if (cancellation === 'reject') request.reject(new Error('permission denied'));
    else request.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(receipts, cancellation === 'none' ? [{ roomId: 'ORIGINAL', count: 1 }] : []);
  }
});

test('save-state observers see the final pending count after placement and Undo', async () => {
  const settled = [];
  const sync = createSync({ onSettled: () => settled.push(sync.getStatus().pendingCount) });
  sync.configure({ enabled: true, roomId: 'SAVING', upsert: async () => {}, remove: async () => {} });
  const input = { gx: 1, gy: 0, gz: 1 };
  sync.upsert(input);
  await new Promise(resolve => setImmediate(resolve));
  sync.remove(input);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(settled, [0, 0], 'Save status must leave pending after both actions');
});

test('a rejected pending placement preserves newer room changes at that address and elsewhere', async () => {
  const request = deferred(); let rendered = [];
  const sync = createSync({ onRefresh: () => { rendered = sync.getEntries(); } });
  sync.configure({ enabled: true, roomId: 'BUILD', upsert: () => request.promise });
  const address = { gx: 2, gy: 0, gz: 3, materialIndex: 1 };
  sync.upsert(address, () => { rendered = []; });
  sync.setEntries([{ ...address, materialIndex: 4 }, { gx: 8, gy: 0, gz: 9 }]);
  assert.equal(sync.getEntries()[0].materialIndex, 1, 'pending preview remains visible');
  request.reject(Error('rejected')); await new Promise(resolve => setImmediate(resolve));
  assert.equal(rendered[0].materialIndex, 4, 'latest accepted room value wins after failure');
  assert.equal(rendered.length, 2); assert.equal(sync.getStatus().pendingCount, 0);
});

test('a rejected removal cannot resurrect a block deleted in a newer room snapshot', async () => {
  const request = deferred(), input = { gx: 2, gy: 0, gz: 3 };
  const sync = createSync();sync.configure({ enabled: true, roomId: 'BUILD', remove: () => request.promise });
  sync.setEntries([input]);assert.ok(sync.remove(input));sync.setEntries([]);
  request.reject(Error('denied'));await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sync.getEntries(), []); assert.equal(sync.getStatus().pendingCount, 0);
});

test('synchronous write failure restores actual room state and disabled/missing adapters cannot preview edits', async () => {
  const input = { gx: 2, gy: 0, gz: 3 };const sync = createSync();
  assert.equal(sync.upsert(input), null);
  sync.configure({ enabled: true, roomId: 'BUILD' });sync.setEntries([input]);
  assert.equal(sync.upsert(input), null);assert.equal(sync.remove(input), null);
  sync.configure({ enabled: true, roomId: 'BUILD', remove() { throw Error('synchronous denial'); } });
  const errors=[];assert.ok(sync.remove(input,error=>errors.push(error.message)));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sync.getEntries().length, 1);assert.equal(sync.getStatus().pendingCount, 0);assert.deepEqual(errors,['synchronous denial']);
});

test('duplicate snapshots publish one immutable block per address', () => {
  const sync=createSync();sync.configure({enabled:true,roomId:'BUILD'});
  sync.setEntries([{gx:1,gy:0,gz:1,materialIndex:0},{gx:1,gy:0,gz:1,materialIndex:3}]);
  assert.equal(sync.getEntries().length,1);assert.equal(sync.getEntries()[0].materialIndex,3);
  assert.throws(()=>{sync.getEntries()[0].gx=7;},TypeError);
});

test('Clear waits for pending edits, converts synchronous failures, and cannot target a newly joined room', async () => {
  const write=deferred(),clear=deferred();let calls=0;
  const sync=createSync();sync.configure({enabled:true,roomId:'OLD',upsert:()=>write.promise,clearMine:()=>{calls++;return clear.promise;}});
  sync.upsert({gx:1,gy:0,gz:1});await assert.rejects(sync.clearMine(),/Wait for/);assert.equal(calls,0);
  write.resolve();await new Promise(resolve=>setImmediate(resolve));
  const cancelled=sync.clearMine();sync.configure({enabled:true,roomId:'NEW',clearMine:()=>{throw Error('must not clear new room');}});
  assert.equal(await cancelled,null);assert.equal(calls,0);
  sync.configure({enabled:true,roomId:'OLD',clearMine:()=>clear.promise});const pending=sync.clearMine();await Promise.resolve();
  sync.configure({enabled:false});clear.resolve(4);assert.equal(await pending,null);
  sync.configure({enabled:true,roomId:'NEW',clearMine(){throw Error('clear failure');}});
  await assert.rejects(sync.clearMine(),/clear failure/);
});

test('accepted receipt counts are not reduced by an unrelated pending removal', async () => {
  const removal=deferred(),receipts=[],sync=createSync();
  sync.configure({enabled:true,roomId:'BUILD',upsert:async()=>{},remove:()=>removal.promise});
  sync.setEntries([{gx:1,gy:0,gz:1}]);sync.remove({gx:1,gy:0,gz:1});
  sync.upsert({gx:2,gy:0,gz:2},()=>{},(_entry,receipt)=>receipts.push(receipt));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(receipts[0].count,2);
  removal.resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(sync.getEntries().length,1);
});

test('late accepted writes cannot replace a newer confirmed room snapshot', async () => {
  const request=deferred(),sync=createSync(),input={gx:1,gy:0,gz:1,materialIndex:0};
  sync.configure({enabled:true,roomId:'BUILD',upsert:()=>request.promise});sync.upsert(input);
  sync.setEntries([{...input,materialIndex:5}]);request.resolve();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sync.getEntries()[0].materialIndex,5);
});
