import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemoryDiscoveryProfileStore,
  DISCOVERY_DB_VERSION
} from '../app/js/discovery/profile-store.js';
import { validateJournalBackup } from '../app/js/discovery/backup-validation.js';
test('a media-bearing file blocks legacy v5 readers while leaving the database and ordinary backups compatible', async () => {
  const old = await createMemoryDiscoveryProfileStore().exportData();
  assert.equal(old.schemaVersion, 5);
  assert.equal(DISCOVERY_DB_VERSION, 5);
  const future = {
    id: 'research-media:future-role:future-run-0001:subject',
    schemaVersion: 2,
    opaque: { retained: true }
  };
  const mediaStore = createMemoryDiscoveryProfileStore({ researchMedia: [future] }),
    backup = await mediaStore.exportData();
  assert.ok(
    backup.schemaVersion > 5,
    'Old readers only admit versions through 5; they must reject this archive before replacement'
  );
  assert.doesNotThrow(() => validateJournalBackup(backup));
  const target = createMemoryDiscoveryProfileStore();
  await target.importData(backup);
  assert.deepEqual((await target.exportData()).researchMedia, [future]);
  await target.importData(old);
  assert.equal((await target.exportData()).schemaVersion, 5);
  await target.rollbackLastImport();
  assert.deepEqual((await target.exportData()).researchMedia, [future]);
});
