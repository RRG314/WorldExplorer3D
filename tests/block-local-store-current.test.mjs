import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlockLocalStore } from '../app/js/block-builder/local-store.js';

class FaultableStorage {
  constructor() {
    this.values = new Map();
    this.failKey = '';
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    if (key === this.failKey) throw new Error(`injected write failure for ${key}`);
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const storageKey = 'blocks.primary';
const backupKey = 'blocks.backup';
const testKey = 'blocks.probe';
const migrationKey = 'blocks.migration';

function normalizeEntry(raw) {
  if (!raw?.locationKey || !Number.isFinite(raw.gx) || !Number.isFinite(raw.gy) || !Number.isFinite(raw.gz)) return null;
  return {
    id: String(raw.id || 'test-block'),
    locationKey: String(raw.locationKey),
    lat: Number(raw.lat || 0),
    lon: Number(raw.lon || 0),
    gx: Number(raw.gx),
    gy: Number(raw.gy),
    gz: Number(raw.gz),
    materialIndex: Number(raw.materialIndex || 0),
    shape: String(raw.shape || 'cube'),
    rotation: Number(raw.rotation || 0),
    createdAt: String(raw.createdAt || '2026-08-25T00:00:00.000Z')
  };
}

function createStore(options = {}) {
  return createBlockLocalStore({
    backupKey,
    legacyKeys: [],
    maxPerLocation: 200,
    maxTotal: 5000,
    migrationKey,
    normalizeEntry,
    storageKey,
    testKey,
    ...options
  });
}

function row() {
  return {
    locationKey: '39.28305,-76.61270',
    lat: 39.28305,
    lon: -76.61270,
    gx: 4,
    gy: 0.5,
    gz: 6,
    materialIndex: 2,
    shape: 'wall',
    rotation: 1
  };
}

function withStorage(run) {
 const previous=globalThis.localStorage,storage=new FaultableStorage();globalThis.localStorage=storage;
 try { return run(storage); } finally { if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous; }
}

test('stale block writers cannot replace another tab or its newer recovery copy',()=>withStorage(storage=>{
 const first=createStore(),stale=createStore();first.initialize();stale.initialize();assert.equal(first.upsert(row()),true);
 const committed=storage.getItem(storageKey);assert.equal(stale.upsert({...row(),gx:8}),false);assert.equal(stale.getStatus().notice,'conflict');assert.equal(storage.getItem(storageKey),committed);
 const next=createStore();next.initialize();storage.setItem(backupKey,'{newer-backup');assert.equal(next.clearLocation(row().locationKey),false);
 assert.equal(storage.getItem(storageKey),committed);assert.equal(JSON.parse(next.exportRecovery()).backup,'{newer-backup');
}));
test('backup failure leaves a successful primary block commit visible after reload',()=>withStorage(storage=>{
 const store=createStore();store.initialize();storage.failKey=backupKey;assert.equal(store.upsert(row()),true);
 assert.equal(store.getStatus().backupAvailable,false);assert.equal(store.countForLocation(row().locationKey),1);
 storage.failKey='';const restored=createStore();restored.initialize();assert.equal(restored.countForLocation(row().locationKey),1);
 assert.equal(restored.upsert({...row(),gx:8}),true);assert.equal(restored.getStatus().notice,'none');
}));
test('unsupported, lossy, duplicate and over-limit saved block rows are preserved read-only',()=>withStorage(storage=>{
 const valid=normalizeEntry(row()),good=JSON.stringify([valid]);
 for(const original of ['{damaged',JSON.stringify([{...valid,futureTerrain:{height:3}}]),JSON.stringify([{...valid,shape:null}]),JSON.stringify([valid,valid]),JSON.stringify(Array.from({length:6},(_,gx)=>({...valid,id:`b${gx}`,gx})))]){
  storage.setItem(storageKey,original);storage.setItem(backupKey,good);const store=createStore({maxTotal:5});store.initialize();
  assert.equal(store.getStatus().enabled,false);assert.equal(store.upsert({...row(),gx:12}),false);assert.equal(store.countForLocation(row().locationKey),1);
  assert.equal(storage.getItem(storageKey),original);assert.equal(storage.getItem(backupKey),good);assert.equal(JSON.parse(store.exportRecovery()).primary,original);
 }
}));
test('a missing primary can use a valid backup without writing during load; a damaged backup cannot be erased',()=>withStorage(storage=>{
 const backup=JSON.stringify([normalizeEntry(row())]);storage.setItem(backupKey,backup);const store=createStore();store.initialize();
 assert.equal(store.getStatus().enabled,true);assert.equal(store.countForLocation(row().locationKey),1);assert.equal(storage.getItem(storageKey),null);
 const entry=store.listForLocation(row().locationKey)[0];assert.throws(()=>{entry.gx=99;},TypeError);
 storage.setItem(backupKey,'{only-original');const blocked=createStore();blocked.initialize();assert.equal(blocked.getStatus().enabled,false);
 assert.equal(blocked.clearLocation(row().locationKey),false);assert.equal(storage.getItem(backupKey),'{only-original');
}));
test('unreadable-only legacy blocks do not receive an empty replacement or completed migration marker',()=>withStorage(storage=>{
 storage.setItem('legacy','{original');const store=createStore({legacyKeys:['legacy']});store.initialize();
 assert.equal(store.getStatus().enabled,false);assert.equal(storage.getItem(storageKey),null);assert.equal(storage.getItem(migrationKey),null);
 assert.equal(JSON.parse(store.exportRecovery()).legacy.legacy,'{original');
}));

test('current Blocks storage keeps rendered authority aligned with the last committed primary record', () => {
  const priorStorage = globalThis.localStorage;
  const storage = new FaultableStorage();
  globalThis.localStorage = storage;
  try {
    const store = createStore();
    store.initialize();
    assert.equal(store.upsert(row()), true, 'normal placement must commit');
    assert.equal(store.countForLocation(row().locationKey), 1);
    assert.deepEqual(JSON.parse(storage.getItem(storageKey)), JSON.parse(storage.getItem(backupKey)));

    storage.failKey = storageKey;
    assert.equal(
      store.removeAt(row().locationKey, row().gx, row().gy, row().gz),
      false,
      'a rejected authoritative write must report failure'
    );
    assert.equal(store.countForLocation(row().locationKey), 1, 'the in-memory block must roll back');
    assert.equal(JSON.parse(storage.getItem(storageKey)).length, 1, 'the committed primary record must remain');
    assert.equal(JSON.parse(storage.getItem(backupKey)).length, 1, 'the recovery record must be restored');
    assert.equal(store.clearLocation(row().locationKey), false, 'a disabled store must not claim a later clear succeeded');
    assert.equal(store.upsert({ ...row(), gx: 8 }), false, 'a disabled store must not claim an unsaved placement succeeded');

    storage.failKey = '';
    const reloaded = createStore();
    reloaded.initialize();
    assert.equal(reloaded.countForLocation(row().locationKey), 1, 'reload must restore the last committed block');
    assert.equal(reloaded.removeAt(row().locationKey, row().gx, row().gy, row().gz), true, 'restored storage must permit removal');
    assert.equal(JSON.parse(storage.getItem(storageKey)).length, 0);
    assert.equal(JSON.parse(storage.getItem(backupKey)).length, 0);
  } finally {
    if (priorStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = priorStorage;
  }
});

test('versioned Blocks storage migrates a valid legacy copy without deleting it', () => {
  const priorStorage = globalThis.localStorage;
  const storage = new FaultableStorage();
  const legacyPrimaryKey = 'blocks.legacy.primary';
  const legacyBackupKey = 'blocks.legacy.backup';
  const nextPrimaryKey = 'blocks.v2.primary';
  const nextBackupKey = 'blocks.v2.backup';
  const nextMigrationKey = 'blocks.v2.migration';
  storage.setItem(legacyPrimaryKey, '{damaged');
  storage.setItem(legacyBackupKey, JSON.stringify([row()]));
  globalThis.localStorage = storage;
  try {
    const store = createBlockLocalStore({
      backupKey: nextBackupKey,
      legacyKeys: [legacyPrimaryKey, legacyBackupKey],
      maxPerLocation: 200,
      maxTotal: 5000,
      migrationKey: nextMigrationKey,
      normalizeEntry,
      storageKey: nextPrimaryKey,
      testKey
    });
    store.initialize();

    assert.equal(store.countForLocation(row().locationKey), 1);
    assert.equal(store.getStatus().notice, 'migrated');
    assert.equal(storage.getItem(nextMigrationKey), 'done');
    assert.deepEqual(JSON.parse(storage.getItem(nextPrimaryKey)), JSON.parse(storage.getItem(nextBackupKey)));
    assert.equal(storage.getItem(legacyPrimaryKey), '{damaged', 'damaged legacy input remains recoverable');
    assert.equal(JSON.parse(storage.getItem(legacyBackupKey)).length, 1, 'legacy backup is not deleted');

    const reloaded = createBlockLocalStore({
      backupKey: nextBackupKey,
      legacyKeys: [legacyPrimaryKey, legacyBackupKey],
      maxPerLocation: 200,
      maxTotal: 5000,
      migrationKey: nextMigrationKey,
      normalizeEntry,
      storageKey: nextPrimaryKey,
      testKey
    });
    reloaded.initialize();
    assert.equal(reloaded.countForLocation(row().locationKey), 1, 'migration is idempotent');
  } finally {
    if (priorStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = priorStorage;
  }
});
