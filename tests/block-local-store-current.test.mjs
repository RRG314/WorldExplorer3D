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

function createStore() {
  return createBlockLocalStore({
    backupKey,
    legacyKeys: [],
    maxPerLocation: 200,
    maxTotal: 5000,
    migrationKey,
    normalizeEntry,
    storageKey,
    testKey
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
