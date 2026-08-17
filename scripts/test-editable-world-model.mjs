import assert from 'node:assert/strict';
import {
  applyWorldModificationOperation,
  worldModificationIdentityForLocation
} from '../app/js/editable-world/model.js';
import {
  BACKUP_KEY,
  createLocalWorldModificationStore,
  PRIMARY_KEY
} from '../app/js/editable-world/local-store.js';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    dump: () => Object.fromEntries(values)
  };
}

const worldId = worldModificationIdentityForLocation({ lat: 39.2904, lon: -76.6122 });
assert.equal(worldId, 'earth:v1:392904000:-766122000');
const storage = memoryStorage();
const store = createLocalWorldModificationStore({ storage });
assert.equal(store.initialize().enabled, true);

let result = store.commit(worldId, {
  action: 'suppress_base_building',
  suppression: { sourceFeatureId: 'osm:way:123', source: 'osm' }
}, { expectedRevision: 0, actorId: 'local:test', now: '2026-08-16T10:00:00.000Z' });
assert.equal(result.committed, true);
assert.equal(result.current.revision, 1);
assert.equal(result.current.suppressions[0].sourceFeatureId, 'osm:way:123');
assert.ok(storage.dump()[PRIMARY_KEY]);
assert.equal(storage.dump()[PRIMARY_KEY], storage.dump()[BACKUP_KEY], 'primary and backup diverged');

const conflict = store.commit(worldId, {
  action: 'restore_base_building', sourceFeatureId: 'osm:way:123'
}, { expectedRevision: 0 });
assert.equal(conflict.committed, false);
assert.equal(conflict.reason, 'revision-conflict');

result = store.commit(worldId, {
  action: 'upsert_object',
  object: {
    id: 'structure:1',
    type: 'storefront',
    materialId: 'glass',
    transform: {
      position: { x: 10, y: 2, z: 5 },
      rotation: { y: 1.2 },
      scale: { x: 3, y: 2.5, z: 0.2 }
    }
  }
}, { expectedRevision: 1, now: '2026-08-16T10:01:00.000Z' });
assert.equal(result.committed, true);
assert.equal(result.current.objects.length, 1);
assert.equal(result.current.objects[0].type, 'storefront');

const unsafe = applyWorldModificationOperation(result.current, {
  action: 'upsert_object',
  object: {
    id: 'bad',
    type: 'script',
    transform: { position: { x: 0, y: 0, z: 0 } }
  }
}, { worldId, expectedRevision: 2 });
assert.equal(unsafe.committed, false);
assert.equal(unsafe.reason, 'invalid-object');

const recoveryStorage = memoryStorage({
  [PRIMARY_KEY]: '{corrupt',
  [BACKUP_KEY]: storage.dump()[BACKUP_KEY]
});
const recovered = createLocalWorldModificationStore({ storage: recoveryStorage });
assert.equal(recovered.initialize().recovery, 'backup');
assert.equal(recovered.snapshot(worldId).revision, 2);

result = store.commit(worldId, { action: 'reset_world' }, { expectedRevision: 2 });
assert.equal(result.committed, true);
assert.equal(result.current.suppressions.length, 0);
assert.equal(result.current.objects.length, 0);
assert.equal(result.current.history.at(-1).action, 'reset_world');

console.log(JSON.stringify({
  ok: true,
  contract: 'editable-world-local-delta-v1',
  worldId,
  primaryBackup: true,
  optimisticRevisionConflict: true,
  unsafeCatalogRejected: true,
  backupRecovery: true,
  resetToBase: true
}, null, 2));
