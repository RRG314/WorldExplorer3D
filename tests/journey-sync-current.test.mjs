import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fixture, envelope } from './helpers/journey-service-fixture.mjs';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js';
import { createLocalBackpackStore } from '../app/js/player/backpack-store.js';
import { createJourneySync } from '../app/js/player/journey-sync.js';
import { createJourneyCloudApi } from '../app/js/player/journey-cloud-api.js';
import {
  captureJourneySnapshot,
  journeyLogicalDigest,
  createJourneyRestoreOwner,
} from '../app/js/player/journey-snapshot.js';
import { encodeJourney, decodeJourney } from '../app/js/player/journey-codec.js';
const seed = JSON.parse(
  await fs.readFile(
    new URL(
      '../output/verification/cinematic-app-20261105/journey-1793890040223/qa-fieldwork-backup.json',
      import.meta.url
    ),
    'utf8'
  )
);
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
function device(f, { backup, uid = 'account-a', send } = {}) {
  const storage = memoryStorage(),
    store = createMemoryDiscoveryProfileStore(backup || {}),
    backpackStore = createLocalBackpackStore(storage);
  let owner = uid,
    reloads = 0,
    playing = false;
  const sync = createJourneySync({
    storage,
    getStore: async () => store,
    getBackpackStore: async () => backpackStore,
    getOwnerUid: () => owner,
    projectId: 'test-project',
    isPlaying: () => playing,
    send: send || ((input) => f.api.handle(owner, input)),
    reload: () => reloads++,
  });
  return {
    sync,
    store,
    storage,
    backpackStore,
    owner: (value) => (owner = value),
    playing: (value) => (playing = value),
    reloads: () => reloads,
    capture: () => captureJourneySnapshot({ store, storage, backpackStore, ownerUid: owner }),
  };
}
async function name(d, value) {
  await d.store.saveProfile({
    ...(await d.store.getProfile()),
    journeyPreferences: { ...(await d.store.getProfile()).journeyPreferences, explorerName: value },
  });
  d.sync.markDirty();
}
async function associate(d) {
  await d.sync.ownerChanged();
  assert.equal(d.sync.snapshot().status, 'choose');
  await d.sync.act('device');
  assert.equal(d.sync.snapshot().status, 'saved');
}

test('codec and authenticated transport preserve a multi-block save and reject corruption and stale owners', async () => {
  const f = fixture(),
    value = envelope();
  value.deviceState.local['worldExplorer3D.activityLibrary.v1'] = JSON.stringify({
    opaque: Array.from({ length: 25 }, () =>
      Buffer.from(crypto.getRandomValues(new Uint8Array(65000))).toString('base64')
    ).join(''),
  });
  const encoded = await encodeJourney(value);
  assert.ok(encoded.chunkCount > 1);
  assert.deepEqual(await decodeJourney(encoded.bytes, encoded, value.ownerUid), value);
  const broken = encoded.bytes.slice();
  broken[0] ^= 1;
  await assert.rejects(decodeJourney(broken, encoded, value.ownerUid), /completely/);
  let owner = value.ownerUid;
  const api = createJourneyCloudApi({
    getOwnerUid: () => owner,
    send: (input) => f.api.handle(owner, input),
  });
  const manifest = await api.upload(owner, value, {
    expectedRevision: 0,
    clientId: crypto.randomUUID(),
  });
  assert.deepEqual(await api.download(owner, manifest), value);
  owner = 'account-b';
  await assert.rejects(api.head('account-a'), /changed/);
  const other = createJourneyCloudApi({
    getOwnerUid: () => owner,
    send: (input) => f.api.handle(owner, input),
  });
  await assert.rejects(other.download(owner, manifest), (e) => e.status === 404);
});
test('real Journal and personal Backpack restore across devices without adding rewards, then stay logically identical after reload', async () => {
  const f = fixture(),
    a = device(f, { backup: seed }),
    b = device(f);
  try {
    a.storage.setItem(
      'worldExplorer3D.lastLocation.v1',
      JSON.stringify({ lat: 39.2904, lon: -76.6122 })
    );
    a.backpackStore.load();
    assert.equal(
      a.backpackStore.restoreJourneySnapshot({
        schemaVersion: 3,
        items: [],
        housing: { schemaVersion: 2, homes: [{ id: 'owned', x: 1, y: 2, z: 3, storage: [] }] },
        commerce: { schemaVersion: 4, credits: 3210 },
      }),
      true
    );
    await associate(a);
    const original = await a.capture();
    await b.sync.ownerChanged();
    assert.equal(b.reloads(), 1);
    const restored = await b.capture();
    assert.deepEqual(
      { ...restored.journal.profile, updatedAt: 0 },
      { ...original.journal.profile, updatedAt: 0 }
    );
    assert.equal(await journeyLogicalDigest(restored), await journeyLogicalDigest(original));
    assert.deepEqual(restored.journal.events, original.journal.events);
    assert.equal(restored.deviceState.backpack.commerce.credits, 3210);
    assert.equal(restored.deviceState.backpack.housing.homes[0].id, 'owned');
    assert.equal(restored.journal.profile.activeExperience.experienceId, 'career:geologist');
    await b.sync.check();
    assert.equal(b.sync.snapshot().status, 'saved');
    assert.equal((await f.api.handle('account-a', { action: 'head' })).revision, 1);
  } finally {
    a.sync.dispose();
    b.sync.dispose();
  }
});
test('both changed devices produce an explicit conflict, keep local history and do not interrupt active play', async () => {
  const f = fixture(),
    a = device(f, { backup: seed }),
    b = device(f);
  try {
    await associate(a);
    await b.sync.ownerChanged();
    await b.sync.check();
    f.advance(3000);
    await name(a, 'Device A');
    await a.sync.flush();
    await name(b, 'Device B');
    b.playing(true);
    await b.sync.flush();
    assert.equal(b.sync.snapshot().status, 'conflict');
    assert.equal(b.sync.canPlay(), true);
    assert.equal((await b.store.getProfile()).journeyPreferences.explorerName, 'Device B');
    assert.equal(
      (await f.api.handle('account-a', { action: 'head' })).current.summary.name,
      'Device A'
    );
    f.advance(3000);
    await b.sync.act('device');
    assert.equal(
      (await f.api.handle('account-a', { action: 'head' })).current.summary.name,
      'Device B'
    );
    assert.equal(
      (await f.api.handle('account-a', { action: 'head' })).previous.summary.name,
      'Device A'
    );
  } finally {
    a.sync.dispose();
    b.sync.dispose();
  }
});
test('an ambiguously acknowledged commit is recovered once; changes during upload remain pending', async () => {
  const f = fixture();
  let ambiguous = true,
    d,
    changeDuring = false;
  d = device(f, {
    backup: seed,
    send: async (input) => {
      const result = await f.api.handle('account-a', input);
      if (input.action === 'chunk' && changeDuring) {
        changeDuring = false;
        await name(d, 'During upload');
      }
      if (input.action === 'commit' && ambiguous) {
        ambiguous = false;
        throw Error('connection lost after commit');
      }
      return result;
    },
  });
  try {
    await associate(d);
    assert.equal((await f.api.handle('account-a', { action: 'head' })).revision, 1);
    f.advance(3000);
    await name(d, 'Before upload');
    changeDuring = true;
    await d.sync.flush();
    assert.equal(d.sync.snapshot().status, 'pending');
    assert.equal(
      (await f.api.handle('account-a', { action: 'head' })).current.summary.name,
      'Before upload'
    );
    f.advance(3000);
    await d.sync.flush();
    assert.equal(d.sync.snapshot().status, 'saved');
    assert.equal(
      (await f.api.handle('account-a', { action: 'head' })).current.summary.name,
      'During upload'
    );
  } finally {
    d.sync.dispose();
  }
});
test('switching accounts archives the former owner and never uploads their Journal into another account', async () => {
  const f = fixture(),
    d = device(f, { backup: seed });
  try {
    await associate(d);
    d.owner('account-b');
    await d.sync.ownerChanged();
    assert.equal(d.reloads(), 2);
    assert.equal((await d.store.getProfile()).journeyPreferences?.explorerName || '', '');
    assert.equal((await f.api.handle('account-b', { action: 'head' })).current, null);
    const prior = await d.store.readJourneyRecovery('account:test-project:account-a:account');
    assert.equal(prior.envelope.journal.events.length, seed.events.length);
    d.owner('account-a');
    await d.sync.ownerChanged();
    assert.equal((await d.store.getProfile()).activeExperience.experienceId, 'career:geologist');
  } finally {
    d.sync.dispose();
  }
});
test('stale account callbacks cannot publish another account’s save or clear its recovery gate', async () => {
  const f = fixture();
  let release;
  const d = device(f, {
    backup: seed,
    send: (input) =>
      new Promise((resolve) => (release = () => resolve(f.api.handle('account-a', input)))),
  });
  try {
    const pending = d.sync.ownerChanged();
    while (!release) await new Promise((resolve) => setImmediate(resolve));
    d.owner('account-b');
    release();
    await pending;
    assert.equal((await f.api.handle('account-b', { action: 'head' })).current, null);
    assert.notEqual(d.sync.snapshot().status, 'saved');
  } finally {
    d.sync.dispose();
  }
});
test('partial owner restore leaves a durable recovery gate; finishing or rolling back uses the original owners', async () => {
  const f = fixture(),
    a = device(f, { backup: seed }),
    b = device(f);
  try {
    const value = await a.capture();
    let binding = null,
      reloaded = 0,
      fail = true;
    const store = {
      ...b.store,
      importData: async (...args) => {
        if (fail) throw Error('quota failure');
        return b.store.importData(...args);
      },
    };
    const restore = createJourneyRestoreOwner({
      store,
      backpackStore: b.backpackStore,
      storage: b.storage,
      readBinding: () => binding,
      writeBinding: (value) => (binding = value),
      reload: () => reloaded++,
    });
    await assert.rejects(restore.restore(value, { ownerUid: 'account-a' }), /quota/);
    const marker = await restore.pending();
    assert.equal(marker.phase, 'prepared');
    assert.equal(binding, null);
    assert.equal(reloaded, 0);
    fail = false;
    await restore.finish(marker);
    assert.equal((await restore.pending()).phase, 'complete');
    assert.equal(reloaded, 1);
    assert.deepEqual((await b.capture()).journal.events, value.journal.events);
    await assert.rejects(restore.rollback(marker, { ownerUid: 'account-b' }), /owns/);
    await restore.rollback(marker, { ownerUid: '' });
    assert.equal((await b.store.exportData()).events.length, 0);
  } finally {
    a.sync.dispose();
    b.sync.dispose();
  }
});

test('same-account pending receipts survive restore without gaining server authority; other-owner queues are rejected', async () => {
  const f = fixture(),
    a = device(f),
    b = device(f);
  try {
    const source = createMemoryDiscoveryProfileStore({ getReceiptOwnerUid: () => 'account-a' });
    await source.collect({
      instanceId: 'item:1',
      claimId: 'claim:1',
      catalogId: 'rock',
      worldIdentity: 'test',
      activityId: 'inspect',
      evidenceClass: 'virtual-field-record',
    });
    const value = await captureJourneySnapshot({
      store: source,
      storage: a.storage,
      backpackStore: a.backpackStore,
      ownerUid: 'account-a',
    });
    assert.equal(value.receiptOutbox.length, 1);
    const restore = createJourneyRestoreOwner({
      store: b.store,
      storage: b.storage,
      backpackStore: b.backpackStore,
      writeBinding: () => {},
      reload: () => {},
    });
    await restore.restore(value, { ownerUid: 'account-a' });
    assert.equal((await b.store.listPendingReceipts('account-a')).length, 1);
    assert.equal((await b.store.listPendingReceipts('account-b')).length, 0);
    assert.equal((await b.store.listItems())[0].authority, 'anonymous-local');
    assert.deepEqual((await b.store.exportData()).events, value.journal.events);
    const wrong = structuredClone(value);
    wrong.receiptOutbox[0].ownerUid = 'account-b';
    await assert.rejects(restore.restore(wrong, null), /queue/);
  } finally {
    a.sync.dispose();
    b.sync.dispose();
  }
});
test('connection loss preserves playable linked state and retry publishes the saved local changes', async () => {
  const f = fixture();
  let offline = false;
  const d = device(f, {
    backup: seed,
    send: (input) => {
      if (offline) throw Error('offline');
      return f.api.handle('account-a', input);
    },
  });
  try {
    await associate(d);
    f.advance(3000);
    await name(d, 'Offline progress');
    offline = true;
    await d.sync.flush();
    assert.equal(d.sync.snapshot().status, 'error');
    assert.equal(d.sync.canPlay(), true);
    assert.equal((await d.store.getProfile()).journeyPreferences.explorerName, 'Offline progress');
    offline = false;
    await d.sync.act('retry');
    assert.equal(d.sync.snapshot().status, 'saved');
    assert.equal(
      (await f.api.handle('account-a', { action: 'head' })).current.summary.name,
      'Offline progress'
    );
  } finally {
    d.sync.dispose();
  }
});

test('previous account save is available for recovery and restoring it becomes a new revision', async () => {
  const f = fixture(),
    d = device(f, { backup: seed });
  try {
    await associate(d);
    f.advance(3000);
    await name(d, 'Newer name');
    await d.sync.flush();
    assert.equal(d.sync.snapshot().previous.summary.name, 'River');
    await d.sync.act('previous');
    assert.equal((await d.store.getProfile()).journeyPreferences.explorerName, 'River');
    f.advance(3000);
    await d.sync.act('retry');
    assert.equal(d.sync.snapshot().status, 'saved');
    const head = await f.api.handle('account-a', { action: 'head' });
    assert.equal(head.revision, 3);
    assert.equal(head.current.summary.name, 'River');
    assert.equal(head.previous.summary.name, 'Newer name');
  } finally {
    d.sync.dispose();
  }
});

test('a page without the original possessions writer lock cannot publish a stale personal save', async () => {
  const f = fixture(),
    d = device(f, { backup: seed });
  let sync;
  try {
    sync = createJourneySync({
      storage: d.storage,
      getStore: async () => d.store,
      getBackpackStore: async () => ({ ...d.backpackStore, writable: () => false }),
      getOwnerUid: () => 'account-a',
      projectId: 'test-project',
      send: (input) => f.api.handle('account-a', input),
      reload: () => {},
    });
    await sync.ownerChanged();
    await sync.act('device');
    assert.equal(sync.snapshot().status, 'error');
    assert.match(sync.snapshot().message, /another tab/);
    assert.equal((await f.api.handle('account-a', { action: 'head' })).current, null);
  } finally {
    sync?.dispose();
    d.sync.dispose();
  }
});
