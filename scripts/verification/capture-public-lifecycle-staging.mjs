// Deployed backend + actual runtime loader, isolated synthetic mapped footprint.
// Fixed staging project; never approve a real user's contribution or run GPU work.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';
const project='we3d-staging-20260712',origin=`https://${project}.web.app`,bucket=project+'.firebasestorage.app';
if(process.env.WE3D_VERIFY_PRODUCTION==='1')throw Error('Staging only');
const cli=createRequire(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()+'/firebase-tools/package.json'),{Client}=cli('./lib/apiv2');
const attestation=await stagingCaptureAttestation(),storage=new Client({urlPrefix:'https://storage.googleapis.com',auth:true}),identity=new Client({urlPrefix:'https://identitytoolkit.googleapis.com',auth:true});
const runtimeBundle=await build({entryPoints:['app/js/reality-capture/runtime.js'],bundle:true,format:'esm',write:false,external:['https://*','/js/*','../../../js/community-reality-capture-api.js?v=4']});
const runtimeSource=runtimeBundle.outputFiles[0].text.replaceAll('../../../js/community-reality-capture-api.js?v=4','/js/community-reality-capture-api.js?v=4');
const browser=await chromium.launch({channel:'chrome',headless:true}),accounts=[];let page,config;
async function newAccount(admin=false){
 const context=await browser.newContext({viewport:{width:1100,height:900}});await context.addInitScript(token=>self.FIREBASE_APPCHECK_DEBUG_TOKEN=token,attestation.token);await context.route('**/__capture_runtime_fixture.js',r=>r.fulfill({contentType:'text/javascript',body:runtimeSource}));const page=await context.newPage();page.setDefaultTimeout(45000);page.on('dialog',d=>d.accept());
 await page.goto(origin+'/app/capture.html');config=await page.evaluate(()=>WORLD_EXPLORER_FIREBASE);assert.equal(config.projectId,project);
 const email=`capture-lifecycle-${Date.now()}-${accounts.length}@example.test`,password=randomBytes(24).toString('base64url');
 const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})}),user=await response.json();assert.ok(response.ok,user.error?.message);const account={...user,email,password,page};accounts.push(account);
 if(admin)await identity.post(`/v1/projects/${project}/accounts:update`,{localId:user.localId,customAttributes:JSON.stringify({admin:true})});
 await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill(password);await page.locator('#emailSignIn button').click();await page.locator('#phoneCaptures').waitFor({state:'visible'});return account;
}
async function call(page,path,body){return page.evaluate(async({path,body})=>(await import('/js/function-api.js?v=1')).postProtectedFunction(path,body),{path,body});}
async function deleteTestAccount(account){
 // Recent reauthentication is required by the real account deletion endpoint.
 await account.page.evaluate(async({email,password})=>(await import('/js/auth-ui.js?v=55')).signInWithEmailPassword(email,password),{email:account.email,password:account.password});
 await call(account.page,'/deleteAccount',{confirmation:'DELETE'});account.deleted=true;
 const result=await storage.get(`/storage/v1/b/${bucket}/o`,{queryParams:{prefix:`reality-captures/${account.localId}/`,versions:true}});assert.equal((result.body.items||[]).length,0);
}
try{
 const owner=await newAccount(true);page=owner.page;
 const sourceId=`osm:way:capture-verification-${Date.now()}`,building={sourceBuildingId:sourceId,sourceAuthority:'osm',worldId:'earth:v1:396572814:-768875391',label:'Disposable capture acceptance fixture',lat:39.6572814,lon:-76.8875391,spatialContext:{schemaVersion:1,frame:'building-local-x-east-y-up-z-south',height:{meters:6,evidence:'user-test'},wallHeightMeters:6,footprint:[{x:-5,z:-4},{x:5,z:-4},{x:5,z:4},{x:-5,z:4}]}};
 const original=await call(page,'/createRealityCaptureDraft',{captureKind:'exterior',building});const captureId=original.capture.captureId;
 const saved=await page.evaluate(async id=>{const api=await import('/js/community-reality-capture-api.js?v=4'),c=document.createElement('canvas');c.width=1280;c.height=720;const ctx=c.getContext('2d');ctx.fillStyle='#ac734b';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#19445c';ctx.fillRect(150,120,300,400);ctx.fillRect(800,120,300,400);const photo=await api.normalizeCapturePhoto(await new Promise(r=>c.toBlob(r,'image/jpeg')));const capture=(await api.getMyRealityCapture(id)).capture;await api.uploadRealityCapturePhoto(capture,photo);await api.uploadRealityCapturePhoto(capture,photo);await api.finalizeRealityCaptureUpload(id,'manual');const value=await api.saveRealityCaptureHybridPreview(id,{baseRevision:0,footprintSignature:capture.footprintSignature,heightMeters:6,patches:[{id:'front',photoId:photo.id,wall:0,orientationVersion:2,region:[0,0,1,1],quad:[[0,0],[1,0],[1,1],[0,1]]}]});await api.submitRealityCaptureHybrid(id,value.preview.revision,true,true);return {revision:value.preview.revision,photoId:photo.id};},captureId);
 const objects=await storage.get(`/storage/v1/b/${bucket}/o`,{queryParams:{prefix:`reality-captures/${owner.localId}/${captureId}/originals/`}});assert.equal(objects.body.items.length,1);assert.equal(objects.body.items[0].metadata?.firebaseStorageDownloadTokens,undefined,'No permanent token exists even before server cleanup');
 const visitor=await newAccount();
 await assert.rejects(()=>call(visitor.page,'/getRealityCaptureAssetAccess',{captureId,asset:'original',path:objects.body.items[0].name}));
 const lookup={worldId:'earth:v1:396570000:-768870000',sourceBuildingIds:[sourceId]};
 assert.equal((await call(visitor.page,'/listApprovedExteriorRepresentations',lookup)).representations.length,0);
 await page.goto(`${origin}/account/?section=review&capture=${captureId}`);
 await page.getByRole('heading',{name:'Review improvements',exact:true}).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Approve improvement'&&!b.disabled));
 await page.getByRole('button',{name:'Approve improvement',exact:true}).click();await page.locator('[data-review-state]').filter({hasText:'Approved. Open'}).waitFor();
 await page.locator('.account-nav [data-account-target="contributions"]').click();await page.getByRole('button',{name:'Open contribution',exact:true}).waitFor();await page.goBack();await page.locator('.reviewVersionStatus').filter({hasText:'Published exterior'}).waitFor();
 await mkdir('output/verification/capture-public-lifecycle',{recursive:true});await page.screenshot({path:'output/verification/capture-public-lifecycle/account-review.png',fullPage:true});
 const published=await call(visitor.page,'/listApprovedExteriorRepresentations',lookup);assert.equal(published.representations.length,1);
 // Actual runtime loader reads the deployed endpoint and protected generation URL.
 const rendered=await visitor.page.evaluate(async({sourceId})=>{for(const url of ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js','https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=reject;document.head.append(s);});const THREE=globalThis.THREE;if(!THREE.GLTFLoader)throw Error('GLTFLoader not ready');
  const app={LOC:{lat:39.657,lon:-76.887},initialEarthWorldReady:true,_worldLoadSequence:1,scene:new THREE.Scene(),buildings:[{sourceBuildingId:sourceId,geometrySource:'osm',pts:[{x:-5,z:-4},{x:5,z:-4},{x:5,z:4},{x:-5,z:4}],minX:-5,maxX:5,minZ:-4,maxZ:4,baseY:0,height:6,wallHeightMeters:6}]};window.captureTestApp=app;const runtime=await import('/__capture_runtime_fixture.js');const summary=await runtime.refreshCommunityRealityCapturePresentation(app);let meshCount=0;app.scene.traverse(o=>{if(o.isMesh)meshCount++;});const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(800,600);app.scene.background=new THREE.Color('#101e2a');app.scene.add(new THREE.AmbientLight(0xffffff,2));const camera=new THREE.PerspectiveCamera(50,800/600,.1,100);camera.position.set(10,8,-15);camera.lookAt(0,3,0);renderer.render(app.scene,camera);document.body.replaceChildren(renderer.domElement);window.captureTestRender=()=>renderer.render(app.scene,camera);return {summary,meshCount,entryRegistered:app.communityRealityCaptureEntryBuildings?.has(sourceId)};},{sourceId});assert.equal(rendered.entryRegistered,true);assert.equal(rendered.summary.loaded,1,JSON.stringify(rendered));assert.ok(rendered.meshCount>0);
 await mkdir('output/verification/capture-public-lifecycle',{recursive:true});await visitor.page.screenshot({path:'output/verification/capture-public-lifecycle/approved-runtime.png'});
 const continued=await call(page,'/createRealityCaptureDraft',{sourceCaptureId:captureId,captureKind:'exterior',building});const next=continued.capture.captureId;
 await call(page,'/submitRealityCaptureHybrid',{captureId:next,revision:1,consent:true,publicContributionRequested:true});
 assert.equal((await call(visitor.page,'/listApprovedExteriorRepresentations',lookup)).representations[0].representationId,published.representations[0].representationId,'Old version stays installed during review');
 await call(page,'/moderateRealityCapture',{captureId:next,decision:'approved',revision:1});
 const replacement=await call(visitor.page,'/listApprovedExteriorRepresentations',lookup);assert.equal(replacement.representations.length,1);assert.notEqual(replacement.representations[0].representationId,published.representations[0].representationId);
 const refreshed=await visitor.page.evaluate(async()=>{const r=await(await import('/__capture_runtime_fixture.js')).refreshCommunityRealityCapturePresentation(window.captureTestApp);window.captureTestRender();return r;});assert.equal(refreshed.loaded,1);
 await deleteTestAccount(owner);
 assert.equal((await call(visitor.page,'/listApprovedExteriorRepresentations',lookup)).representations.length,0);
 await visitor.page.evaluate(async()=>{await(await import('/__capture_runtime_fixture.js')).refreshCommunityRealityCapturePresentation(window.captureTestApp);if(window.captureTestApp.scene.children.some(c=>c.userData?.communityRealityCapture))throw Error('Deleted publication still installed');});
 await deleteTestAccount(visitor);
 await writeFile('output/verification/capture-public-lifecycle/result.json',JSON.stringify({passed:true,project,checks:['owner-only originals','token-free idempotent upload','independent viewer cannot see pending','approval-to-runtime GLB','Earth origin compatibility','approved continuation replacement','account deletion removes originals and publications','runtime withdrawal'],limits:'Synthetic isolated building and photo; real deployed APIs and actual renderer. Temporary staging attestation and disposable moderator claim. No physical Android or production.'},null,2));console.log('Staging public lifecycle, independent viewer runtime, private originals, replacement and account cleanup passed.');
}catch(error){if(page){console.error('Acceptance page:',page.url());console.error((await page.locator('body').innerText()).slice(-4500));await page.screenshot({path:'output/verification/capture-public-lifecycle/failure.png',fullPage:true}).catch(()=>{});}throw error;}finally{
 for(const account of accounts)if(!account.deleted)try{await deleteTestAccount(account);}catch(e){console.error('Disposable fixture cleanup needs retry:',account.localId,e.message);}
 await browser.close();await attestation.cleanup();
}
