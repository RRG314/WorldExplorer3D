import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackpackModel } from '../app/js/player/backpack-model.js';
import {
  BACKPACK_BACKUP_KEY,
  BACKPACK_STORAGE_KEY,
  createLocalBackpackStore
} from '../app/js/player/backpack-store.js';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
}

const LEGACY_KEY = 'world-explorer:character-backpack:v1';

test('legacy Backpack migration is versioned, idempotent, backed up, and reversible', () => {
  const legacy = {
    schemaVersion: 1,
    revision: 7,
    equippedInstanceId: 'reward:retry',
    hotbar: ['reward:retry', 'starter:hands'],
    items: [
      { instanceId: 'reward:first', catalogId: 'harbor-token', sourceEventId: 'event:harbor:1', authority: 'anonymous-local' },
      { instanceId: 'reward:retry', catalogId: 'harbor-token', sourceEventId: 'event:harbor:1', authority: 'anonymous-local' },
      { instanceId: 'starter:hands', catalogId: 'hands', authority: 'anonymous-local' }
    ],
    ammo: { 'pulse-sidearm': { magazine: 4, reserve: 12 } }
  };
  const storage = memoryStorage({ [LEGACY_KEY]: JSON.stringify(legacy) });
  const store = createLocalBackpackStore(storage);
  const first = store.load();
  const second = store.load();

  assert.equal(first.schemaVersion, 2);
  assert.equal(first.items.length, 2);
  assert.equal(first.hotbar[0], 'reward:first');
  assert.equal(first.equippedInstanceId, 'reward:first');
  assert.deepEqual(first.ammo, legacy.ammo);
  assert.equal(first.migration.sourceVersion, 1);
  assert.equal(first.migration.duplicateEventRewardsRemoved, 1);
  assert.equal(first.migration.backupAvailable, true);
  assert.equal(second.migration.migratedAt, first.migration.migratedAt);
  assert.equal(second.migration.duplicateEventRewardsRemoved, 1);
  assert.equal(storage.getItem(BACKPACK_STORAGE_KEY) != null, true);
  assert.equal(storage.getItem(BACKPACK_BACKUP_KEY) != null, true);

  assert.equal(store.rollbackMigration(), true);
  assert.equal(storage.getItem(BACKPACK_STORAGE_KEY), null);
  assert.deepEqual(JSON.parse(storage.getItem(LEGACY_KEY)), legacy);
});

test('one authoritative event cannot create two Backpack rewards under different instance IDs', () => {
  const backpack = createBackpackModel({
    definitions: [{ id: 'harbor-token', label: 'Harbor token', category: 'field-find', verbs: ['inspect'] }]
  });
  const firstId = backpack.upsertItem({
    instanceId: 'reward:local', catalogId: 'harbor-token', sourceEventId: 'event:harbor:2'
  });
  const retryId = backpack.upsertItem({
    instanceId: 'reward:server-retry', catalogId: 'harbor-token', sourceEventId: 'event:harbor:2', authority: 'server-receipt'
  }, { hotbarSlot: 1 });
  const snapshot = backpack.snapshot();

  assert.equal(firstId, 'reward:local');
  assert.equal(retryId, 'reward:local');
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].authority, 'server-receipt');
  assert.equal(snapshot.hotbar[0], 'reward:local');
  assert.equal(snapshot.duplicateEventMerges, 1);
});

test('signed-in receipt reconciliation upgrades the local claim without duplicating Journal, Guide, progress, or item state', async () => {
  const store = createMemoryDiscoveryProfileStore();
  const local = {
    instanceId: 'item:local',
    claimId: 'claim:account-reconcile',
    catalogId: 'harbor-token',
    name: 'Harbor token',
    discipline: 'exploration',
    activityId: 'inspect',
    regionId: 'baltimore',
    worldIdentity: 'baltimore',
    evidenceClass: 'virtual-field-record',
    collectedAt: 1_000
  };
  const first = await store.collect(local);
  const retry = await store.collect({ ...local, instanceId: 'item:server', collectedAt: 2_000 });
  const upgraded = await store.applyTrustedReceipt(first.item.instanceId, {
    authority: 'server-receipt', itemId: 'server-item-1', tradeable: false
  });

  assert.equal(first.recorded, true);
  assert.equal(retry.recorded, false);
  assert.equal(retry.reason, 'already-claimed');
  assert.equal(retry.item.instanceId, 'item:local');
  assert.equal(upgraded.authority, 'server-receipt');
  assert.equal((await store.listItems()).length, 1);
  assert.equal((await store.listEvents()).length, 1);
  assert.equal((await store.listFieldGuide()).length, 1);
  assert.equal((await store.getProfile()).explorerProgress.totalRecords, 1);
});
