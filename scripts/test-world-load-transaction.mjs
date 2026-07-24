import assert from 'node:assert/strict';
import { createWorldLoadRuntimeSession } from '../app/js/world/load-runtime-session.js';
import { createWorldLoadTransactionManager } from '../app/js/world/load-transaction.js';

let now = 100;
const manager = createWorldLoadTransactionManager({ now: () => now });
const first = manager.begin({
  signature: '39.2904000:-76.6122000',
  source: 'test',
  location: { lat: 39.2904, lon: -76.6122 }
});
assert.equal(first.isCurrent(), true);
assert.equal(first.signal.aborted, false);
let firstRollbackCalls = 0;
first.deferRollback((reason) => {
  firstRollbackCalls += 1;
  assert.equal(reason, 'superseded');
});

now = 125;
const second = manager.begin({
  signature: '40.7128000:-74.0060000',
  source: 'test',
  location: { lat: 40.7128, lon: -74.006 }
});
assert.equal(first.isCurrent(), false);
assert.equal(first.signal.aborted, true);
assert.equal(first.snapshot().status, 'aborted');
assert.equal(first.snapshot().reason, 'superseded');
assert.equal(firstRollbackCalls, 1);
assert.equal(second.isCurrent(), true);
assert.equal(first.commit(), false);

now = 160;
assert.equal(second.commit({ roads: 20, buildings: 30 }), true);
assert.equal(second.commit(), false);
assert.equal(first.abort('duplicate-abort'), false);
assert.equal(firstRollbackCalls, 1);
assert.equal(manager.getActive(), null);
assert.deepEqual(manager.snapshot().lastFinished, {
  id: 2,
  signature: '40.7128000:-74.0060000',
  source: 'test',
  location: { lat: 40.7128, lon: -74.006 },
  status: 'committed',
  startedAt: 125,
  finishedAt: 160,
  reason: 'committed',
  details: { roads: 20, buildings: 30 }
});

let resetCalls = 0;
let perfResult = null;
const invalidSession = createWorldLoadRuntimeSession({
  appCtx: {
    resolveLocationSelection: () => null,
    showLoad() {},
    startPerfLoad() {},
    finishPerfLoad(result) {
      perfResult = result;
    }
  },
  getPerfModeValue: () => 'osm',
  resetWorldForReload: () => {
    resetCalls += 1;
  }
});
assert.equal(invalidSession.aborted, true);
assert.equal(resetCalls, 0);
assert.equal(perfResult.reason, 'invalid_location_selection');

console.log(JSON.stringify({
  ok: true,
  rollbackHooksExactlyOnce: true,
  staleCommitRejected: true,
  invalidSelectionPreservedWorld: true
}, null, 2));
