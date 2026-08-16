import assert from 'node:assert/strict';
import {
  createRoomModificationRecord,
  editableRoomPermissions,
  resolveEditableRoomRole,
  reviseRoomModificationRecord,
  ROOM_MODIFICATION_HISTORY_LIMIT,
  roomModificationDocumentId,
  roomWorldModificationIdentity
} from '../app/js/editable-world/room-model.js';

const room = {
  id: 'ABC234',
  ownerUid: 'owner-1',
  mods: { 'mod-1': true },
  world: { kind: 'earth', seed: 'latlon:39.29040,-76.61220' }
};
assert.equal(resolveEditableRoomRole(room, 'owner-1'), 'owner');
assert.equal(resolveEditableRoomRole(room, 'mod-1'), 'moderator');
assert.equal(resolveEditableRoomRole(room, 'builder-1'), 'builder');
assert.equal(resolveEditableRoomRole(room, ''), 'visitor');
assert.equal(editableRoomPermissions('owner').resetWorld, true);
assert.equal(editableRoomPermissions('moderator').suppressBaseStructures, true);
assert.equal(editableRoomPermissions('builder').placeObjects, true);
assert.equal(editableRoomPermissions('builder').suppressBaseStructures, false);
assert.equal(editableRoomPermissions('visitor').placeObjects, false);

const worldId = roomWorldModificationIdentity(room);
assert.equal(worldId, 'room-world:ABC234:earth:latlon:39.29040_-76.61220');
const suppression = createRoomModificationRecord({
  kind: 'suppression',
  sourceFeatureId: 'osm:way:123/part',
  worldId,
  worldSeed: room.world.seed,
  actorId: 'owner-1',
  nowMs: 100
});
assert.match(suppression.id, /^s_/);
assert.equal(suppression.revision, 1);
assert.equal(suppression.active, true);
assert.equal(suppression.history.length, 1);
assert.equal(suppression.id, roomModificationDocumentId('suppression', 'osm:way:123/part'));

const stale = reviseRoomModificationRecord(suppression, {
  expectedRevision: 0,
  actorId: 'mod-1',
  active: false
});
assert.equal(stale.committed, false);
assert.equal(stale.reason, 'revision-conflict');

let current = suppression;
for (let index = 0; index < ROOM_MODIFICATION_HISTORY_LIMIT + 8; index += 1) {
  const result = reviseRoomModificationRecord(current, {
    expectedRevision: current.revision,
    actorId: index % 2 ? 'owner-1' : 'mod-1',
    active: index % 2 === 0,
    action: index % 2 === 0 ? 'suppress' : 'restore',
    nowMs: 200 + index
  });
  assert.equal(result.committed, true);
  current = result.current;
}
assert.equal(current.history.length, ROOM_MODIFICATION_HISTORY_LIMIT, 'room history became unbounded');
assert.equal(current.revision, 1 + ROOM_MODIFICATION_HISTORY_LIMIT + 8);

assert.throws(() => createRoomModificationRecord({
  kind: 'object',
  objectId: 'unsafe',
  objectType: 'script',
  worldId,
  actorId: 'builder-1'
}), /Unsupported/);

console.log(JSON.stringify({
  ok: true,
  contract: 'editable-room-revision-v1',
  permissions: ['owner', 'moderator', 'builder', 'visitor'],
  worldId,
  optimisticConflict: true,
  boundedHistory: current.history.length,
  unsafeCatalogRejected: true
}, null, 2));
