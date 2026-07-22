import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMAND_TYPES } from '@we3d/mmo-contracts';
import { RoomCommandProcessor } from '../src/authority/command-processor.js';
import { createAssetCatalog } from '../src/content/catalog.js';
import { createInventoryPolicy } from '../src/content/inventory-policy.js';

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

test('Firestore adapter preserves legacy rooms while adding atomic MMO state', {
  skip: emulatorAvailable ? false : 'FIRESTORE_EMULATOR_HOST is not configured.',
  timeout: 120000
}, async () => {
  const { createFirestoreRoomStore } = await import('../src/persistence/firestore-store.js');
  const store = createFirestoreRoomStore({ projectId: 'demo-we3d-mmo' });
  const roomRef = store.db.collection('rooms').doc('LEGACY1');
  const legacyRoom = {
    code: 'LEGACY1',
    createdBy: 'owner-user',
    name: 'Existing Baltimore Room',
    visibility: 'private',
    maxPlayers: 10,
    ownerUid: 'owner-user',
    mods: { 'owner-user': true, 'mod-user': true },
    cityKey: 'baltimore',
    world: { kind: 'earth', seed: 'legacy-seed', lat: 39.2904, lon: -76.6122 },
    rules: {
      allowChat: true,
      allowGhosts: true,
      paintTimeLimitSec: 120,
      paintTouchMode: 'any',
      allowPaintballGun: true,
      allowRoofAutoPaint: true
    }
  };
  await roomRef.set(legacyRoom);
  await roomRef.collection('players').doc('member-user').set({
    uid: 'member-user',
    role: 'member',
    displayName: 'Existing Member'
  });

  const manifest = await store.loadRoom('legacy1');
  assert.equal(manifest.id, 'LEGACY1');
  assert.equal(manifest.ownerUid, 'owner-user');
  assert.equal(manifest.world.kind, 'earth');
  assert.equal(manifest.revision, 0);
  assert.equal(await store.loadActorRole('LEGACY1', 'owner-user'), 'owner');
  assert.equal(await store.loadActorRole('LEGACY1', 'mod-user'), 'administrator');
  assert.equal(await store.loadActorRole('LEGACY1', 'member-user'), 'player');
  assert.equal(await store.loadActorRole('LEGACY1', 'unknown-user'), null);

  const catalog = createAssetCatalog();
  const inventoryPolicy = createInventoryPolicy(catalog);
  const processor = new RoomCommandProcessor({
    store,
    assetCatalog: catalog,
    inventoryPolicy
  });
  const rawCommand = {
    type: COMMAND_TYPES.PLACE_OBJECT,
    commandId: 'firestore-place-idempotent-0001',
    expectedRevision: 0,
    world: { kind: 'earth', lat: 39.2904, lon: -76.6122 },
    assetId: 'block.cube',
    position: { x: 5, y: 1, z: 9 },
    rotation: { x: 0, y: 0, z: 0 }
  };
  const context = {
    manifest,
    actor: { uid: 'mod-user', role: 'administrator' },
    rawCommand
  };
  const placed = await processor.process(context);
  assert.equal(placed.revision, 1);
  assert.equal(placed.duplicate, false);
  const duplicate = await processor.process(context);
  assert.equal(duplicate.revision, 1);
  assert.equal(duplicate.duplicate, true);
  await assert.rejects(
    () => processor.process({
      ...context,
      manifest: { ...manifest, revision: 1 },
      rawCommand: {
        ...rawCommand,
        commandId: 'firestore-position-occupied-0002',
        expectedRevision: 1,
        assetId: 'block.pyramid',
        position: { x: 5.1, y: 1.1, z: 9.2 }
      }
    }),
    (error) => error.code === 'position_occupied'
  );

  const spawned = await processor.process({
    manifest: { ...manifest, revision: 1 },
    actor: { uid: 'mod-user', role: 'administrator' },
    rawCommand: {
      type: COMMAND_TYPES.SPAWN_VEHICLE,
      commandId: 'firestore-spawn-vehicle-0002',
      expectedRevision: 1,
      world: { kind: 'earth', lat: 39.2904, lon: -76.6122 },
      assetId: 'vehicle.compact',
      position: { x: 3, y: 0, z: 4 },
      rotation: { x: 0, y: 0, z: 0 }
    }
  });
  const parts = spawned.patch.cellKey.split(':');
  const parkedCell = `${parts[0]}:${parts[1]}:${Number(parts[2]) + 1}:${parts[3]}`;
  await store.saveVehicleSnapshot('LEGACY1', spawned.patch.id, {
    cellKey: parkedCell,
    position: { x: 33, y: 0, z: 44 },
    rotation: { x: 0, y: 1.5, z: 0 }
  });
  const claimed = await processor.process({
    manifest: { ...manifest, revision: 2 },
    actor: { uid: 'mod-user', role: 'administrator' },
    rawCommand: {
      type: COMMAND_TYPES.CLAIM_CELL,
      commandId: 'firestore-claim-cell-000003',
      expectedRevision: 2,
      world: { kind: 'earth', lat: 39.2904, lon: -76.6122 },
      payload: { access: 'private' }
    }
  });
  assert.equal(claimed.revision, 3);
  await assert.rejects(
    () => processor.process({
      manifest: { ...manifest, revision: 3 },
      actor: { uid: 'member-user', role: 'builder' },
      rawCommand: {
        type: COMMAND_TYPES.PLACE_OBJECT,
        commandId: 'firestore-claim-denied-0004',
        expectedRevision: 3,
        world: { kind: 'earth', lat: 39.2904, lon: -76.6122 },
        assetId: 'block.ramp'
      }
    }),
    (error) => error.code === 'claim_denied'
  );
  const released = await processor.process({
    manifest: { ...manifest, revision: 3 },
    actor: { uid: 'mod-user', role: 'administrator' },
    rawCommand: {
      type: COMMAND_TYPES.RELEASE_CLAIM,
      commandId: 'firestore-release-claim-0005',
      expectedRevision: 3,
      world: { kind: 'earth', lat: 39.2904, lon: -76.6122 }
    }
  });
  assert.equal(released.revision, 4);
  const banned = await processor.process({
    manifest: { ...manifest, revision: 4 },
    actor: { uid: 'mod-user', role: 'administrator' },
    rawCommand: {
      type: COMMAND_TYPES.BAN_PLAYER,
      commandId: 'firestore-ban-member-000006',
      expectedRevision: 4,
      targetId: 'member-user',
      payload: { reason: 'Acceptance test' }
    }
  });
  assert.equal(banned.revision, 5);
  assert.equal(await store.isBanned('LEGACY1', 'member-user'), true);
  const unbanned = await processor.process({
    manifest: { ...manifest, revision: 5 },
    actor: { uid: 'mod-user', role: 'administrator' },
    rawCommand: {
      type: COMMAND_TYPES.UNBAN_PLAYER,
      commandId: 'firestore-unban-member-0007',
      expectedRevision: 5,
      targetId: 'member-user'
    }
  });
  assert.equal(unbanned.revision, 6);
  assert.equal(await store.isBanned('LEGACY1', 'member-user'), false);

  const patches = await store.loadCells('LEGACY1', [placed.patch.cellKey]);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].assetId, 'block.cube');
  const parkedVehicles = await store.loadCells('LEGACY1', [parkedCell]);
  assert.equal(parkedVehicles.length, 1);
  assert.equal(parkedVehicles[0].position.z, 44);
  const inventory = await store.loadInventory(
    'LEGACY1',
    'mod-user',
    inventoryPolicy.initialForRole('administrator')
  );
  assert.equal(inventory['block.cube'], 79);
  assert.equal(inventory['vehicle.compact'], 1);
  assert.equal((await store.loadRoom('LEGACY1')).revision, 6);
  assert.equal((await store.getAuditEvents('LEGACY1')).length, 6);

  const recoverySnapshot = {
    version: 1,
    roomRevision: 6,
    mode: 'walk',
    position: { x: 12, y: 3, z: -8 },
    yaw: 1.25,
    savedAtMs: Date.now()
  };
  await store.savePlayerSnapshot('LEGACY1', 'member-user', recoverySnapshot);
  assert.deepEqual(await store.loadPlayerSnapshot('LEGACY1', 'member-user'), recoverySnapshot);

  const memberProgression = {
    version: 1,
    uid: 'member-user',
    displayName: 'Existing Member',
    xp: 420,
    level: 2,
    credits: 75,
    equippedWeapon: 'weapon.bow',
    unlockedWeapons: ['weapon.sword', 'weapon.bow'],
    stats: { eliminations: 2, missionsCompleted: 1 },
    activeMission: null,
    updatedAtMs: Date.now()
  };
  await store.savePlayerProgression('LEGACY1', 'member-user', memberProgression);
  await store.savePlayerProgression('LEGACY1', 'mod-user', {
    ...memberProgression,
    uid: 'mod-user',
    displayName: 'Moderator',
    xp: 900,
    level: 2
  });
  assert.deepEqual(await store.loadPlayerProgression('LEGACY1', 'member-user'), memberProgression);
  const progressionLeaderboard = await store.loadProgressionLeaderboard('LEGACY1');
  assert.deepEqual(progressionLeaderboard.map((row) => row.uid), ['mod-user', 'member-user']);

  const unchangedLegacyRoom = (await roomRef.get()).data();
  assert.deepEqual(unchangedLegacyRoom, legacyRoom);
  await store.db.recursiveDelete(roomRef);
});
