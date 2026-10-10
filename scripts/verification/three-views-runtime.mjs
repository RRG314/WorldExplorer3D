import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const out=process.env.WE3D_PHOTO_OUTPUT||'output/verification/three-views';await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4478]});let browser;
const report={ok:false,evidence:'Controlled WebGL scene, actual shutter/UI/images and personal-home display; not a city or property-ownership playthrough',errors:[],checks:[]};
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>report.errors.push(String(e)));
 const url=`http://127.0.0.1:${server.port}/scripts/verification/fixtures/three-views.html`;
 await page.goto(url);await page.waitForFunction(()=>globalThis.fixture&&!fixture.runtime.snapshot().busy);
 await page.locator('[data-photo-action="accept:photo"]').click();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>fixture.runtime.snapshot().armed==='context');
 await page.evaluate(()=>fixture.ctx.openWorldDiscoverySection());await page.locator('[data-photo-action="continue"]').click();
 assert.equal(await page.evaluate(()=>fixture.interaction().evaluate()),null);assert.equal(await page.evaluate(()=>fixture.runtime.snapshot().phase),'framing');
 await page.evaluate(()=>fixture.ctx.openWorldDiscoverySection());await page.locator('[data-photo-action="arm:context"]').click();report.checks.push('camera-can-be-put-away-without-discarding-the-job');

 for(const [kind,pose] of Object.entries({context:{x:0,z:39},detail:{x:0,z:20},setting:{x:25,z:42}})){
  if(kind!=='context')await page.locator(`[data-photo-action="arm:${kind}"]`).click();
  await page.evaluate(p=>Object.assign(fixture.pose,p),pose);await page.keyboard.press('Enter');
  await page.waitForFunction(()=>fixture.runtime.snapshot().candidate);
  if(kind==='context'){
   await page.evaluate(()=>fixture.setFail(true));await page.locator('[data-photo-action="keep"]').click();
   await page.waitForFunction(()=>fixture.runtime.snapshot().message.includes('save failure'));
   assert.equal(await page.evaluate(()=>fixture.runtime.snapshot().candidate),true);
   assert.equal(await page.evaluate(async()=>(await fixture.store.getProfile()).threeViews.views.length),0);
   await page.evaluate(()=>fixture.setFail(false));report.checks.push('failed-save-keeps-preview-and-does-not-advance');
  }
  await page.locator('[data-photo-action="keep"]').click();await page.waitForFunction(k=>fixture.runtime.snapshot().views.includes(k),kind);
 }
 await page.locator('[data-photo-action="finish"]').click();await page.waitForFunction(()=>fixture.runtime.snapshot().phase==='complete');
 assert.equal(await page.locator('.discoveryPhotoAlbum img').count(),3);report.checks.push('three-normal-rendered-frames-complete-via-ui');
 await page.screenshot({path:`${out}/album.png`});
 report.details=await page.evaluate(async()=>{
  const {inspectPhotoSubject}=await import('/app/js/campaign/three-views-capture.js');
  const {attachThreeViewsHome,disposeThreeViewsHome}=await import('/app/js/campaign/three-views-home.js');
  const check=(v,m)=>{if(!v)throw Error(m);};const f=fixture,T=THREE;
  const profile=await f.store.getProfile(),backup=await f.store.exportData();
  check(!JSON.stringify(profile).includes('base64'),'Ordinary profile contains image bytes');
  check(new Set(backup.albums[0].photos.map(p=>p.dataUrl)).size===3,'Shutter saved identical frames');
  // Two legitimate backup branches can have the same numeric revision.
  const variant=structuredClone(backup),first=variant.albums[0].photos[0],canvas=document.createElement('canvas');canvas.width=first.width;canvas.height=first.height;
  const image=new Image();image.src=first.dataUrl;await image.decode();const paint=canvas.getContext('2d');paint.drawImage(image,0,0);paint.fillStyle='#995533';paint.fillRect(0,0,20,20);first.dataUrl=canvas.toDataURL('image/jpeg',.8);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(first.dataUrl));variant.profile.threeViews.views[0].fingerprint=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  globalThis.__alternatePhotoBackup=variant;
  await f.store.importData(variant);await f.runtime.refresh(await f.store.getProfile());
  check(document.querySelector('.discoveryPhotoAlbum img').src===first.dataUrl,'Same-revision backup kept obsolete image bytes');
  await f.store.importData(backup);await f.runtime.refresh(await f.store.getProfile());
  // A foreground wall is not in the building array: it must still occlude.
  const blocker=new T.Mesh(new T.BoxGeometry(70,25,1),new T.MeshBasicMaterial({color:0xeeeeee}));blocker.position.set(0,8,16);f.scene.add(blocker);Object.assign(f.pose,{x:0,z:39});f.draw();
  let blocked=false;try{inspectPhotoSubject(f.ctx,{regionId:'test',regionLabel:'Test'},'component-building');}catch{blocked=true;}check(blocked,'Shutter saw through a foreground wall');
  f.scene.remove(blocker);blocker.geometry.dispose();blocker.material.dispose();
  const active={group:new T.Group(),ownedHome:{id:'test-home'},usableFootprint:[{x:-4,z:-4},{x:4,z:-4},{x:4,z:4},{x:-4,z:4}],entryPoint:{x:0,z:4},floorBaseY:0,activeLevel:0};f.scene.add(active.group);f.ctx.activeInterior=active;
  f.runtime.update();
  return {photoBytes:backup.albums[0].photos.reduce((n,p)=>n+p.dataUrl.length,0),home:active.ownedHome.id};
 });
 await page.locator('[data-photo-action="display"]').click();await page.waitForFunction(()=>fixture.ctx.activeInterior.threeViewsDisplay?.root?.parent);
 const changedHome=await page.evaluate(async()=>{
  const f=fixture,current=await f.store.exportData(),before=f.ctx.activeInterior.threeViewsDisplay.root.uuid;
  const alternative=structuredClone(globalThis.__alternatePhotoBackup);alternative.profile.threeViews.revision=current.profile.threeViews.revision;alternative.profile.threeViews.displayHomeId=current.profile.threeViews.displayHomeId;
  await f.store.importData(alternative);await f.runtime.refresh(await f.store.getProfile());
  const deadline=performance.now()+4000;while(!f.ctx.activeInterior.threeViewsDisplay?.root?.parent&&performance.now()<deadline)await new Promise(r=>setTimeout(r,20));
  const nextRoot=f.ctx.activeInterior.threeViewsDisplay?.root;const changed=!!nextRoot?.parent&&nextRoot.uuid!==before;
  await f.store.importData(current);await f.runtime.refresh(await f.store.getProfile());return changed;
 });assert.equal(changedHome,true,'Equal-revision restore must replace the home textures too');
 await page.waitForFunction(()=>fixture.ctx.activeInterior.threeViewsDisplay?.root?.parent);
 const dimensions=await page.evaluate(()=>{const active=fixture.ctx.activeInterior,root=active.threeViewsDisplay.root;Object.assign(fixture.pose,{x:0,y:1.65,z:3,target:{x:0,y:1.65,z:-4}});fixture.building.visible=false;fixture.draw();return root.children.map(c=>[c.material.map.image.width,c.material.map.image.height]);});
 assert.deepEqual(dimensions,[[512,384],[512,384],[512,384]]);report.checks.push('owned-home-display-has-bounded-textures-and-persisted-choice');
 // Render the actual home display with a controlled camera aimed at the wall.
 await page.evaluate(()=>{const f=fixture;f.state.ui.setOpen(false);f.ctx.camera.position.set(0,1.65,2);f.ctx.camera.lookAt(0,1.65,-4);f.ctx.renderer.render(f.scene,f.ctx.camera);});
 await page.screenshot({path:`${out}/home-display.png`});
 await page.evaluate(()=>fixture.ctx.openWorldDiscoverySection());await page.locator('[data-photo-action="delete"]').click();
 assert.equal(await page.evaluate(async()=>(await fixture.store.getThreeViewsAlbum()).photos.length),3,'Initial delete button must ask before erasing photos');
 await page.locator('[data-photo-action="confirm-delete"]').click();await page.waitForFunction(()=>fixture.runtime.snapshot().photos===0);
 assert.equal(await page.evaluate(()=>!!fixture.ctx.activeInterior.threeViewsDisplay),false);report.checks.push('confirmed-deletion-removes-saved-images-and-home-textures');
 report.checks.push(...await page.evaluate(async()=>{
  const f=fixture;f.setReadFail(true);await f.runtime.refresh();if(!f.runtime.snapshot().message.includes('could not refresh'))throw Error('Read error hidden');
  f.setReadFail(false);await f.runtime.refresh();
  f.runtime.dispose();if(f.system()||f.interaction()||document.querySelector('#discoveryThreeViews').children.length)throw Error('Disposal retained camera or UI');
  return ['foreground-occlusion-is-enforced','failed-refresh-preserves-data','dispose-releases-camera-context-and-ui'];
 }));
 report.checks.push('same-revision-backup-replaces-image-content');
 await page.reload();await page.locator('[data-photo-action="accept:observation"]').click();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>fixture.runtime.snapshot().armed==='context');
 for(const [kind,pose] of Object.entries({context:{x:0,z:39},detail:{x:0,z:20},setting:{x:25,z:42}})){
  if(kind!=='context')await page.locator(`[data-photo-action="arm:${kind}"]`).click();
  await page.evaluate(p=>Object.assign(fixture.pose,p),pose);await page.waitForTimeout(50);await page.keyboard.press('Enter');
  await page.waitForFunction(()=>fixture.runtime.snapshot().candidate);assert.equal(await page.locator('.discoveryPhotoPreview img').count(),0);
  await page.locator('[data-photo-action="keep"]').click();await page.waitForFunction(k=>fixture.runtime.snapshot().views.includes(k),kind);
 }
 await page.locator('[data-photo-action="finish"]').click();await page.waitForFunction(()=>fixture.runtime.snapshot().phase==='complete');
 assert.equal(await page.locator('.discoveryPhotoAlbum img').count(),0);report.checks.push('observation-variant-completes-without-pretend-images');
 await page.evaluate(async()=>{await fixture.store.saveProfile(p=>({...p,threeViews:{schemaVersion:2,revision:1,phase:'future'}}));await fixture.runtime.refresh();});
 assert.match(await page.locator('#discoveryThreeViews').innerText(),/newer version/);assert.equal(await page.locator('[data-photo-action]').count(),0);report.checks.push('future-job-remains-readable-and-cannot-be-overwritten');
 assert.deepEqual(report.errors,[]);await browser.close();browser=null;
 const client=path.join(process.env.HOME,'.codex/skills/develop-web-game/scripts/web_game_playwright_client.js');
 let clientSource=await readFile(client,'utf8');
 const screenshotCall='await captureScreenshot(page, canvas, shotPath);';
 assert.ok(clientSource.includes(screenshotCall));
 // Use the browser's composed screenshot; WebGL clears the non-preserved
 // drawing buffer before the generic client's later canvas.toDataURL call.
 clientSource=clientSource.replace(screenshotCall,'await page.screenshot({path:shotPath,type:"png"});');
 const args=['--input-type=module','-','--headless','false','--url',url,'--click-selector','[data-photo-action="accept:photo"]','--actions-json',JSON.stringify({steps:[{buttons:['enter'],frames:1},{buttons:[],frames:8},{buttons:['enter'],frames:1},{buttons:[],frames:30}]}),'--iterations','1','--screenshot-dir',`${out}/prescribed-client`];
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:['pipe','inherit','inherit']});child.stdin.end(clientSource);child.on('error',reject);child.on('exit',resolve);});assert.equal(code,0);
 const files=await readdir(`${out}/prescribed-client`);assert.ok(!files.some(f=>f.startsWith('errors-')),'Prescribed client browser errors');
 const state=JSON.parse(await readFile(`${out}/prescribed-client/state-0.json`,'utf8'));assert.equal(state.candidate,true);report.checks.push('prescribed-client-chooses-and-captures-actual-frame');report.ok=true;
}catch(error){report.error=String(error.stack||error);throw error;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(report));
