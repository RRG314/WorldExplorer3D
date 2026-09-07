'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Readable } = require('node:stream');
const { buildCommunityRealityCaptureExports } = require('../functions/community-reality-capture.js');

// Execute actual HTTP handlers with isolated storage/Firestore doubles. These
// check endpoint effects, not source strings; they do not replace emulator IAM tests.
const id = 'capture-test';
const prefix = `reality-captures/owner/${id}/`;
const photoPath = `${prefix}originals/${'a'.repeat(32)}.jpg`;
const modelPath = `${prefix}processed/pipeline/capture.glb`;
const base = { ownerUid: 'owner', captureKind: 'exterior', status: 'approved',
  publicContributionRequested: true, processed: { optimizedModelPath: modelPath } };

function harness(t, capture = base, extras = {}) {
  t.mock.method(console, 'error', () => {});
  const records = new Map(Object.entries(extras));
  if (capture) records.set(`realityCaptures/${id}`, structuredClone(capture));
  const versions = new Map();
  const writes = [];
  const reads = [];
  let generation = 1;
  function version(path) { return versions.get(path) || 0; }
  function snapshot(path) {
    const data = records.get(path);
    const value = version(path);
    return { exists: data !== undefined, data: () => data && structuredClone(data),
      updateTime: { value, isEqual: (other) => value === other?.value } };
  }
  function ref(path) {
    return { path, get: async () => snapshot(path),
      collection: (name) => collection(`${path}/${name}`),
      set: async (patch) => { mutate(path, patch); writes.push(path); } };
  }
  function collection(path) { return { doc: (name) => ref(`${path}/${name}`) }; }
  function mutate(path, patch) {
    if (patch === null) records.delete(path);
    else records.set(path, { ...records.get(path), ...patch });
    versions.set(path, generation++);
  }
  const db = { collection, runTransaction: async (callback) => {
    const staged = [];
    await callback({ get: async (reference) => snapshot(reference.path),
      update: (reference, patch) => staged.push([reference.path, patch]) });
    for (const [path, patch] of staged) { mutate(path, patch); writes.push(path); }
  } };
  const bucket = {
    getFiles: async () => [[]],
    file: (path) => { reads.push(path); return {
      exists: async () => [true], getSignedUrl: async () => ['https://example.invalid/private-test-url']
    }; }
  };
  const api = buildCommunityRealityCaptureExports({ db, bucket, setCors: () => false,
    verifyAuth: async (req) => ({ uid: req.uid }), verifyAppCheck: async () => true });
  async function call(name, uid, body = {}) {
    const res = { headers: {}, status(code) { this.code = code; return this; },
      set(key, value) { this.headers[key] = value; return this; },
      json(value) { this.body = value; return this; } };
    await api[name]({ method: 'POST', uid, body: { captureId: id, ...body } }, res);
    return res;
  }
  return { call, bucket, records, reads, writes, mutate };
}

for (const [label, capture, uid, status] of [
  ['another owner', { ...base, status: 'draft' }, 'attacker', 403],
  ['missing capture', null, 'owner', 404],
  ['already approved', base, 'owner', 409],
  ['already queued', { ...base, status: 'queued' }, 'owner', 409]
]) test(`finalization does not mutate ${label}`, async (t) => {
  const h = harness(t, capture);
  const before = [...h.records];
  assert.equal((await h.call('finalizeRealityCaptureUpload', uid)).code, status);
  assert.deepEqual(h.writes, []);
  assert.deepEqual([...h.records], before);
});

test('empty capture ID fails without creating any record', async (t) => {
  const h = harness(t);
  assert.equal((await h.call('finalizeRealityCaptureUpload', 'owner', { captureId: '' })).code, 422);
  assert.deepEqual(h.writes, []);
});

test('owned invalid photo set records failure without losing capture fields', async (t) => {
  const h = harness(t, { ...base, status: 'draft' });
  assert.equal((await h.call('finalizeRealityCaptureUpload', 'owner')).code, 422);
  const capture = h.records.get(`realityCaptures/${id}`);
  assert.equal(capture.status, 'processing_failed');
  assert.equal(capture.ownerUid, 'owner');
  assert.equal(capture.failure.stage, 'upload_validation');
  assert.equal(h.writes.length, 1);
});

function validPhotos() {
  return Array.from({ length: 20 }, (_, i) => ({ name: `${prefix}originals/${String(i).padStart(32, '0')}.jpg`,
    getMetadata: async () => [{ size: 1024, contentType: 'image/jpeg', metadata: { width: 1920, height: 1080 } }],
    createReadStream: () => Readable.from([Buffer.from([255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0])]) }));
}

test('owned valid set queues atomically and repeat finalization cannot regress it', async (t) => {
  const h = harness(t, { ...base, status: 'draft' });
  h.bucket.getFiles = async () => [validPhotos()];
  assert.equal((await h.call('finalizeRealityCaptureUpload', 'owner')).code, 200);
  const capture = h.records.get(`realityCaptures/${id}`);
  assert.equal(capture.status, 'queued');
  assert.equal(capture.uploadSummary.photoCount, 20);
  assert.equal(h.writes.length, 1);
  assert.equal((await h.call('finalizeRealityCaptureUpload', 'owner')).code, 409);
  assert.equal(h.records.get(`realityCaptures/${id}`).status, 'queued');
  assert.equal(h.writes.length, 1);
});

for (const changed of [null, { status: 'approved' }, { ownerUid: 'new-owner' }, { label: 'edited' }]) {
  test(`late validation cannot overwrite concurrent change ${JSON.stringify(changed)}`, async (t) => {
    const h = harness(t, { ...base, status: 'uploading' });
    h.bucket.getFiles = async () => { h.mutate(`realityCaptures/${id}`, changed); return [validPhotos()]; };
    const res = await h.call('finalizeRealityCaptureUpload', 'owner');
    assert.notEqual(res.code, 200);
    assert.deepEqual(h.writes, []);
    if (changed === null) assert.equal(h.records.has(`realityCaptures/${id}`), false);
  });
}

test('failed validation cannot overwrite concurrent approval', async (t) => {
  const h = harness(t, { ...base, status: 'uploading' });
  h.bucket.getFiles = async () => { h.mutate(`realityCaptures/${id}`, { status: 'approved' }); throw Error('storage_failure'); };
  await h.call('finalizeRealityCaptureUpload', 'owner');
  assert.deepEqual(h.writes, []);
  assert.equal(h.records.get(`realityCaptures/${id}`).status, 'approved');
});

test('public exterior viewer can fetch only the approved derivative, not originals', async (t) => {
  const h = harness(t);
  assert.equal((await h.call('getRealityCaptureAssetAccess', 'visitor', { assetKind: 'original', path: photoPath })).code, 403);
  assert.deepEqual(h.reads, []);
  const res = await h.call('getRealityCaptureAssetAccess', 'visitor');
  assert.equal(res.code, 200);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(h.reads, [modelPath]);
});

test('owner can fetch original but cannot use original permission as arbitrary path access', async (t) => {
  const h = harness(t);
  assert.equal((await h.call('getRealityCaptureAssetAccess', 'owner', { assetKind: 'original', path: photoPath })).code, 200);
  for (const path of [modelPath, `${prefix}originals/../processed/a.glb`, `${prefix}originals/nested/a.jpg`, photoPath.replace('/owner/', '/other/')]) {
    assert.equal((await h.call('getRealityCaptureAssetAccess', 'owner', { assetKind: 'original', path })).code, 403);
  }
  assert.equal((await h.call('getRealityCaptureAssetAccess', 'owner', { assetKind: 'unknown' })).code, 403);
  assert.deepEqual(h.reads, [photoPath]);
});

test('private exterior and unapproved exterior cannot be fetched by a viewer', async (t) => {
  for (const patch of [{ status: 'review_required' }, { publicContributionRequested: false }]) {
    const h = harness(t, { ...base, ...patch });
    assert.equal((await h.call('getRealityCaptureAssetAccess', 'visitor')).code, 403);
    assert.deepEqual(h.reads, []);
  }
});

test('interior sharing is limited to the currently approved room derivative', async (t) => {
  const h = harness(t, { ...base, captureKind: 'interior_room', spaceId: 'room' }, {
    'privateSpaces/room': { captureId: id, ownerUid: 'owner', accessMode: 'GUEST_LIST' },
    'privateSpaces/room/members/guest': { uid: 'guest', role: 'guest', active: true }
  });
  assert.equal((await h.call('getRealityCaptureAssetAccess', 'guest', { assetKind: 'original', path: photoPath })).code, 403);
  assert.equal((await h.call('getRealityCaptureAssetAccess', 'stranger')).code, 403);
  assert.equal((await h.call('getRealityCaptureAssetAccess', 'guest')).code, 200);
  h.mutate('privateSpaces/room', { captureId: 'replacement' });
  assert.equal((await h.call('getRealityCaptureAssetAccess', 'guest')).code, 403);
  h.mutate('privateSpaces/room', { captureId: id });
  h.mutate(`realityCaptures/${id}`, { status: 'processing' });
  assert.equal((await h.call('getRealityCaptureAssetAccess', 'guest')).code, 403);
  assert.deepEqual(h.reads, [modelPath]);
});

test('processed manifest cannot point to raw photos even for owner', async (t) => {
  const h = harness(t, { ...base, processed: { optimizedModelPath: photoPath } });
  assert.equal((await h.call('getRealityCaptureAssetAccess', 'owner')).code, 403);
  assert.deepEqual(h.reads, []);
});
