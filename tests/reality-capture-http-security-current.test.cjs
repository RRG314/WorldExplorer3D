'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const sharp = require('../functions/node_modules/sharp');
const { buildCommunityRealityCaptureExports } = require('../functions/community-reality-capture.js');
let realJpeg;
test.before(async () => { realJpeg = await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#8aa8b7' } }).jpeg().toBuffer(); });

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
  const hooks = {};
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
    hooks.beforeTransaction?.();
    const staged = [];
    await callback({ get: async (reference) => snapshot(reference.path),
      update: (reference, patch) => staged.push([reference.path, patch]),
      set: (reference, patch) => staged.push([reference.path, patch]) });
    for (const [path, patch] of staged) { mutate(path, patch); writes.push(path); }
  } };
  const bucket = {
    getFiles: async () => [[]],
    file: (path) => { reads.push(path); return {
      exists: async () => [true], getSignedUrl: async () => ['https://example.invalid/private-test-url'],
      download: async () => [realJpeg]
    }; }
  };
  const api = buildCommunityRealityCaptureExports({ db, bucket, setCors: () => false,
    requireModerator: async req => req.uid === 'moderator' ? { auth: { uid: req.uid }, displayName: 'Moderator' } : null,
    verifyAuth: async (req) => ({ uid: req.uid }), verifyAppCheck: async () => true });
  async function call(name, uid, body = {}) {
    const res = { headers: {}, status(code) { this.code = code; return this; },
      set(key, value) { this.headers[key] = value; return this; },
      json(value) { this.body = value; return this; } };
    await api[name]({ method: 'POST', uid, body: { captureId: id, ...body } }, res);
    return res;
  }
  return { call, bucket, records, reads, writes, mutate, hooks };
}

test('only the owner can retry a failed, validated capture without another upload', async t => {
  const h = harness(t, { ...base, status: 'processing_failed', inputManifest: [{ name: photoPath, generation: '1' }] });
  assert.equal((await h.call('retryRealityCapture', 'visitor')).code, 404);
  assert.equal((await h.call('retryRealityCapture', 'owner')).body.status, 'queued');
  assert.equal(h.writes.length, 1);
  assert.equal((await h.call('retryRealityCapture', 'owner')).code, 409);
  assert.equal(h.reads.length, 0);
  const empty = harness(t, { ...base, status: 'processing_failed' });
  assert.equal((await empty.call('retryRealityCapture', 'owner')).code, 422);
  assert.equal(empty.writes.length, 0);
});

test('moderation commits approval and representation together, never revives deleted captures', async t => {
  const capture = { ...base, status: 'review_required', building: { sourceBuildingId: 'osm:42', worldId: 'earth' } };
  const ok = harness(t, capture);
  assert.equal((await ok.call('moderateRealityCapture', 'moderator', { decision: 'approved' })).code, 200);
  assert.equal(ok.writes.length, 2);
  for (const mutation of [null, { status: 'rejected' }, { label: 'changed while reviewing' }]) {
    const h = harness(t, capture);
    h.hooks.beforeTransaction = () => h.mutate(`realityCaptures/${id}`, mutation);
    assert.equal((await h.call('moderateRealityCapture', 'moderator', { decision: 'approved' })).code, 409);
    assert.equal(h.writes.length, 0);
  }
});

test('a facade candidate cannot accidentally replace the entire mapped exterior', async t => {
  const h = harness(t, { ...base, exteriorScope: 'facade', status: 'review_required', building: { sourceBuildingId: 'osm:42', worldId: 'earth' } });
  const result = await h.call('moderateRealityCapture', 'moderator', { decision: 'approved' });
  assert.equal(result.code, 422);
  assert.equal(result.body.error, 'facade patch registration required');
  assert.equal(h.writes.length, 0);
});

test('an older room review cannot replace a newer pending capture', async t => {
  const capture = { ...base, captureKind: 'interior_room', status: 'review_required', spaceId: 'room' };
  const h = harness(t, capture, { 'privateSpaces/room': { ownerUid: 'owner', pendingCaptureId: 'newer-capture' } });
  assert.equal((await h.call('moderateRealityCapture', 'moderator', { decision: 'approved' })).code, 409);
  assert.equal(h.writes.length, 0);
  h.mutate('privateSpaces/room', { pendingCaptureId: id });
  assert.equal((await h.call('moderateRealityCapture', 'moderator', { decision: 'approved' })).code, 200);
  assert.equal(h.records.get('privateSpaces/room').captureId, id);
});

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
    getMetadata: async () => [{ generation: '1234', size: realJpeg.length, contentType: 'image/jpeg', metadata: { width: 1920, height: 1080 } }] }));
}

test('phone handoff returns the same owned capture and uploaded photo IDs, never media URLs', async (t) => {
  const h = harness(t, { ...base, status: 'draft', building: { sourceBuildingId: 'osm:way:42' } });
  h.bucket.getFiles = async (options) => {
    assert.equal(options.prefix, `${prefix}originals/`);
    assert.equal(options.autoPaginate, false);
    return [validPhotos()];
  };
  const response = await h.call('getMyRealityCapture', 'owner');
  assert.equal(response.code, 200);
  assert.equal(response.body.capture.captureId, id);
  assert.equal(response.body.capture.ownerUid, 'owner');
  assert.equal(response.body.photos.length, 20);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(Object.keys(response.body.photos[0]).sort(), ['id', 'sector']);
  assert.deepEqual(h.writes, []);
});

test('possession of handoff link does not grant access or enumerate another owner photos', async (t) => {
  const h = harness(t);
  h.bucket.getFiles = async () => { throw Error('Storage must not be read'); };
  assert.equal((await h.call('getMyRealityCapture', 'visitor')).code, 404);
  assert.equal((await h.call('getMyRealityCapture', 'owner', { captureId: '../secret' })).code, 422);
  assert.deepEqual(h.writes, []);
});

test('processing progress uses frozen photo manifest without per-photo storage reads', async t => {
  const h = harness(t, { ...base, status: 'processing', inputManifest: [{ name: photoPath, generation: '1', sector: 2 }] });
  h.bucket.getFiles = async () => { throw Error('Submitted inputs must not be relisted'); };
  const result = await h.call('getMyRealityCapture', 'owner');
  assert.equal(result.code, 200);
  assert.deepEqual(result.body.photos, [{ id: 'a'.repeat(32), sector: 2 }]);
  assert.deepEqual(h.reads, []);
});

test('owned valid set queues atomically and repeat finalization cannot regress it', async (t) => {
  const h = harness(t, { ...base, status: 'draft' });
  h.bucket.getFiles = async () => [validPhotos()];
  assert.equal((await h.call('finalizeRealityCaptureUpload', 'owner')).code, 200);
  const capture = h.records.get(`realityCaptures/${id}`);
  assert.equal(capture.status, 'queued');
  assert.equal(capture.uploadSummary.photoCount, 20);
  assert.equal(capture.inputManifest[0].generation, '1234');
  assert.equal(capture.inputManifest[0].width, 1280, 'decoded pixels override untrusted metadata');
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
