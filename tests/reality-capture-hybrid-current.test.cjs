const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeHybridPreview,footprintSignature}=require('../functions/reality-capture-hybrid');
const {encodeHybridPreview,decodeHybridPreview}=require('../functions/reality-capture-hybrid');
const photoId='a'.repeat(32);
const capture={captureId:'capture',ownerUid:'owner',captureKind:'exterior',building:{sourceAuthority:'osm',sourceBuildingId:'osm:way:1',spatialContext:{footprint:[{x:0,z:0},{x:10,z:0},{x:10,z:8},{x:0,z:8}]}},inputManifest:[{name:`reality-captures/owner/capture/originals/${photoId}.jpg`,generation:'123'}]};
const input=()=>({footprintSignature:footprintSignature(capture.building),baseRevision:0,heightMeters:6,patches:[{id:'patch-1',photoId,wall:0,region:[0,0,.5,1],quad:[[.1,.1],[.9,.2],[.8,.9],[.2,.8]]}]});
test('nonempty photo crops round-trip through Firestore-safe named points',()=>{
  const preview=normalizeHybridPreview(capture,input());
  const stored=encodeHybridPreview(preview);
  assert.deepEqual(stored.patches[0].quad[0],{x:.1,y:.1});
  assert.deepEqual(decodeHybridPreview(JSON.parse(JSON.stringify(stored))),preview);
  assert.deepEqual(encodeHybridPreview(stored),stored);
  assert.deepEqual(decodeHybridPreview(preview),preview);
});
test('hybrid save pins photo generation, isolates evidence, and leaves canonical geometry unchanged',()=>{
  const before=structuredClone(capture);const saved=normalizeHybridPreview(capture,input());
  assert.equal(saved.visibility,'PRIVATE');assert.equal(saved.coverageVerified,false);assert.equal(saved.patches[0].photoGeneration,'123');assert.equal(saved.revision,1);assert.deepEqual(capture,before);
});
test('reject stale revisions, other building footprints, foreign photos and malformed or crossing patches',()=>{
  for(const change of [{baseRevision:1},{footprintSignature:'another-building'},{heightMeters:NaN},{heightMeters:0},{patches:[{...input().patches[0],photoId:'b'.repeat(32)}]},{patches:[{...input().patches[0],wall:4}]},{patches:[{...input().patches[0],region:[0,0,2,1]}]},{patches:[{...input().patches[0],quad:[[0,0],[1,1],[1,0],[0,1]]}]}]) assert.throws(()=>normalizeHybridPreview(capture,{...input(),...change}));
});
test('two wall contributions coexist and a new revision can improve one without losing the other',()=>{
  const first=input();first.patches.push({...first.patches[0],id:'patch-2',wall:1});
  const saved=normalizeHybridPreview(capture,first);const update={...saved,baseRevision:1};update.patches[0].region=[0,0,.7,1];
  const next=normalizeHybridPreview({...capture,hybridPreview:saved},update);assert.equal(next.revision,2);assert.equal(next.patches.length,2);assert.equal(next.patches[1].wall,1);
});
test('planar homography maps four corners exactly and rejects bow-tie geometry',async()=>{
  const {photoHomography,projectPhoto,wallFootprint}=await import('../app/js/reality-capture/hybrid-geometry.js');
  const q=input().patches[0].quad,h=photoHomography(q);
  [[0,0],[1,0],[1,1],[0,1]].forEach((p,i)=>projectPhoto(h,...p).forEach((v,j)=>assert.ok(Math.abs(v-q[i][j])<1e-8)));
  assert.throws(()=>photoHomography([[0,0],[1,1],[1,0],[0,1]]));assert.equal(wallFootprint(capture.building).length,4);
});
