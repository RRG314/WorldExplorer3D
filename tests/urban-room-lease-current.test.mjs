import assert from 'node:assert/strict';
import test from 'node:test';
import urbanBackend from '../functions/urban-sandbox.js';
import { createVehicleLeaseHeartbeat, resolveRoomVehicleLease } from '../app/js/urban-sandbox/room-authority-runtime.js';

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


function leaseHarness(updateVehicle = async () => ({ accepted: true })) {
  const vehicle = { id: 'car', attachedToPlayer: false };
  const authority = { updateVehicle };
  let lease = { authority, vehicle };
  const timers = new Map();
  const rejected = [], errors = [];
  let sequence = 0;
  const heartbeat = createVehicleLeaseHeartbeat({
    getLease: () => lease, vehiclePose: () => ({ x: 2, y: 3, z: 4 }),
    onRejected: (...args) => rejected.push(args), onError: error => errors.push(error),
    setInterval: callback => { timers.set(++sequence, callback); return sequence; },
    clearInterval: id => timers.delete(id)
  });
  return { heartbeat, timers, rejected, errors, vehicle, authority, setLease: value => { lease = value; } };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('room lease renews during entry without any animation frames and stops after exit', async () => {
  const calls = [];
  const h = leaseHarness(async (...args) => { calls.push(args); return { accepted: true }; });
  h.heartbeat.start();
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].attachedToPlayer, false, 'Entry must be covered before chassis attachment.');
  await h.heartbeat.tick();
  assert.equal(calls.length, 2);
  h.setLease(null);
  await h.heartbeat.tick();
  assert.equal(h.timers.size, 0);
  assert.equal(calls.length, 2);
});

test('room lease does not overlap updates and rejects expired ownership once', async () => {
  let resolve;
  let calls = 0;
  const h = leaseHarness(() => { calls++; return new Promise(done => { resolve = done; }); });
  h.heartbeat.start();
  await h.heartbeat.tick();
  assert.equal(calls, 1);
  resolve({ accepted: false, reason: 'not_owner' });
  await settle();
  assert.equal(h.rejected.length, 1);
  assert.equal(h.timers.size, 0);
  await h.heartbeat.tick();
  assert.equal(calls, 1);
});

test('old lease response cannot eject a new room vehicle or survive disposal', async () => {
  let resolveOld;
  const h = leaseHarness(() => new Promise(resolve => { resolveOld = resolve; }));
  h.heartbeat.start();
  h.heartbeat.stop();
  const next = { authority: { updateVehicle: async () => ({ accepted: true }) }, vehicle: { id: 'next' } };
  h.setLease(next);
  h.heartbeat.start();
  resolveOld({ accepted: false, reason: 'not_owner' });
  await settle();
  assert.equal(h.rejected.length, 0);
  assert.equal(h.timers.size, 1);
  h.heartbeat.stop();
  await h.heartbeat.tick();
  assert.equal(h.timers.size, 0);
});

test('room lease network failures retry without falsely accepting or rejecting ownership', async () => {
  let calls = 0;
  const h = leaseHarness(async () => { if (++calls === 1) throw Error('offline'); return { accepted: true }; });
  h.heartbeat.start();
  await settle();
  assert.equal(h.errors.length, 1);
  assert.equal(h.rejected.length, 0);
  await h.heartbeat.tick();
  assert.equal(calls, 2);
  h.heartbeat.stop();
});


test('shared vehicle claims and release preserve bounded road pitch and bank', async () => {
  let stored;
  const timestampFromMs = value => ({ toMillis: () => value });
  const runTransaction = callback => callback({
    get: async () => ({ exists: !!stored, data: () => stored }),
    set: (_ref, value) => { stored = value; },
    update: (_ref, patch) => { stored = { ...stored, ...patch }; }
  });
  const base = { runTransaction, entityRef: {}, uid: 'driver', timestampFromMs };
  const input = { entityId: 'car:1', worldSeed: 'earth:test', pose: { x: 0, y: 12, z: 0, yaw: 1, pitch: -.2, roll: .1 } };
  const claim = await urbanBackend.claimUrbanVehicleLease({ ...base, input, nowMs: 1000 });
  assert.equal(claim.accepted, true);
  assert.equal(stored.pose.pitch, -.2);
  assert.equal(stored.pose.roll, .1);
  const released = await urbanBackend.updateUrbanVehicleLease({ ...base, input: { ...input, pose: { ...input.pose, pitch: .3, roll: -.12 } }, nowMs: 2000, release: true });
  assert.equal(released.accepted, true);
  assert.equal(stored.pose.pitch, .3);
  assert.equal(stored.pose.roll, -.12);
  assert.equal(stored.leaseOwnerUid, '');
  assert.equal(urbanBackend.normalizePose({ pitch: 10, roll: -10 }).pitch, .55);
  assert.equal(urbanBackend.normalizePose({ pitch: 10, roll: -10 }).roll, -.55);
  assert.equal(urbanBackend.normalizePose({}).pitch, 0, 'Existing records and older clients remain compatible.');
});
