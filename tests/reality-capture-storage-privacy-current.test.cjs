'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sealCapturePhoto}=require('../functions/reality-capture-storage-privacy');
test('revoke bearer tokens with both preconditions, preserving object generation',async()=>{
  const before={generation:'100',metageneration:'7',metadata:{firebaseStorageDownloadTokens:'private-test-token',ownerUid:'owner'}};
  const file={setMetadata:async(patch,options)=>{assert.deepEqual(options,{ifGenerationMatch:'100',ifMetagenerationMatch:'7'});assert.deepEqual(patch.metadata,{firebaseStorageDownloadTokens:null});},getMetadata:async()=>[{...before,metadata:{ownerUid:'owner'}}]};
  assert.equal(await sealCapturePhoto(file,before),true);
});
test('already sealed objects are a read-only no-op',async()=>{assert.equal(await sealCapturePhoto({}, {metadata:{}}),false);});
test('fail closed if token removal or immutable version verification fails',async()=>{
  const metadata={generation:'100',metageneration:'7',metadata:{firebaseStorageDownloadTokens:'private-test-token'}};
  await assert.rejects(sealCapturePhoto({setMetadata:async()=>{},getMetadata:async()=>[metadata]},metadata),/sealing_failed/);
  await assert.rejects(sealCapturePhoto({}, {...metadata,metageneration:undefined}),/version_required/);
  await assert.rejects(sealCapturePhoto({setMetadata:async()=>{throw Error('precondition failed');}},metadata),/precondition/);
});
