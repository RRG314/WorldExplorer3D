// Bounded live persistence/authorization check. No photo upload, GPU queue, owner
// account alteration, or public representation. Disposable fixture is removed.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const origin='https://we3d-staging-20260712.web.app';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(20000);
let account,config,captureId,deleted=false;
try{
  await page.goto(origin+'/app/capture.html');await page.locator('#googleSignIn').waitFor({state:'visible'});
  config=await page.evaluate(()=>globalThis.WORLD_EXPLORER_FIREBASE);assert.equal(config.projectId,'we3d-staging-20260712');
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
  await page.evaluate(async id=>(await import('/js/community-reality-capture-api.js?v=4')).deleteRealityCapture(id),captureId);deleted=true;
  await mkdir('output/verification/reality-capture-hybrid',{recursive:true});await writeFile('output/verification/reality-capture-hybrid/staging-report.json',JSON.stringify({passed:true,...result,afterReload,fixtureDeleted:true,limitations:'Empty-shell live API test; actual owner-photo projection tested locally. No physical phone or public world acceptance.'},null,2));console.log('Live staging hybrid save, conflict, authenticated reload and cleanup passed. No reconstruction launched.');
}finally{
  if(captureId&&!deleted)await page.evaluate(async id=>(await import('/js/community-reality-capture-api.js?v=4')).deleteRealityCapture(id),captureId).catch(()=>{});
  if(account?.idToken&&config)await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${config.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:account.idToken})});
  await browser.close();
}
