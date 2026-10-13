import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const out=process.env.WE3D_HOME_OUTPUT||'output/verification/personal-workspace';await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4483]});let browser,page;
const report={ok:false,evidence:'Actual WebGL models, DOM actions, IndexedDB and localStorage in a controlled room; not mapped-city traversal',checks:[],errors:[]};
try{
  browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(String(e)));
  const url=`http://127.0.0.1:${server.port}/scripts/verification/fixtures/personal-workspace.html`;
  await page.goto(url);await page.waitForFunction(()=>globalThis.fixture&&!fixture.runtime.snapshot().busy);
  await page.locator('[data-home-action="place"]').click();
  await page.waitForFunction(()=>fixture.runtime.snapshot().furnitureReady);
  await page.screenshot({path:`${out}/arrange.png`});
  assert.equal(await page.evaluate(()=>fixture.ctx.dynamicBuildingColliders.length),2);
  assert.equal(await page.evaluate(()=>fixture.active.interactions.filter(i=>i.id==='personal-workspace').length),1);
  await page.locator('[data-home-action="rotate"]').click();await page.waitForFunction(()=>fixture.runtime.snapshot().workspace.rotated&&!fixture.runtime.snapshot().busy);
  await page.locator('[data-home-action="undo"]').click();await page.waitForFunction(()=>fixture.runtime.snapshot().workspace.undone&&fixture.runtime.snapshot().furnitureReady);
  report.checks.push('actual-furniture-placed-rotated-undone-with-two-collision-envelopes');
  await page.evaluate(()=>{window.restoreWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='world-explorer:character-backpack:v3')throw new DOMException('Quota','QuotaExceededError');return restoreWrite.call(this,k,v);};});
  const prior=await page.evaluate(()=>fixture.runtime.snapshot().workspace);
  await page.locator('[data-home-action="left"]').click();await page.waitForFunction(()=>fixture.runtime.snapshot().saveFailed);
  assert.deepEqual(await page.evaluate(()=>fixture.runtime.snapshot().workspace),prior);
  await page.evaluate(()=>{Storage.prototype.setItem=restoreWrite;});await page.locator('[data-home-action="retry"]').click();await page.waitForFunction(()=>!fixture.runtime.snapshot().busy&&fixture.runtime.snapshot().furnitureReady);
  report.checks.push('failed-move-keeps-saved-layout-and-recovers');
  await page.evaluate(async()=>{const {workspaceGeometry}=await import('/app/js/campaign/personal-workspace.js');const g=workspaceGeometry(fixture.active,fixture.runtime.snapshot().workspace.pose);Object.assign(fixture.walker,{...g.use,y:g.use.y+1.7});fixture.state.ui.setOpen(false);});
  await page.waitForFunction(()=>fixture.runtime.snapshot().interactionReady);await page.keyboard.press('e');
  await page.locator('[data-home-action="review"]').waitFor();await page.locator('[data-home-action="review"]').click();
  await page.waitForFunction(()=>!fixture.runtime.snapshot().busy&&fixture.runtime.snapshot().workspace.usedAt>0);
  assert.ok(await page.evaluate(async()=>(await fixture.store.getProfile()).homeAchievements?.maker));
  const evidence=await page.evaluate(async()=>({colliders:fixture.ctx.dynamicBuildingColliders.length,events:(await fixture.store.listEvents(20)).filter(e=>e.metadata?.chapterId==='useful-place').length}));
  report.lifecycle=await page.evaluate(()=>({state:fixture.runtime.snapshot(),colliders:fixture.ctx.dynamicBuildingColliders.map(c=>({id:c.id,x:c.x,z:c.z})),groups:fixture.active.group.children.filter(c=>c.name==='Personal research workspace').map(c=>c.uuid)}));
  assert.deepEqual(evidence,{colliders:2,events:1});report.checks.push('in-world-interaction-reviews-real-record-and-earns-one-maker-badge');
  await page.evaluate(()=>{Object.assign(fixture.walker,{x:-2.6,y:1.95,z:-2.8});fixture.state.ui.setOpen(false);});
  await page.screenshot({path:`${out}/furniture.png`});
  if(process.env.WE3D_COASTAL_JOURNAL){
    const data=JSON.parse(await readFile(process.env.WE3D_COASTAL_JOURNAL,'utf8'));
    assert.ok(data.investigationRecords?.some(e=>e.eventId==='coastal-investigation-v1:report'));
    await page.evaluate(async rows=>{for(const row of rows)await fixture.store.recordExplorerEvent(row);await fixture.runtime.refresh();const {workspaceGeometry}=await import('/app/js/campaign/personal-workspace.js');const g=workspaceGeometry(fixture.active,fixture.runtime.snapshot().workspace.pose);Object.assign(fixture.walker,{...g.use,y:g.use.y+1.7});fixture.state.ui.setOpen(true);},data.investigationRecords);
    await page.locator('[data-home-action="coastal-display"]').click();await page.waitForFunction(()=>fixture.runtime.snapshot().workspace.recordId==='coastal-investigation-v1:report'&&fixture.runtime.snapshot().furnitureReady&&!fixture.runtime.snapshot().busy);
    assert.match(await page.locator('#discoveryPersonalHome').innerText(),/modern research equipment case/);await page.screenshot({path:`${out}/coastal-display.png`});
    await page.reload();await page.waitForFunction(()=>globalThis.fixture&&fixture.runtime.snapshot().furnitureReady);assert.equal(await page.evaluate(()=>fixture.runtime.snapshot().workspace.recordId),'coastal-investigation-v1:report');report.checks.push('completed-world-coastal-report-displayed-at-real-desk-and-retained-after-reload');
  }
  if(process.env.WE3D_LUNAR_JOURNAL){
    const data=JSON.parse(await readFile(process.env.WE3D_LUNAR_JOURNAL,'utf8'));
    const lunar=data.events.find(event=>event.eventId==='event:destination-mission:moon');assert.ok(lunar?.metadata?.prepared);
    await page.evaluate(async row=>{
      await fixture.store.recordExplorerEvent(row);await fixture.runtime.refresh();
      const {workspaceGeometry}=await import('/app/js/campaign/personal-workspace.js'),g=workspaceGeometry(fixture.active,fixture.runtime.snapshot().workspace.pose);
      Object.assign(fixture.walker,{...g.use,y:g.use.y+1.7});fixture.state.ui.setOpen(true);
    },lunar);
    await page.locator('[data-home-action="lunar-display"]').click();
    await page.waitForFunction(()=>fixture.runtime.snapshot().workspace.recordId==='event:destination-mission:moon'&&fixture.runtime.snapshot().furnitureReady&&!fixture.runtime.snapshot().busy);
    await page.locator('#discoveryPersonalHome details').filter({has:page.locator('[data-home-action="lunar-review"]')}).locator('summary').click();
    await page.evaluate(()=>{window.homeWriteFailure=false;const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='events'&&value?.eventId==='event:campaign:lunar-homecoming:v1'){IDBObjectStore.prototype.put=original;window.homeWriteFailure=true;throw new DOMException('Homecoming save rejected for verification','QuotaExceededError');}return original.call(this,value,...rest);};});
    await page.locator('[data-home-action="lunar-review"]').click();await page.waitForFunction(()=>!fixture.runtime.snapshot().busy);
    assert.equal(await page.evaluate(()=>window.homeWriteFailure),true,'The targeted failed write must execute');
    assert.equal(await page.evaluate(async()=>(await fixture.store.getEventsById(['event:campaign:lunar-homecoming:v1'])).length),0);
    // Runtime rerender closes ordinary disclosure widgets; expand the current one.
    await page.locator('#discoveryPersonalHome details').filter({has:page.locator('[data-home-action="lunar-review"]')}).locator('summary').click();
    await page.locator('[data-home-action="lunar-review"]').click();await page.waitForFunction(()=>!fixture.runtime.snapshot().busy);
    assert.equal(await page.evaluate(async()=>(await fixture.store.getEventsById(['event:campaign:lunar-homecoming:v1'])).length),1);
    assert.equal(await page.evaluate(async()=>(await fixture.store.getEventsById(['event:campaign:from-the-harbor:v1'])).length),0,'Missing coastal and home chapters must not grant the combined badge');
    await page.locator('#discoveryPersonalHome details').filter({has:page.locator('[data-home-action="lunar-review"]')}).locator('summary').click();
    await page.screenshot({path:`${out}/lunar-homecoming.png`});
    await page.locator('[data-home-action="lunar-review"]').click();await page.waitForFunction(()=>!fixture.runtime.snapshot().busy);
    assert.equal(await page.evaluate(async()=>(await fixture.store.getEventsById(['event:campaign:lunar-homecoming:v1'])).length),1);
    await page.reload();await page.waitForFunction(()=>globalThis.fixture&&fixture.runtime.snapshot().furnitureReady);
    assert.equal(await page.evaluate(()=>fixture.runtime.snapshot().workspace.recordId),'event:destination-mission:moon');
    assert.equal(await page.evaluate(async()=>{const {lunarCampaignBadges,harborJourneyEventIds}=await import('/app/js/campaign/lunar-homecoming.js');return lunarCampaignBadges(await fixture.store.getProfile(),await fixture.store.getEventsById(harborJourneyEventIds)).some(b=>b.id==='lunar-surveyor');}),true);
    report.checks.push('actual-moon-report-at-desk-failed-save-retry-duplicate-reload-and-no-unearned-campaign-badge');
  }
  await page.evaluate(()=>fixture.state.ui.setOpen(true));await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('aside').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.screenshot({path:`${out}/phone.png`});
  await page.setViewportSize({width:1280,height:800});
  const download=page.waitForEvent('download');await page.locator('[data-home-action="export"]').click();await(await download).saveAs(`${out}/design.json`);
  await page.locator('[data-home-import]').setInputFiles(`${out}/design.json`);await page.waitForFunction(()=>!fixture.runtime.snapshot().busy);
  await page.reload();await page.waitForFunction(()=>globalThis.fixture&&fixture.runtime.snapshot().furnitureReady);
  assert.deepEqual(await page.evaluate(()=>fixture.runtime.snapshot().workspace.pose),prior.pose);
  assert.equal(await page.evaluate(async()=>!!(await fixture.store.getProfile()).homeAchievements?.maker),true);
  report.checks.push('design-export-import-and-reload-retain-arrangement-and-badge');
  await page.evaluate(()=>fixture.runtime.dispose());assert.equal(await page.evaluate(()=>fixture.ctx.dynamicBuildingColliders.length),0);
  assert.equal(await page.evaluate(()=>fixture.active.interactions.filter(i=>i.id==='personal-workspace').length),0);
  assert.equal(await page.evaluate(()=>fixture.active.group.children.some(c=>c.name==='Personal research workspace')),false);report.checks.push('disposal-releases-furniture-and-colliders');
  assert.deepEqual(report.errors,[]);await browser.close();browser=null;
  // Prescribed game client, with the same composed-image adapter used by the
  // camera verifier to avoid reading a cleared non-preserved WebGL buffer.
  let client=await readFile(`${process.env.HOME}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'utf8');
  assert.ok(client.includes('await captureScreenshot(page, canvas, shotPath);'));
  client=client.replace('await captureScreenshot(page, canvas, shotPath);','await page.screenshot({path:shotPath,type:"png"});');
  const args=['--input-type=module','-','--headless','false','--url',url,'--click-selector','[data-home-action="place"]','--actions-json',JSON.stringify({steps:[{buttons:[],frames:120},{buttons:['left'],frames:5},{buttons:[],frames:60}]}),'--iterations','1','--screenshot-dir',`${out}/prescribed-client`];
  const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:['pipe','inherit','inherit']});child.stdin.end(client);child.on('error',reject);child.on('exit',resolve);});assert.equal(code,0);
  assert.ok(!(await readdir(`${out}/prescribed-client`)).some(f=>f.startsWith('errors-')));
  const text=JSON.parse(await readFile(`${out}/prescribed-client/state-0.json`,'utf8'));assert.equal(text.furnitureReady,true);report.checks.push('prescribed-client-places-furniture-and-exercises-room-movement');report.ok=true;
}catch(error){report.error=String(error.stack||error);await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(report));
