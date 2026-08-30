import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRoomVehicleLease } from '../app/js/urban-sandbox/room-authority-runtime.js';

test('room vehicle lease state clears expired and missing ownership', () => {
  const now = 10_000;
  assert.deepEqual(resolveRoomVehicleLease({ leaseOwnerUid: 'owner', leaseExpiresMs: now + 1_000 }, 'member', now), {
    occupiedByOther: true,
    leaseOwnerUid: 'owner'
  });
  assert.deepEqual(resolveRoomVehicleLease({ leaseOwnerUid: 'owner', leaseExpiresMs: now + 1_000 }, 'owner', now), {
    occupiedByOther: false,
    leaseOwnerUid: 'owner'
  });
  assert.deepEqual(resolveRoomVehicleLease({ leaseOwnerUid: 'owner', leaseExpiresMs: now }, 'member', now), {
    occupiedByOther: false,
    leaseOwnerUid: ''
  });
  assert.deepEqual(resolveRoomVehicleLease(null, 'member', now), {
    occupiedByOther: false,
    leaseOwnerUid: ''
  });
});
