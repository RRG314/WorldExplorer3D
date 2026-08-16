import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  applySharedDisabled,
  createDeFlockState,
  progressSnapshot
} from '../app/js/deflock/state.js';

const require = createRequire(import.meta.url);
const {
  claimImmutableDeFlockState,
  isMappedCameraTags,
  normalizeDeFlockSourceId
} = require('../functions/deflock.js');

const sourceId = 'osm:node:101';
const cameraRef = { path: 'rooms/AB12CD/deflockStates/osm-node-101' };
const documents = new Map();
let queue = Promise.resolve();

function runSerializedTransaction(callback) {
  const result = queue.then(async () => {
    const staged = new Map();
    const transaction = {
      async get(ref) {
        const value = staged.get(ref.path) || documents.get(ref.path);
        return { exists: value != null, data: () => value };
      },
      create(ref, value) {
        if (documents.has(ref.path) || staged.has(ref.path)) throw new Error('already exists');
        staged.set(ref.path, value);
      }
    };
    const response = await callback(transaction);
    staged.forEach((value, key) => documents.set(key, value));
    return response;
  });
  queue = result.catch(() => {});
  return result;
}

assert.deepEqual(normalizeDeFlockSourceId(sourceId), { sourceId, nodeId: '101' });
assert.equal(normalizeDeFlockSourceId('node:101'), null, 'only canonical source IDs are accepted');
assert.equal(isMappedCameraTags({ man_made: 'surveillance', 'surveillance:type': 'ALPR' }), true);
assert.equal(isMappedCameraTags({ man_made: 'mast' }), false);

const [playerA, playerB] = await Promise.all([
  claimImmutableDeFlockState({
    runTransaction: runSerializedTransaction,
    cameraRef,
    state: { sourceId, uid: 'player-a', displayName: 'Player A' }
  }),
  claimImmutableDeFlockState({
    runTransaction: runSerializedTransaction,
    cameraRef,
    state: { sourceId, uid: 'player-b', displayName: 'Player B' }
  })
]);
assert.equal([playerA, playerB].filter((result) => result.awarded).length, 1,
  'a concurrent duplicate interaction awards exactly one player');
assert.equal(documents.size, 1, 'the immutable room overlay has exactly one camera state');

const features = [{ sourceId, lat: 39.29, lon: -76.61 }];
const overlay = [...documents.values()];
const joiningState = createDeFlockState(features, { location: { lat: 39.29, lon: -76.61 } });
assert.equal(applySharedDisabled(joiningState, overlay), true, 'join-in-progress receives current room overlay');
assert.equal(progressSnapshot(joiningState).disabled, 1);

const rejoinedState = createDeFlockState(features, { location: { lat: 39.29, lon: -76.61 } });
assert.equal(applySharedDisabled(rejoinedState, overlay), true, 'room leave/rejoin reconstructs shared state');
assert.equal(rejoinedState.disabledBy.get(sourceId).uid, overlay[0].uid);

console.log(JSON.stringify({
  ok: true,
  awardedUid: overlay[0].uid,
  overlayDocuments: documents.size,
  joinInProgress: progressSnapshot(joiningState)
}, null, 2));
