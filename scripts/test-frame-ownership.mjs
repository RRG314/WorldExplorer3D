import assert from 'node:assert/strict';
import {
  getFrameOwnershipSnapshot,
  registerFrameOwner
} from '../app/js/runtime/frame-ownership.js';

let earthActive = true;
let spaceActive = false;
let selectorActive = false;

const releaseEarth = registerFrameOwner({
  id: 'test.earth',
  kind: 'continuous-renderer',
  exclusiveGroup: 'environment-renderer',
  getState: () => ({ active: earthActive, scheduled: true, suspended: !earthActive })
});
const releaseSpace = registerFrameOwner({
  id: 'test.space',
  kind: 'continuous-renderer',
  exclusiveGroup: 'environment-renderer',
  getState: () => ({ active: spaceActive, scheduled: spaceActive })
});
const releaseSelector = registerFrameOwner({
  id: 'test.selector',
  kind: 'continuous-renderer',
  exclusiveGroup: 'title-auxiliary-renderer',
  getState: () => selectorActive
});

let snapshot = getFrameOwnershipSnapshot();
assert.equal(snapshot.ok, true);
assert.deepEqual(snapshot.active, ['test.earth']);
assert.deepEqual(snapshot.scheduled, ['test.earth']);

selectorActive = true;
snapshot = getFrameOwnershipSnapshot();
assert.equal(snapshot.ok, true);
assert.deepEqual(snapshot.active, ['test.earth', 'test.selector']);

spaceActive = true;
snapshot = getFrameOwnershipSnapshot();
assert.equal(snapshot.ok, false);
assert.deepEqual(snapshot.conflicts, [{
  exclusiveGroup: 'environment-renderer',
  ownerIds: ['test.earth', 'test.space']
}]);

earthActive = false;
snapshot = getFrameOwnershipSnapshot();
assert.equal(snapshot.ok, true);
assert.deepEqual(snapshot.active, ['test.space', 'test.selector']);

assert.equal(releaseEarth(), true);
assert.equal(releaseEarth(), false);
assert.equal(releaseSpace(), true);
assert.equal(releaseSelector(), true);
assert.equal(getFrameOwnershipSnapshot().registered, 0);
assert.throws(
  () => registerFrameOwner({ id: 'missing-state' }),
  /requires getState/
);

console.log(JSON.stringify({ ok: true, conflictsDetected: 1 }, null, 2));
