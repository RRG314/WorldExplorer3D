import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const file=process.argv[2];if(!file)throw Error('Supply one exterior photo explicitly; no image uploads are performed.');
const out='output/verification/photo-survey-world';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const width=Number(process.env.SURVEY_WIDTH)||1280;
  const page=await browser.newPage({viewport:{width,height:850},isMobile:width<700,hasTouch:width<700});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4195/app/?loc=custom&lat=39.6572814&lon=-76.8875391&mode=walking&survey=1');
  await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
  if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
  if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
  await page.locator('.photoSurvey').waitFor({timeout:120000});
  const readWorld=()=>page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return {position:ctx.activeTransportActor().position,camera:ctx.camera.position.toArray(),rotation:ctx.camera.quaternion.toArray()};});
  const before=await readWorld();
  const panel=await page.locator('.photoSurvey').boundingBox();assert.ok(width<700?panel.width<=width:panel.x>width*.3);
  await page.screenshot({path:`${out}/${width}-in-world.png`});
  await page.locator('[data-survey-import]').setInputFiles(file);await page.locator('[data-survey-status]').filter({hasText:'1 photos added'}).waitFor({timeout:60000});
  await page.locator('[data-survey-gallery] input').first().check();await page.selectOption('[data-survey-wall]','0');await page.click('[data-survey-assign]');
  const building=await page.locator('[data-survey-building-id]').innerText();assert.match(building,/^(overture:|osm:)/);
  await page.click('[data-survey-edit]');await page.locator('.captureHybridEditor [data-save]:enabled').waitFor();await page.click('.captureHybridEditor [data-add]');await page.click('.captureHybridEditor [data-save]');await page.locator('.captureHybridEditor [data-saved]').filter({hasText:'Saved on this device'}).waitFor();await page.screenshot({path:`${out}/editor.png`});
  await page.click('.captureHybridEditor [data-close]');await page.click('[data-survey-close]');
  const after=await readWorld();assert.ok(Math.hypot(...before.camera.map((v,i)=>v-after.camera[i]))<.1,'Editor must not relocate the game camera');assert.deepEqual(after.position,before.position);
  await page.click('#communityBtn');await page.click('#fPhotoSurvey');await page.locator('.photoSurvey').waitFor();await page.click('[data-survey-close]');
  await page.waitForFunction(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.scene.children.some(o=>o.userData.communityRealityCapture?.representationId.startsWith('local-survey:'));},null,{timeout:20000});
  const state=await page.evaluate(async()=>{
    const {ctx}=await import('/app/js/shared-context.js?v=55'),{wallDirections}=await import('/app/js/reality-capture/orientation.js');
    const root=ctx.scene.children.find(o=>o.userData.communityRealityCapture?.representationId.startsWith('local-survey:')),id=root.userData.communityRealityCapture.sourceBuildingId,b=ctx.buildings.find(b=>b.sourceBuildingId===id);
    const points=b.pts.map(p=>({x:p.x-b.centerX,z:p.z-b.centerZ})),wall=wallDirections(points)[0];
    ctx.setPauseReason?.('survey-visual-verification',true);const x=b.centerX+wall.midpoint.x,z=b.centerZ+wall.midpoint.z,y=b.baseY+b.bodyHeightMeters*.5,d=Math.max(14,wall.length*1.1);
    ctx.camera.position.set(x+wall.normal.x*d,y+2,z+wall.normal.z*d);ctx.camera.lookAt(x,y,z);ctx.camera.updateMatrixWorld();ctx.renderer.render(ctx.scene,ctx.camera);
    return {frame:ctx.renderer.domElement.toDataURL('image/png'),id,patches:root.children.length,position:root.position.toArray(),expected:[b.centerX,b.baseY,b.centerZ],collisionAuthority:root.userData.communityRealityCapture.collisionAuthority};
  });
  await writeFile(`${out}/mapped-building-local-preview.png`,Buffer.from(state.frame.split(',')[1],'base64'));delete state.frame;assert.equal(state.id,building);assert.equal(state.patches,1);assert.equal(state.collisionAuthority,'canonical-mapped-building');console.log('Mapped building preview attached:',JSON.stringify(state));
  await page.reload();await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:60000});if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();await page.locator('.photoSurvey').waitFor({timeout:60000});await page.click('[data-survey-close]');await page.waitForFunction(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.scene.children.some(o=>o.userData.communityRealityCapture?.representationId.startsWith('local-survey:'));},null,{timeout:30000});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...state,width,reloaded:true,errors}));
}finally{await browser.close();}
