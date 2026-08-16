import assert from 'node:assert/strict';
import {
  createWorldLoadCancellationSlot,
  createWorldLoadCoordinator
} from '../app/js/world/world-load-coordinator.js';

const appCtx = {
  _worldLoadSequence: 4,
  resetCount: 0,
  resetFarTerrainClipmap() {
    this.resetCount += 1;
    return new Promise((resolve) => { this.resolveTerrainDrain = resolve; });
  }
};
let signature = 'baltimore';
const pending = [];
const cancellationSlot = createWorldLoadCancellationSlot();
let cancellationReason = '';
cancellationSlot.register((reason) => {
  cancellationReason = reason;
  return true;
});
const coordinator = createWorldLoadCoordinator({
  appCtx,
  cancelActive: cancellationSlot.cancel,
  getWorldLoadSignature: () => signature,
  loadWorld: (retryPass) => new Promise((resolve) => pending.push({ retryPass, signature, resolve }))
});

const baltimore = coordinator.loadWorld();
assert.equal(pending.length, 1);
const joinedBaltimore = coordinator.loadWorld();
assert.equal(pending.length, 1, 'same selection must join the active load');

signature = 'monaco';
const monaco = coordinator.loadWorld();
const duplicateMonaco = coordinator.loadWorld();
assert.equal(appCtx._worldLoadSequence, 5, 'a new selection invalidates the active request exactly once');
assert.equal(appCtx.resetCount, 1, 'a new selection cancels the far-terrain generation exactly once');
assert.equal(cancellationReason, 'new-location-selection');
assert.equal(pending.length, 1, 'replacement waits for the invalidated load to stop mutating legacy collections');

pending[0].resolve({ state: 'superseded' });
await baltimore;
await joinedBaltimore;
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(pending.length, 1, 'replacement must also wait for cancelled terrain requests to drain');
appCtx.resolveTerrainDrain();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(pending.length, 2);
assert.equal(pending[1].signature, 'monaco');
pending[1].resolve({ state: 'published' });
assert.deepEqual(await monaco, { state: 'published' });
assert.deepEqual(await duplicateMonaco, { state: 'published' });

assert.throws(() => createWorldLoadCoordinator({}), /requires appCtx/);

console.log(JSON.stringify({
  ok: true,
  contract: 'world-load-coordinator',
  behaviors: [
    'same-selection-joins',
    'new-selection-invalidates-once',
    'far-terrain-generation-cancelled-once',
    'replacement-waits-for-terrain-network-drain',
    'replacement-starts-after-legacy-mutation-stops'
  ]
}, null, 2));
