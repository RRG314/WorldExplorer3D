import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { publishedRoomVehicleDefinition, reconcilePublishedRoomVehicles } from '../app/js/urban-sandbox/room-vehicle-reconciliation.js';

const entity = (id, x = 10) => ({
  entityId: id, kind: 'vehicle', style: 'van', label: 'Delivery van', color: 0x123456,
  pose: { x, y: 3, z: 0, yaw: .5, pitch: .1, roll: -.1 }, condition: .8,
  leaseOwnerUid: '', leaseExpiresMs: 0
});
function harness(rows = [entity('shared')], budget = 4) {
  const state = { vehicles: [], remoteEntities: new Map(rows.map(row => [row.entityId, row])), budget, driveOnLeft: true };
  const created = [], disposed = [];
  const options = {
    reference: { x: 0, z: 0 },
    createVehicle(definition) {
      created.push(definition.id);
      return { ...definition, attachedToPlayer: false, occupied: false, visual: { root: { visible: true }, setCondition() {} } };
    },
    disposeVehicle(vehicle) { disposed.push(vehicle.id); }
  };
  return { state, options, created, disposed, reconcile: () => reconcilePublishedRoomVehicles(state, options) };
}

test('a published car absent from the local seed appears once with its correct catalog and road pose', () => {
  const h = harness(); h.reconcile(); h.reconcile();
  assert.deepEqual(h.created, ['shared']);
  const car = h.state.vehicles[0];
  assert.equal(car.variant.id, 'delivery_van');
  assert.equal(car.driverSide, 1);
  assert.equal(car.color, 0x123456);
  assert.equal(car.condition, .8);
  assert.equal(car.pitch, .1); assert.equal(car.roll, -.1);
  assert.equal(car.source, 'room-published-vehicle');
});

test('remote cars share the existing interactive budget, prioritize proximity and preserve an active car', () => {
  const h = harness([entity('near', 10), entity('middle', 20), entity('far', 80)], 2);
  h.state.vehicles.push({ id: 'local' }); h.reconcile();
  assert.deepEqual(h.created, ['near']);
  h.options.reference.x = 85; h.reconcile();
  assert.deepEqual(h.disposed, ['near']);
  assert.deepEqual(h.state.vehicles.map(car => car.id), ['local', 'far']);
  h.state.activeVehicle = h.state.vehicles[1]; h.state.activeVehicle.attachedToPlayer = true;
  h.options.reference.x = 1000; h.state.remoteEntities.clear(); h.reconcile();
  assert.equal(h.state.vehicles.length, 2);
  assert.deepEqual(h.disposed, ['near']);
});

test('leaving a room disposes released remote visuals once and keeps local cars', () => {
  const h = harness(); h.state.vehicles.push({ id: 'local' }); h.reconcile();
  h.state.remoteEntities.clear(); h.reconcile(); h.reconcile();
  assert.deepEqual(h.disposed, ['shared']);
  assert.deepEqual(h.state.vehicles.map(car => car.id), ['local']);
});

test('existing cars are not duplicated and invalid server definitions do not create visuals', () => {
  const h = harness([entity('local'), { ...entity('invalid'), pose: { x: Infinity } }]);
  h.state.vehicles.push({ id: 'local' }); h.reconcile();
  assert.deepEqual(h.created, []);
  assert.equal(publishedRoomVehicleDefinition({ ...entity('bad'), style: 'unknown' }), null);
  assert.equal(publishedRoomVehicleDefinition({ ...entity('npc'), kind: 'npc' }), null);
});

test('a shared traffic car has one movement owner and restores ambient ownership after leaving the room', () => {
  const h = harness([entity('traffic-car')]);
  const claimed = [], released = [];
  h.options.claimTrafficAgent = id => { claimed.push(id); return 'agent:1'; };
  h.options.releaseTrafficAgent = id => released.push(id);
  const local = { id: 'traffic-car', ambientTraffic: true, speed: 12, visual: { root: {} } };
  h.state.vehicles.push(local);
  h.reconcile(); h.reconcile();
  assert.equal(local.ambientTraffic, false, 'Local traffic must not overwrite authoritative poses');
  assert.equal(local.speed, 0);
  assert.equal(local.roomPublished, true);
  assert.deepEqual(h.created, []);
  assert.deepEqual(claimed, ['traffic-car']);
  h.state.remoteEntities.clear(); h.reconcile(); h.reconcile();
  assert.deepEqual(released, ['agent:1']);
  assert.deepEqual(h.disposed, ['traffic-car']);
});

test('the real room update reconciles unseeded cars and applies their occupied lease state', () => {
  const h = harness([{ ...entity('other-car'), leaseOwnerUid: 'other', leaseExpiresMs: Date.now() + 10000 }]);
  // Isolate Firebase subscription setup while retaining the actual runtime's
  // update/lease code. The supplied map represents a committed server snapshot.
  const filename = process.env.WE3D_ROOM_AUTHORITY_SOURCE || new URL('../app/js/urban-sandbox/room-authority-runtime.js', import.meta.url);
  const source = fs.readFileSync(filename, 'utf8').replace(/^import .*;\n/m, '').replace(/^export \{.*\};?$/m, '');
  const context = { appCtx: { getCurrentMultiplayerRoom: () => null }, Date, Map, Set, Object, Math,
    addEventListener() {}, removeEventListener() {}, setInterval, clearInterval };
  vm.createContext(context); vm.runInContext(source, context);
  const runtime = context.createUrbanRoomAuthorityRuntime({
    state: h.state, isActive: () => true, reconcileVehicles: h.reconcile, vehiclePose: () => ({}), syncVehiclePose() {}
  });
  h.state.authority = { actorUid: 'me', dispose() {} };
  runtime.update(.5);
  assert.equal(h.state.vehicles.length, 1, 'A synchronized car must exist even when no local seed created it');
  assert.equal(h.state.vehicles[0].roomOccupiedByOther, true);
  assert.equal(h.state.vehicles[0].visual.root.visible, false, 'The player proxy owns the other driver appearance');
  runtime.dispose();
});

test('rejected lease restores the last server pose after exit without needing another snapshot', async () => {
  const h = harness(); h.reconcile();
  const vehicle = h.state.vehicles[0]; vehicle.x = 100;
  let room = null;
  const source = fs.readFileSync(new URL('../app/js/urban-sandbox/room-authority-runtime.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/m, '').replace(/^export \{.*\};?$/m, '');
  const context = { appCtx: { car: {}, getCurrentMultiplayerRoom: () => room }, Date, Map, Set, Object, Math,
    addEventListener() {}, removeEventListener() {}, setInterval: () => 1, clearInterval() {} };
  vm.createContext(context); vm.runInContext(source, context);
  const runtime = context.createUrbanRoomAuthorityRuntime({
    state: h.state, isActive: () => true, vehiclePose: car => ({ x: car.x }),
    syncVehiclePose: (car, pose) => Object.assign(car, pose), setStatus() {},
    enterVehicle: car => { h.state.activeVehicle = car; car.attachedToPlayer = true; return true; },
    beginExit: () => { h.state.transition = { kind: 'exit', vehicle }; }
  });
  room = { code: 'TESTROOM' };
  h.state.authority = { actorUid: 'me', claimVehicle: async () => ({ accepted: true }),
    updateVehicle: async () => ({ accepted: false, reason: 'not_owner' }), releaseVehicle: async () => ({}), dispose() {} };
  try {
    runtime.requestVehicleEntry(vehicle);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.state.transition?.kind, 'exit');
    runtime.update(.5); assert.equal(vehicle.x, 100, 'Do not snap an attached car during its exit animation');
    vehicle.attachedToPlayer = false; h.state.activeVehicle = null;
    runtime.update(.5); assert.equal(vehicle.x, 100, 'Wait until the exit transition completes');
    h.state.transition = null; runtime.update(.5);
    assert.equal(vehicle.x, 10); assert.equal(vehicle.pitch, .1); assert.equal(vehicle.roll, -.1);
  } finally { runtime.dispose(); }
});

test('an exit after rejected ownership does not publish another release', () => {
  const source = fs.readFileSync(new URL('../app/js/urban-sandbox/runtime.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('function updateTransition('), source.indexOf('function beginEnter('));
  let releases = 0;
  const context = { setDoorProgress() {}, vehiclePose: () => ({}), now: () => 0, emitProductTelemetry() {},
    activeWorldMatches: () => true, setStatus() {} };
  vm.createContext(context); vm.runInContext(fn, context);
  const state = { transition: { kind: 'exit', elapsed: 1, duration: .56, handoffComplete: true, vehicle: { id: 'shared' } },
    roomAuthorityRuntime: { hasRevokedLease: () => true },
    authority: { releaseVehicle: async () => { releases++; return { accepted: false }; } } };
  context.updateTransition(state, .016);
  assert.equal(releases, 0); assert.equal(state.transition, null);
});
