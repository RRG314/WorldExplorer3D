import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@colyseus/sdk';
import { COMMAND_TYPES, worldCellKey } from '@we3d/mmo-contracts';
import { listenMmoServer } from '../src/server.js';
import { WorldRoom } from '../src/room.js';
import { WorldRoomState } from '../src/state.js';
import { CREATOR_STARTING_INVENTORY } from '../src/content/inventory-policy.js';

function waitFor(check, message, timeoutMs = 4000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      try {
        const value = check();
        if (value) return resolve(value);
      } catch (error) {
        return reject(error);
      }
      if (Date.now() - startedAt >= timeoutMs) return reject(new Error(message));
      setTimeout(poll, 20);
    };
    poll();
  });
}

function nextMessage(room, type, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}.`)), timeoutMs);
    const remove = room.onMessage(type, (payload) => {
      clearTimeout(timeout);
      remove();
      resolve(payload);
    });
  });
}

async function connect(url, token) {
  const client = new Client(url);
  client.auth.token = token;
  const room = await client.joinOrCreate('world', { roomKey: 'MMO-TEST' }, WorldRoomState);
  room.onMessage('progression.snapshot', () => {});
  return { client, room };
}

function command(overrides) {
  return {
    type: COMMAND_TYPES.INPUT,
    commandId: `test-${crypto.randomUUID()}`,
    expectedRevision: 0,
    world: { kind: 'earth', lat: 39.2904, lon: -76.6122 },
    ...overrides
  };
}

async function sendCommand(room, payload) {
  const response = nextMessage(room, 'command.result');
  room.send('command', payload);
  return response;
}

test('authoritative room synchronizes movement and durable room patches', { timeout: 20000 }, async (t) => {
  const runtime = await listenMmoServer({ port: 0, allowTestAuth: true });
  runtime.store.seedRoom({
    id: 'MMO-TEST',
    ownerUid: 'owner-user',
    members: {
      'builder-user': 'builder',
      'visitor-user': 'visitor'
    },
    world: { kind: 'earth', lat: 39.2904, lon: -76.6122 },
    rules: { allowBuilding: true, allowDemolition: true }
  });
  const nearCell = worldCellKey({ kind: 'earth', lat: 39.2904, lon: -76.6122 });
  const farCell = worldCellKey({ kind: 'earth', lat: 43.7384, lon: 7.4246 });
  runtime.store.patches.get('MMO-TEST').set('near-seed', {
    id: 'near-seed',
    kind: 'object',
    assetId: 'block.cube',
    cellKey: nearCell,
    ownerUid: 'owner-user',
    position: { x: 2, y: 0, z: 2 },
    rotation: { x: 0, y: 0, z: 0 },
    revision: 0
  });
  runtime.store.patches.get('MMO-TEST').set('far-seed', {
    id: 'far-seed',
    kind: 'object',
    assetId: 'block.cube',
    cellKey: farCell,
    ownerUid: 'owner-user',
    position: { x: 2, y: 0, z: 2 },
    rotation: { x: 0, y: 0, z: 0 },
    revision: 0
  });
  t.after(async () => runtime.gameServer.gracefullyShutdown(false));

  const owner = await connect(runtime.url, 'test:owner-user:Owner');
  const builder = await connect(runtime.url, 'test:builder-user:Builder');
  const visitor = await connect(runtime.url, 'test:visitor-user:Visitor');
  t.after(async () => Promise.allSettled([
    builder.room.leave()
  ]));

  await waitFor(
    () => owner.room.state.players.size === 3 && builder.room.state.players.size === 3,
    'All clients did not receive the same player roster.'
  );
  await waitFor(
    () => owner.room.state.objects.has('near-seed'),
    'A persistent patch in the active neighborhood was not loaded.'
  );
  assert.equal(owner.room.state.objects.has('far-seed'), false);

  const inputResult = await sendCommand(owner.room, command({
    payload: { sequence: 1, x: 1, z: 0, yaw: 0, mode: 'walk' }
  }));
  assert.equal(inputResult.ok, true);
  await waitFor(
    () => builder.room.state.players.get('owner-user')?.x > 0.1,
    'Authoritative movement was not synchronized to the other client.'
  );
  owner.room.send('input', command({
    commandId: 'streamed-input-no-ack-000001',
    payload: { sequence: 2, x: 0, z: 1, yaw: 1, mode: 'walk' }
  }));
  await waitFor(
    () => builder.room.state.players.get('owner-user')?.z > 0.1,
    'The capped no-ack input channel did not advance synchronized movement.'
  );

  const place = command({
    type: COMMAND_TYPES.PLACE_OBJECT,
    commandId: 'place-object-idempotent-0001',
    assetId: 'block.cube',
    position: { x: 8, y: 2, z: 12 },
    rotation: { x: 0, y: 0.5, z: 0 },
    payload: { metadata: { color: 'blue' } }
  });
  const placed = await sendCommand(builder.room, place);
  assert.equal(placed.ok, true);
  assert.equal(placed.revision, 1);
  assert.deepEqual(placed.patch.metadata, { color: 'blue', shape: 'cube' });
  await waitFor(
    () => owner.room.state.objects.has(placed.patch.id) && visitor.room.state.objects.has(placed.patch.id),
    'Placed object was not synchronized to every client.'
  );

  const duplicate = await sendCommand(builder.room, place);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.revision, 1);

  const stale = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.PLACE_OBJECT,
    commandId: 'place-object-stale-revision-0002',
    expectedRevision: 0,
    assetId: 'block.ramp',
    position: { x: 9, y: 2, z: 12 }
  }));
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'revision_conflict');

  const suppression = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.SUPPRESS_BASE,
    commandId: 'suppress-osm-feature-0000003',
    expectedRevision: 1,
    targetId: 'osm:way:123456789'
  }));
  assert.equal(suppression.ok, true);
  assert.equal(suppression.revision, 2);
  await waitFor(
    () => owner.room.state.suppressions.has(suppression.patch.id),
    'Base-world suppression was not synchronized.'
  );

  const denied = await sendCommand(visitor.room, command({
    type: COMMAND_TYPES.PLACE_OBJECT,
    commandId: 'visitor-place-denied-000004',
    expectedRevision: 2,
    assetId: 'block.slab'
  }));
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'permission_denied');

  const unknownAsset = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.PLACE_OBJECT,
    commandId: 'unknown-asset-denied-00005',
    expectedRevision: 2,
    assetId: 'uploaded.javascript'
  }));
  assert.equal(unknownAsset.ok, false);
  assert.equal(unknownAsset.code, 'unknown_asset');

  const outsideInterest = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.SUPPRESS_BASE,
    commandId: 'outside-interest-denied-00006',
    expectedRevision: 2,
    cellKey: farCell,
    targetId: 'osm:way:outside-interest'
  }));
  assert.equal(outsideInterest.ok, false);
  assert.equal(outsideInterest.code, 'outside_interest');
  const cellMismatch = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.PLACE_OBJECT,
    commandId: 'placement-cell-mismatch-0006b',
    expectedRevision: 2,
    cellKey: farCell,
    assetId: 'block.cube',
    position: { x: 1, y: 0, z: 1 }
  }));
  assert.equal(cellMismatch.ok, false);
  assert.equal(cellMismatch.code, 'cell_mismatch');

  const wrongAssetKind = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.SPAWN_VEHICLE,
    commandId: 'vehicle-wrong-asset-kind-0007',
    expectedRevision: 2,
    assetId: 'block.cube'
  }));
  assert.equal(wrongAssetKind.ok, false);
  assert.equal(wrongAssetKind.code, 'asset_kind_mismatch');

  const spawnedVehicle = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.SPAWN_VEHICLE,
    commandId: 'spawn-vehicle-authoritative-0008',
    expectedRevision: 2,
    assetId: 'vehicle.compact',
    position: { x: 0, y: 0, z: 0 }
  }));
  assert.equal(spawnedVehicle.ok, true);
  assert.equal(spawnedVehicle.revision, 3);
  await waitFor(
    () => owner.room.state.vehicles.has(spawnedVehicle.patch.id),
    'Spawned vehicle did not enter the authoritative replicated state.'
  );

  const enteredVehicle = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.ENTER_VEHICLE,
    commandId: 'enter-vehicle-authoritative-0009',
    expectedRevision: 3,
    targetId: spawnedVehicle.patch.id
  }));
  assert.equal(enteredVehicle.ok, true);
  assert.equal(enteredVehicle.commandId, 'enter-vehicle-authoritative-0009');
  assert.deepEqual(enteredVehicle.interaction, {
    kind: 'vehicle',
    action: 'entered',
    targetId: spawnedVehicle.patch.id,
    assetId: 'vehicle.compact'
  });
  await waitFor(
    () => owner.room.state.vehicles.get(spawnedVehicle.patch.id)?.driverUid === 'builder-user',
    'Vehicle occupancy was not synchronized.'
  );
  builder.room.send('input', command({
    commandId: 'drive-vehicle-authoritative-0010',
    expectedRevision: 3,
    payload: { sequence: 1, x: 0, z: 1, yaw: 0, mode: 'car' }
  }));
  await waitFor(
    () => owner.room.state.vehicles.get(spawnedVehicle.patch.id)?.z > 0.1,
    'Server-authoritative vehicle movement was not synchronized.'
  );
  const exitedVehicle = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.EXIT_VEHICLE,
    commandId: 'exit-vehicle-authoritative-0011',
    expectedRevision: 3
  }));
  assert.equal(exitedVehicle.ok, true);
  await waitFor(
    () => owner.room.state.vehicles.get(spawnedVehicle.patch.id)?.driverUid === '',
    'Vehicle exit was not synchronized.'
  );
  assert.equal(builder.room.state.players.get('builder-user').vehicleId, '');
  assert.ok(runtime.store.patches.get('MMO-TEST').get(spawnedVehicle.patch.id).position.z > 0.1);

  const contextEntered = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.INTERACT,
    commandId: 'context-enter-vehicle-000012',
    expectedRevision: 3
  }));
  assert.equal(contextEntered.ok, true);
  assert.equal(contextEntered.interaction.action, 'entered');
  const contextExited = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.INTERACT,
    commandId: 'context-exit-vehicle-000013',
    expectedRevision: 3
  }));
  assert.equal(contextExited.ok, true);
  assert.equal(contextExited.interaction.action, 'exited');
  const visitorVehicleDenied = await sendCommand(visitor.room, command({
    type: COMMAND_TYPES.INTERACT,
    commandId: 'visitor-vehicle-denied-000014',
    expectedRevision: 3
  }));
  assert.equal(visitorVehicleDenied.ok, false);
  assert.equal(visitorVehicleDenied.code, 'permission_denied');

  const inventoryAfterBuild = await runtime.store.loadInventory(
    'MMO-TEST',
    'builder-user',
    runtime.inventoryPolicy.initialForRole('builder')
  );
  assert.equal(
    Object.entries(inventoryAfterBuild)
      .filter(([assetId]) => assetId.startsWith('block.'))
      .reduce((total, [, quantity]) => total + quantity, 0),
    Object.entries(CREATOR_STARTING_INVENTORY)
      .filter(([assetId]) => assetId.startsWith('block.'))
      .reduce((total, [, quantity]) => total + quantity, 0) - 1
  );
  assert.equal(inventoryAfterBuild['block.cube'], 79);
  assert.equal(inventoryAfterBuild['vehicle.compact'], 1);
  const removedObject = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.REMOVE_OBJECT,
    commandId: 'remove-object-returns-inventory-0012',
    expectedRevision: 3,
    targetId: placed.patch.id
  }));
  assert.equal(removedObject.ok, true);
  assert.equal(removedObject.revision, 4);
  assert.equal(removedObject.inventory['block.cube'], 80);

  const claimedCell = await sendCommand(owner.room, command({
    type: COMMAND_TYPES.CLAIM_CELL,
    commandId: 'claim-cell-private-00000013',
    expectedRevision: 4,
    payload: { access: 'private' }
  }));
  assert.equal(claimedCell.ok, true);
  assert.equal(claimedCell.revision, 5);
  await waitFor(
    () => builder.room.state.claims.has(claimedCell.patch.id),
    'Cell claim was not synchronized to nearby players.'
  );
  const claimDenied = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.PLACE_OBJECT,
    commandId: 'claim-protected-place-000014',
    expectedRevision: 5,
    assetId: 'block.ramp'
  }));
  assert.equal(claimDenied.ok, false);
  assert.equal(claimDenied.code, 'claim_denied');
  const releasedClaim = await sendCommand(owner.room, command({
    type: COMMAND_TYPES.RELEASE_CLAIM,
    commandId: 'release-cell-claim-0000015',
    expectedRevision: 5
  }));
  assert.equal(releasedClaim.ok, true);
  assert.equal(releasedClaim.revision, 6);
  await waitFor(
    () => !builder.room.state.claims.has(claimedCell.patch.id),
    'Released cell claim remained in replicated state.'
  );

  const stackBase = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.PLACE_OBJECT,
    commandId: 'stack-base-grid-snapped-0018',
    expectedRevision: 6,
    assetId: 'block.wedge',
    position: { x: 20.2, y: 3.24, z: 20.4 },
    payload: { metadata: { color: 'orange' } }
  }));
  assert.equal(stackBase.ok, true);
  assert.equal(stackBase.revision, 7);
  assert.deepEqual(stackBase.patch.position, { x: 20, y: 3, z: 20 });
  const stackTop = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.PLACE_OBJECT,
    commandId: 'stack-top-half-grid-00019',
    expectedRevision: 7,
    assetId: 'block.slab',
    position: { x: 20, y: 3.51, z: 20 }
  }));
  assert.equal(stackTop.ok, true);
  assert.equal(stackTop.revision, 8);
  assert.deepEqual(stackTop.patch.position, { x: 20, y: 3.5, z: 20 });
  const occupied = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.PLACE_OBJECT,
    commandId: 'stack-overlap-rejected-0020',
    expectedRevision: 8,
    assetId: 'block.pyramid',
    position: { x: 20.1, y: 3.1, z: 20.2 }
  }));
  assert.equal(occupied.ok, false);
  assert.equal(occupied.code, 'position_occupied');
  const removedTop = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.REMOVE_OBJECT,
    commandId: 'remove-stack-top-0000021',
    expectedRevision: 8,
    targetId: stackTop.patch.id
  }));
  assert.equal(removedTop.revision, 9);
  const removedBase = await sendCommand(builder.room, command({
    type: COMMAND_TYPES.REMOVE_OBJECT,
    commandId: 'remove-stack-base-000022',
    expectedRevision: 9,
    targetId: stackBase.patch.id
  }));
  assert.equal(removedBase.revision, 10);

  const audit = await runtime.store.getAuditEvents('MMO-TEST');
  assert.deepEqual(audit.map((event) => event.type), [
    COMMAND_TYPES.PLACE_OBJECT,
    COMMAND_TYPES.SUPPRESS_BASE,
    COMMAND_TYPES.SPAWN_VEHICLE,
    COMMAND_TYPES.REMOVE_OBJECT,
    COMMAND_TYPES.CLAIM_CELL,
    COMMAND_TYPES.RELEASE_CLAIM,
    COMMAND_TYPES.PLACE_OBJECT,
    COMMAND_TYPES.PLACE_OBJECT,
    COMMAND_TYPES.REMOVE_OBJECT,
    COMMAND_TYPES.REMOVE_OBJECT
  ]);
  await waitFor(
    () => owner.room.state.revision === 10 && builder.room.state.revision === 10,
    'Final durable revision was not synchronized.'
  );
  assert.equal(owner.room.state.revision, 10);
  assert.equal(builder.room.state.revision, 10);

  const positionBeforeDrop = owner.room.state.players.get('owner-user').x;
  owner.room.reconnection.minUptime = 0;
  const reconnected = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Client did not reconnect to its authoritative room.')), 5000);
    owner.room.onReconnect(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
  owner.room.connection.transport.ws.close();
  await reconnected;
  await waitFor(
    () => owner.room.state.players.get('owner-user')?.connected === true,
    'Reconnected player did not resume its existing room entity.'
  );
  assert.equal(owner.room.state.players.size, 3);
  assert.ok(owner.room.state.players.get('owner-user').x >= positionBeforeDrop);

  const positionBeforeLeave = owner.room.state.players.get('owner-user').x;
  void owner.room.leave();
  await waitFor(
    () => runtime.store.playerSnapshots.get('MMO-TEST')?.has('owner-user'),
    'Final room leave did not write a recovery snapshot.'
  );
  const resumedOwner = await connect(runtime.url, 'test:owner-user:Owner');
  t.after(async () => resumedOwner.room.leave());
  await waitFor(
    () => resumedOwner.room.state.players.get('owner-user')?.x >= positionBeforeLeave,
    'A genuine rejoin did not restore the authoritative player position.'
  );
  assert.equal(resumedOwner.room.state.players.get('owner-user').mode, 'walk');

  const bannedVisitor = await sendCommand(resumedOwner.room, command({
    type: COMMAND_TYPES.BAN_PLAYER,
    commandId: 'ban-visitor-authoritative-0016',
    expectedRevision: 10,
    targetId: 'visitor-user',
    payload: { reason: 'Automated moderation acceptance test' }
  }));
  assert.equal(bannedVisitor.ok, true);
  assert.equal(bannedVisitor.revision, 11);
  await waitFor(
    () => !resumedOwner.room.state.players.has('visitor-user'),
    'Banned visitor remained in the authoritative player roster.'
  );
  assert.equal(await runtime.store.isBanned('MMO-TEST', 'visitor-user'), true);
  await assert.rejects(
    () => WorldRoom.prototype.onAuth.call({
      verifyIdentity: async () => ({ uid: 'visitor-user', displayName: 'Visitor' }),
      store: runtime.store,
      manifest: { id: 'MMO-TEST' }
    }, null, null, { token: 'ignored' }),
    (error) => error.code === 'room_banned'
  );
  const unbannedVisitor = await sendCommand(resumedOwner.room, command({
    type: COMMAND_TYPES.UNBAN_PLAYER,
    commandId: 'unban-visitor-authoritative-017',
    expectedRevision: 11,
    targetId: 'visitor-user'
  }));
  assert.equal(unbannedVisitor.ok, true);
  assert.equal(unbannedVisitor.revision, 12);
  assert.equal(await runtime.store.isBanned('MMO-TEST', 'visitor-user'), false);
  const finalAudit = await runtime.store.getAuditEvents('MMO-TEST');
  assert.deepEqual(finalAudit.slice(-2).map((event) => event.type), [
    COMMAND_TYPES.BAN_PLAYER,
    COMMAND_TYPES.UNBAN_PLAYER
  ]);
});
