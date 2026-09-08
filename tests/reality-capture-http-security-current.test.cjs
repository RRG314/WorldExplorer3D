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
  const fileRequests = [];
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
      set: async (patch) => { mutate(path, patch); writes.push(path); },
      delete: async () => { mutate(path,null); writes.push(path); } };
  }
  function collection(path) { return { doc: (name) => ref(`${path}/${name}`),
    where: (field, operator, value) => ({limit: count => ({query:{path,field,value,count}})}) }; }
  function mutate(path, patch) {
    function check(value, parentArray=false) {
      if(Array.isArray(value)) {
        if(parentArray)throw Error('Nested arrays are not allowed');
        value.forEach(v=>check(v,true));
      } else if(value && typeof value==='object')Object.values(value).forEach(v=>check(v,false));
    }
    check(patch);
    if (patch === null) records.delete(path);
    else records.set(path, { ...records.get(path), ...patch });
    versions.set(path, generation++);
  }
  const db = { collection, runTransaction: async (callback) => {
    hooks.beforeTransaction?.();
    const staged = [];
    await callback({ get: async (reference) => {
      if(reference.query){const q=reference.query;const docs=[...records].filter(([p,v])=>p.startsWith(q.path+'/')&&v[q.field]===q.value).slice(0,q.count).map(([p])=>snapshot(p));return {empty:docs.length===0,docs};}
      return snapshot(reference.path);
    },
      update: (reference, patch) => staged.push([reference.path, patch]),
      set: (reference, patch) => staged.push([reference.path, patch]) });
    for (const [path, patch] of staged) { mutate(path, patch); writes.push(path); }
  } };
  const bucket = {
    getFiles: async () => [[]],
    file: (path,options) => { reads.push(path);fileRequests.push({path,options}); return {
      exists: async () => [true], getSignedUrl: async () => ['https://example.invalid/private-test-url'],
      download: async () => [realJpeg],
      save: async (bytes,options) => { assert.equal(options.preconditionOpts.ifGenerationMatch,0); assert.equal(bytes.readUInt32LE(0),0x46546c67); },
      getMetadata: async () => [{generation:'123'}]
    }; }
  };
  const authClaims = {};
  const api = buildCommunityRealityCaptureExports({ db, bucket, setCors: () => false,
    logAdminActivity: async () => { if(hooks.activityFailure)throw Error('activity_unavailable'); },
    requireModerator: async req => req.uid === 'moderator' ? { auth: { uid: req.uid }, displayName: 'Moderator' } : null,
    verifyAuth: async (req) => ({ uid: req.uid, ...authClaims }), verifyAppCheck: async () => true });
  async function call(name, uid, body = {}) {
    const res = { headers: {}, status(code) { this.code = code; return this; },
      set(key, value) { this.headers[key] = value; return this; },
      json(value) { this.body = value; return this; } };
    await api[name]({ method: 'POST', uid, body: { captureId: id, ...body } }, res);
    return res;
  }
  return { call, bucket, records, reads, fileRequests, writes, mutate, hooks, authClaims };
}

test('pending edits cannot delete an earlier published representation',async t=>{
  const h=harness(t,{...base,status:'review_required'}, {'buildingRepresentations/published':{captureId:id,status:'approved'}});
  let touched=false;h.bucket.getFiles=async()=>{touched=true;return [[]];};
  assert.equal((await h.call('deleteRealityCapture','owner')).code,409);
  assert.equal(touched,false);assert.equal(h.writes.length,0);
});
test('deletion claims a tombstone before storage and safely retries a cleanup failure',async t=>{
  const h=harness(t,{...base,status:'uploaded'});
  h.bucket.getFiles=async()=>{assert.equal(h.records.get(`realityCaptures/${id}`).status,'deleting');throw Error('temporary_storage_failure');};
  assert.notEqual((await h.call('deleteRealityCapture','owner')).code,200);
  assert.equal(h.records.get(`realityCaptures/${id}`).status,'deleting');
  assert.equal((await h.call('moderateRealityCapture','moderator',{decision:'approved'})).code,409);
  h.bucket.getFiles=async()=>[[]];
  assert.equal((await h.call('deleteRealityCapture','owner')).code,200);
  assert.equal(h.records.has(`realityCaptures/${id}`),false);
});
test('approval winning before the deletion claim leaves storage untouched',async t=>{
  const h=harness(t,{...base,status:'review_required'});
  h.hooks.beforeTransaction=()=>h.mutate(`realityCaptures/${id}`,{status:'approved'});
  let touched=false;h.bucket.getFiles=async()=>{touched=true;return [[]];};
  assert.equal((await h.call('deleteRealityCapture','owner')).code,409);
  assert.equal(touched,false);
});
test('approval remains successful when secondary activity logging fails',async t=>{
  const h=harness(t,{...base,status:'review_required'});h.hooks.activityFailure=true;
  assert.equal((await h.call('moderateRealityCapture','moderator',{decision:'approved'})).code,200);
  assert.equal(h.records.get(`realityCaptures/${id}`).status,'approved');
});

test('public interior preference cannot bypass approval, and owners can make it private again',async t=>{
  const h=harness(t,base,{'privateSpaces/room':{ownerUid:'owner',captureId:id,accessMode:'PRIVATE'}});
  const body={spaceId:'room',action:'set_mode',accessMode:'PUBLIC'};
  assert.notEqual((await h.call('updatePrivateSpaceAccess','owner',body)).code,200);
  assert.equal(h.writes.length,0);
  h.mutate('privateSpaces/room',{publicApproval:{captureId:id}});
  assert.equal((await h.call('updatePrivateSpaceAccess','owner',body)).code,200);
  assert.equal(h.records.get('privateSpaces/room').accessMode,'PUBLIC');
  assert.equal((await h.call('updatePrivateSpaceAccess','owner',{...body,accessMode:'PRIVATE'})).code,200);
  assert.equal(h.records.get('privateSpaces/room').accessMode,'PRIVATE');
  const writes=h.writes.length;
  assert.notEqual((await h.call('updatePrivateSpaceAccess','visitor',body)).code,200);
  assert.equal(h.writes.length,writes);
});

test('one photo defaults to manual validation without admitting a GPU job',async t=>{
  const h=harness(t,{...base,status:'draft'});
  h.bucket.getFiles=async()=>[validPhotos().slice(0,1)];
  const result=await h.call('finalizeRealityCaptureUpload','owner');
  assert.equal(result.code,200);
  const stored=h.records.get(`realityCaptures/${id}`);
  assert.equal(stored.status,'uploaded');assert.equal(stored.inputManifest.length,1);
  assert.equal(stored.queuedAt,undefined);
});

test('processed asset delivery pins the inspected generation, not the latest path',async t=>{
  const h=harness(t,{...base,processed:{...base.processed,modelGeneration:'12345',sha256:'a'.repeat(64)}});
  const result=await h.call('getRealityCaptureAssetAccess','owner');
  assert.equal(result.code,200);
  assert.deepEqual(h.fileRequests.at(-1),{path:modelPath,options:{generation:'12345'}});
});

test('hybrid preview HTTP save is owner-only, revision-checked and cannot publish or change geometry',async t=>{
  const {footprintSignature}=require('../functions/reality-capture-hybrid');
  const building={sourceAuthority:'osm',sourceBuildingId:'osm:way:1',spatialContext:{footprint:[{x:0,z:0},{x:10,z:0},{x:10,z:8},{x:0,z:8}]}};
  const h=harness(t,{...base,building,inputManifest:[{name:photoPath,generation:'1'}]});
  const preview={baseRevision:0,footprintSignature:footprintSignature(building),heightMeters:6,patches:[{id:'one',photoId:'a'.repeat(32),wall:0,region:[0,0,1,1],quad:[[0,0],[1,0],[1,1],[0,1]]}],visibility:'PUBLIC'};
  assert.equal((await h.call('saveRealityCaptureHybridPreview','visitor',{preview})).code,404);assert.equal(h.writes.length,0);
  assert.equal((await h.call('saveRealityCaptureHybridPreview','owner',{preview})).code,200);
  const saved=h.records.get(`realityCaptures/${id}`);assert.equal(saved.hybridPreview.visibility,'PRIVATE');assert.deepEqual(saved.building,building);assert.deepEqual(saved.processed,base.processed);assert.equal(saved.status,'approved');
  assert.equal((await h.call('saveRealityCaptureHybridPreview','owner',{preview})).code,409);assert.equal(h.writes.length,1);
  assert.equal((await h.call('saveRealityCaptureHybridPreview','owner',{preview:{...preview,baseRevision:1}})).code,200);assert.equal(h.records.get(`realityCaptures/${id}`).hybridHistory.length,1);
});

test('only a development-authorized owner can retry a failed validated capture', async t => {
  const h = harness(t, { ...base, status: 'processing_failed', inputManifest: [{ name: photoPath, generation: '1' }] });
  assert.equal((await h.call('retryRealityCapture', 'owner', {realityCaptureReconstruction:true})).code,403);
  assert.equal(h.writes.length,0);
  h.authClaims.realityCaptureReconstruction=true;
  assert.equal((await h.call('retryRealityCapture', 'visitor')).code, 404);
  assert.equal((await h.call('retryRealityCapture', 'owner')).body.status, 'queued');
  assert.equal(h.writes.length, 1);
  assert.equal((await h.call('retryRealityCapture', 'owner')).code, 409);
  assert.equal(h.reads.length, 0);
  const empty = harness(t, { ...base, status: 'processing_failed' });
  empty.authClaims.realityCaptureReconstruction=true;
  assert.equal((await empty.call('retryRealityCapture', 'owner')).code, 422);
  assert.equal(empty.writes.length, 0);
});

test('saved cropped walls submit immutable derivatives and require the reviewed revision for approval',async t=>{
  const {footprintSignature}=require('../functions/reality-capture-hybrid');
  const building={sourceAuthority:'osm',sourceBuildingId:'osm:way:1',worldId:'earth:test',spatialContext:{footprint:[{x:0,z:0},{x:10,z:0},{x:10,z:8},{x:0,z:8}]}};
  const h=harness(t,{...base,captureId:id,status:'review_required',captureSchemaVersion:1,processingPipelineVersion:'test',building,inputManifest:[{name:photoPath,generation:'1',size:realJpeg.length,sha256:require('node:crypto').createHash('sha256').update(realJpeg).digest('hex')}]});
  const preview={baseRevision:0,footprintSignature:footprintSignature(building),heightMeters:6,patches:[{id:'one',photoId:'a'.repeat(32),wall:0,region:[0,0,1,1],quad:[[0,0],[1,0],[1,1],[0,1]]}]};
  assert.equal((await h.call('saveRealityCaptureHybridPreview','owner',{preview})).code,200);
  assert.equal((await h.call('submitRealityCaptureHybrid','visitor',{revision:1,consent:true})).code,404);
  assert.equal((await h.call('submitRealityCaptureHybrid','owner',{revision:1,consent:false})).code,403);
  assert.equal((await h.call('submitRealityCaptureHybrid','owner',{revision:2,consent:true})).code,409);
  const submitted=await h.call('submitRealityCaptureHybrid','owner',{revision:1,consent:true});assert.equal(submitted.code,200,JSON.stringify(submitted.body));
  assert.equal(h.records.get(`realityCaptures/${id}`).hybridSubmission.status,'review_required');
  assert.equal((await h.call('submitRealityCaptureHybrid','owner',{revision:1,consent:true})).body.existing,true);
  assert.equal((await h.call('moderateRealityCapture','moderator',{decision:'approved',revision:2})).code,409);
  const approved=await h.call('moderateRealityCapture','moderator',{decision:'approved',revision:1});assert.equal(approved.code,200,JSON.stringify(approved.body));
  assert.equal(h.records.get(`realityCaptures/${id}`).hybridSubmission.status,'approved');
  const representation=[...h.records].find(([key])=>key.startsWith('buildingRepresentations/'))?.[1];
  assert.equal(representation.representationKind,'facade-patches');assert.equal(representation.modelGeneration,'123');assert.equal(representation.canonicalBuilding.sourceBuildingId,building.sourceBuildingId);
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
  assert.deepEqual(result.body.photos, [{ id: 'a'.repeat(32), path: photoPath, sector: 2 }]);
  assert.deepEqual(h.reads, []);
});

test('owned valid set queues atomically and repeat finalization cannot regress it', async (t) => {
  const h = harness(t, { ...base, status: 'draft' });
  h.bucket.getFiles = async () => [validPhotos()];
  assert.equal((await h.call('finalizeRealityCaptureUpload', 'owner', {mode:'reconstruction'})).code,403);
  assert.equal(h.writes.length,0);
  h.authClaims.realityCaptureReconstruction=true;
  assert.equal((await h.call('finalizeRealityCaptureUpload', 'owner', {mode:'reconstruction'})).code, 200);
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
