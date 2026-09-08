// Bounded live persistence/authorization check. One synthetic photo and a CPU
// derivative, never GPU work or public approval. Disposable fixture is removed.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';
const production=process.env.WE3D_VERIFY_PRODUCTION==='1';
const origin=production?'https://worldexplorer3d.io':'https://we3d-staging-20260712.web.app';
if(production&&process.env.WE3D_CAPTURE_AUTOMATION_ATTESTATION==='1')throw Error('Production must use real App Check, never a debug bypass');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(20000);
let account,config,captureId,deleted=false;
let attestation;
try{
  if(process.env.WE3D_CAPTURE_AUTOMATION_ATTESTATION==='1'){
    attestation=await stagingCaptureAttestation();
    await page.addInitScript(token=>{self.FIREBASE_APPCHECK_DEBUG_TOKEN=token;},attestation.token);
  }
  await page.goto(origin+'/app/capture.html');await page.locator('#googleSignIn').waitFor({state:'visible'});
  config=await page.evaluate(()=>globalThis.WORLD_EXPLORER_FIREBASE);assert.equal(config.projectId,production?'worldexplorer3d-d9b83':'we3d-staging-20260712');
  const email=`hybrid-smoke-${Date.now()}@example.test`,password=randomBytes(24).toString('base64url');
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});account=await response.json();assert.ok(response.ok,account.error?.message);
  await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill(password);await page.locator('#emailSignIn button').click();await page.locator('#phoneCaptures').waitFor({state:'visible'});
  const admitted=await page.evaluate(async()=>{
    const api=await import('/js/community-reality-capture-api.js?v=4');
    return api.createRealityCaptureDraft({captureKind:'exterior',publicContributionRequested:false,building:{sourceBuildingId:'osm:way:hybrid-fixture',worldId:'capture-benchmark-only',sourceAuthority:'osm',label:'Private hybrid API fixture — not a mapped house',lat:0,lon:0,spatialContext:{schemaVersion:1,frame:'building-local-x-east-y-up-z-south',footprint:[{x:-10,z:-5},{x:10,z:-5},{x:10,z:5},{x:-10,z:5}]}}});
  });captureId=admitted.capture.captureId;
  const result=await page.evaluate(async id=>{
    const api=await import('/js/community-reality-capture-api.js?v=4'),original=await api.getMyRealityCapture(id);
    const preview={baseRevision:0,footprintSignature:original.capture.footprintSignature,heightMeters:6,roofShape:'gabled',roofRiseMeters:2,patches:[]};
    const saved=await api.saveRealityCaptureHybridPreview(id,preview);
    let conflict=false;try{await api.saveRealityCaptureHybridPreview(id,preview);}catch{conflict=true;}
    const restored=await api.getMyRealityCapture(id);
    return {revision:saved.preview.revision,restoredRevision:restored.capture.hybridPreview.revision,private:restored.capture.hybridPreview.visibility,conflict,status:restored.capture.status,photos:restored.photos.length};
  },captureId);
  assert.deepEqual(result,{revision:1,restoredRevision:1,private:'PRIVATE',conflict:true,status:'draft',photos:0});
  await page.reload();await page.locator('#phoneCaptures').waitFor({state:'visible'});
  const afterReload=await page.evaluate(async id=>(await(await import('/js/community-reality-capture-api.js?v=4')).getMyRealityCapture(id)).capture.hybridPreview.revision,captureId);assert.equal(afterReload,1);
  const manual=await page.evaluate(async id=>{
    const api=await import('/js/community-reality-capture-api.js?v=4');
    const c=document.createElement('canvas');c.width=1280;c.height=720;
    const ctx=c.getContext('2d');ctx.fillStyle='#9e7153';ctx.fillRect(0,0,c.width,c.height);
    const photo=await api.normalizeCapturePhoto(await new Promise(resolve=>c.toBlob(resolve,'image/jpeg')));
    const capture=(await api.getMyRealityCapture(id)).capture;
    await api.uploadRealityCapturePhoto(capture,photo);
    const finalized=await api.finalizeRealityCaptureUpload(id);
    const uploaded=await api.getMyRealityCapture(id);
    const preview={...uploaded.capture.hybridPreview,baseRevision:1,patches:[{id:'fixture-wall',wall:0,photoId:photo.id,region:[0,0,1,1],quad:[[0,0],[1,0],[1,1],[0,1]]}]};
    const saved=await api.saveRealityCaptureHybridPreview(id,preview);
    const submitted=await api.submitRealityCaptureHybrid(id,saved.preview.revision,true);
    let paidDenied=false,roomDenied=false;
    try{await api.retryRealityCapture(id);}catch(e){paidDenied=e.status===403;}
    try{await api.createRealityCaptureDraft({captureKind:'interior_room'});}catch(e){roomDenied=e.status===403;}
    return {uploadStatus:finalized.status,photoCount:uploaded.photos.length,revision:saved.preview.revision,submissionStatus:submitted.status,paidDenied,roomDenied};
  },captureId);
  assert.deepEqual(manual,{uploadStatus:'uploaded',photoCount:1,revision:2,submissionStatus:'review_required',paidDenied:true,roomDenied:true});
  await page.evaluate(async id=>(await import('/js/community-reality-capture-api.js?v=4')).deleteRealityCapture(id),captureId);deleted=true;
  await mkdir('output/verification/reality-capture-hybrid',{recursive:true});await writeFile(`output/verification/reality-capture-hybrid/${production?'production':'staging'}-report.json`,JSON.stringify({passed:true,origin,...result,afterReload,manual,fixtureDeleted:true,automationAttestation:!!attestation,limitations:'Synthetic photo with real upload/validation/CPU submission. No physical phone, public approval or world acceptance.'},null,2));console.log('Live manual photo upload, validation, save, CPU submission, cost gates and cleanup passed. No reconstruction launched.');
}finally{
  if(captureId&&!deleted)await page.evaluate(async id=>(await import('/js/community-reality-capture-api.js?v=4')).deleteRealityCapture(id),captureId).catch(()=>{});
  if(account?.idToken&&config)await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${config.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:account.idToken})});
  await browser.close();
  await attestation?.cleanup();
}
