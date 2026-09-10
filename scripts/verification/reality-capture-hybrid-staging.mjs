// Bounded live persistence/authorization check. One synthetic photo and a CPU
// derivative, never GPU work or public approval. Disposable fixture is removed.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';
import {makeStarterLayout,layoutRoomDescriptor} from '../../functions/interior-layout.mjs';
const production=process.env.WE3D_VERIFY_PRODUCTION==='1';
if(production)throw Error('Capture acceptance tests must never use production. Use staging.');
const home=process.env.WE3D_VERIFY_HOME_LAYOUT==='1';
if(home&&production)throw Error('Home layout acceptance is staging-only.');
const homeLayout=home?makeStarterLayout({footprint:[{x:-10,z:-5},{x:10,z:-5},{x:10,z:5},{x:-10,z:5}],heightMeters:6},{floorCount:2}):null;
const origin=production?'https://worldexplorer3d.io':'https://we3d-staging-20260712.web.app';
if(production&&process.env.WE3D_CAPTURE_AUTOMATION_ATTESTATION==='1')throw Error('Production must use real App Check, never a debug bypass');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(20000);
let account,config,captureId,deleted=false;
let attestation;
try{
  {
    attestation=await stagingCaptureAttestation();
    await page.addInitScript(token=>{self.FIREBASE_APPCHECK_DEBUG_TOKEN=token;},attestation.token);
  }
  await page.goto(origin+'/app/capture.html');await page.locator('#googleSignIn').waitFor({state:'visible'});
  config=await page.evaluate(()=>globalThis.WORLD_EXPLORER_FIREBASE);assert.equal(config.projectId,production?'worldexplorer3d-d9b83':'we3d-staging-20260712');
  assert.equal(await page.evaluate(async()=>!!(await(await import('/js/firebase-init.js?v=57')).getFirebaseAppCheckToken())),true,'Registered staging automation identity must obtain an App Check token before creating test records');
  const email=`hybrid-smoke-${Date.now()}@example.test`,password=randomBytes(24).toString('base64url');
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});account=await response.json();assert.ok(response.ok,account.error?.message);
  await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill(password);await page.locator('#emailSignIn button').click();await page.locator('#phoneCaptures').waitFor({state:'visible'});
  const admitted=await page.evaluate(async home=>{
    const api=await import('/js/community-reality-capture-api.js?v=4');
    return api.createRealityCaptureDraft({captureKind:home?'interior_room':'exterior',permissionConfirmed:home,room:home?{label:'Home test',widthMeters:20,lengthMeters:10,heightMeters:2.7}:undefined,publicContributionRequested:false,building:{sourceBuildingId:'osm:way:hybrid-fixture',worldId:'capture-benchmark-only',sourceAuthority:'osm',label:'Private hybrid API fixture — not a mapped house',lat:0,lon:0,spatialContext:{schemaVersion:1,frame:'building-local-x-east-y-up-z-south',height:{meters:6,evidence:'user-test'},wallHeightMeters:6,footprint:[{x:-10,z:-5},{x:10,z:-5},{x:10,z:5},{x:-10,z:5}]}}});
  },home);captureId=admitted.capture.captureId;
  const result=await page.evaluate(async ({id,homeLayout})=>{
    const api=await import('/js/community-reality-capture-api.js?v=4'),original=await api.getMyRealityCapture(id);
    const preview={baseRevision:0,footprintSignature:original.capture.footprintSignature,...(homeLayout?{layout:homeLayout,roomPhotos:[]}:{heightMeters:6,roofShape:'gabled',roofRiseMeters:2,patches:[]})};
    const saved=await api.saveRealityCaptureHybridPreview(id,preview);
    let conflict=false;try{await api.saveRealityCaptureHybridPreview(id,preview);}catch{conflict=true;}
    const restored=await api.getMyRealityCapture(id);
    return {revision:saved.preview.revision,restoredRevision:restored.capture.hybridPreview.revision,private:restored.capture.hybridPreview.visibility,conflict,status:restored.capture.status,photos:restored.photos.length};
  },{id:captureId,homeLayout});
  assert.deepEqual(result,{revision:1,restoredRevision:1,private:'PRIVATE',conflict:true,status:'draft',photos:0});
  await page.reload();await page.locator('#phoneCaptures').waitFor({state:'visible'});
  await page.locator('#captureList button').filter({hasText:'Private hybrid API fixture'}).click();
  await page.locator('#realityCapturePanel.show').waitFor();
  await mkdir('output/verification/reality-capture-hybrid',{recursive:true});
  await page.screenshot({path:`output/verification/reality-capture-hybrid/${home?'home':'exterior'}-staging-open.png`,fullPage:true});
  await page.locator('[data-capture-close]').click();
  const afterReload=await page.evaluate(async id=>(await(await import('/js/community-reality-capture-api.js?v=4')).getMyRealityCapture(id)).capture.hybridPreview.revision,captureId);assert.equal(afterReload,1);
  const surface=home?layoutRoomDescriptor(homeLayout,homeLayout.floors[0].rooms[0].id).surfaceIds[0]:null;
  const manual=await page.evaluate(async ({id,home,surface})=>{
    const api=await import('/js/community-reality-capture-api.js?v=4');
    const c=document.createElement('canvas');c.width=1280;c.height=720;
    const ctx=c.getContext('2d');ctx.fillStyle='#9e7153';ctx.fillRect(0,0,c.width,c.height);
    const photo=await api.normalizeCapturePhoto(await new Promise(resolve=>c.toBlob(resolve,'image/jpeg')));
    const capture=(await api.getMyRealityCapture(id)).capture;
    await api.uploadRealityCapturePhoto(capture,photo);
    const finalized=await api.finalizeRealityCaptureUpload(id,'manual');
    // Add a second photo after manual validation, preserving the same capture
    // and saved layout. This used to force users into disconnected new records.
    ctx.fillStyle='#335577';ctx.fillRect(0,0,c.width,c.height);
    const second=await api.normalizeCapturePhoto(await new Promise(resolve=>c.toBlob(resolve,'image/jpeg')));
    await api.uploadRealityCapturePhoto((await api.getMyRealityCapture(id)).capture,second);
    await api.finalizeRealityCaptureUpload(id,'manual');
    const uploaded=await api.getMyRealityCapture(id);
    const patch={id:'fixture-wall',wall:0,photoId:photo.id,region:[0,0,1,1],quad:[[0,0],[1,0],[1,1],[0,1]]};
    const preview={...uploaded.capture.hybridPreview,baseRevision:1,...(home?{roomPhotos:[{roomId:uploaded.capture.hybridPreview.layout.floors[0].rooms[0].id,patches:[{...patch,surfaceId:surface}]}]}:{patches:[patch]})};
    const saved=await api.saveRealityCaptureHybridPreview(id,preview);
    const submitted=await api.submitRealityCaptureHybrid(id,saved.preview.revision,true,!home);
    let paidDenied=false,roomDenied=false;
    try{await api.retryRealityCapture(id);}catch(e){paidDenied=e.status===403;}
    try{await api.createRealityCaptureDraft({captureKind:'interior_room',building:capture.building});}catch(e){roomDenied=e.status===403;}
    return {uploadStatus:finalized.status,photoCount:uploaded.photos.length,revision:saved.preview.revision,submissionStatus:submitted.status,paidDenied,roomDenied};
  },{id:captureId,home,surface});
  assert.deepEqual(manual,{uploadStatus:'uploaded',photoCount:2,revision:2,submissionStatus:'review_required',paidDenied:true,roomDenied:true});
  if(home){const resolved=await page.evaluate(async id=>{const api=await import('/js/community-reality-capture-api.js?v=4'),capture=(await api.getMyRealityCapture(id)).capture;const value=await api.resolveBuildingInteriorRepresentation(capture.building.sourceBuildingId,capture.building.worldId,'');return {authorized:value.authorized,available:value.available,kind:value.representationKind,floors:value.layout?.floors?.length,publicRequested:capture.publicContributionRequested,model:!!value.model?.url};},captureId);assert.equal(resolved.authorized,true);assert.equal(resolved.kind,'home-layout');assert.equal(resolved.floors,2);assert.equal(resolved.publicRequested,false);assert.equal(resolved.model,true);}
  if(home){
    // Reopen through the visible account action: assigning the same hash after
    // closing a dialog does not emit hashchange and is not a real user action.
    await page.locator('#captureList button').filter({hasText:'Private hybrid API fixture'}).click();
    await page.locator('[data-capture-hybrid]').click();
    const editor=page.locator('.homeLayoutEditor');await editor.waitFor();
    await editor.locator('[data-name]').fill('My saved test room');await editor.locator('[data-name]').dispatchEvent('change');
    await editor.locator('[data-save]').click();await editor.locator('[data-status]').filter({hasText:'Saved to account · revision 3'}).waitFor();
    await editor.locator('[data-refresh-photos]').click();await editor.locator('[data-status]').filter({hasText:'2 photos available'}).waitFor();
    await editor.locator('[data-link-phone]').click();await editor.locator('[data-home-handoff]').waitFor();
    assert.equal(await editor.locator('[data-home-link]').getAttribute('href'),`${origin}/app/capture.html#capture=${captureId}`);
    assert.equal(await editor.locator('[data-home-qr]').evaluate(canvas=>canvas.width>0&&canvas.height>0),true);
    await editor.locator('[data-inside]').click();await editor.locator('[data-viewer] canvas').waitFor();
    await mkdir('output/verification/reality-capture-hybrid',{recursive:true});await page.screenshot({path:'output/verification/reality-capture-hybrid/home-staging-phone.png',fullPage:true});
    await page.reload();await page.locator('[data-capture-hybrid]').click();await page.locator('.homeLayoutEditor').waitFor();
    assert.equal(await page.locator('.homeLayoutEditor [data-name]').inputValue(),'My saved test room');
    await page.locator('.homeLayoutEditor [data-close]').click();await page.locator('[data-capture-close]').click();
  }
  await page.evaluate(async id=>(await import('/js/community-reality-capture-api.js?v=4')).deleteRealityCapture(id),captureId);deleted=true;
  await mkdir('output/verification/reality-capture-hybrid',{recursive:true});await writeFile(`output/verification/reality-capture-hybrid/${home?'home-staging':production?'production':'staging'}-report.json`,JSON.stringify({passed:true,origin,home,...result,afterReload,manual,fixtureDeleted:true,automationAttestation:!!attestation,limitations:'Synthetic photo with real upload/validation/CPU submission. No physical phone, public approval or world acceptance.'},null,2));console.log('Live manual photo upload, validation, save, CPU submission, cost gates and cleanup passed. No reconstruction launched.');
}finally{
  if(captureId&&!deleted)await page.evaluate(async id=>(await import('/js/community-reality-capture-api.js?v=4')).deleteRealityCapture(id),captureId).catch(()=>{});
  if(account?.idToken&&config)await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${config.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:account.idToken})});
  try { await browser.close(); }
  finally { await attestation?.cleanup(); }
}
