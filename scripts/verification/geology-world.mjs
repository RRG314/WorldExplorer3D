import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const out='output/verification/geology-world';await mkdir(out,{recursive:true});
const width=Number(process.env.GEOLOGY_WIDTH)||1280;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width,height:850},isMobile:width<700,hasTouch:width<700});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4195/app/?loc=custom&lat=39.6572814&lon=-76.8875391&mode=walking');
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.locator('#globeSelectorStartBtn').click();
 await page.evaluate(async()=>{window.geologyTestContext=(await import('/app/js/shared-context.js?v=55')).ctx;});
 await page.waitForFunction(()=>{const ctx=window.geologyTestContext;return ctx.gameStarted && !ctx.worldLoading && ctx.initialEarthWorldReady && !!ctx.worldDiscoveryRuntime;},null,{timeout:120000});
 // Seed only this fresh browser's local profile to the existing rock-hammer rank.
 await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');const s=ctx.worldDiscoveryRuntime,p=await s.profileStore.getProfile();await s.profileStore.saveProfile({...p,explorerProgress:{...p.explorerProgress,points:8}});await s.refreshToolProgress();});
 await page.waitForFunction(()=>window.geologyTestContext.worldDiscoveryRuntime.actions.some(a=>a.id==='geology-inspect'));
 await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.worldDiscoveryRuntime.ui.setTab('today');ctx.worldDiscoveryRuntime.ui.setOpen(true);});
 const more=page.locator('.discoveryMoreActivities');if(await more.count())await more.locator('summary').click();
 await page.locator('[data-discovery-action="geology-inspect"]').click();
 await page.locator('#discoveryPrimaryBtn').click();
 // Move the fixture player to the generated, collision-checked survey stop.
 await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');const s=ctx.worldDiscoveryRuntime,id=s.fieldSession.snapshot().targetId;const slot=s.publication.fieldActivities.slots.find(x=>x.id===id);if(!slot)throw Error('No geology slot');Object.assign(ctx.Walk.state.walker,{x:slot.position.x,z:slot.position.z});});
 await page.waitForFunction(()=>window.geologyTestContext.worldDiscoveryRuntime.fieldSession.snapshot().phase==='revealed',null,{timeout:20000});
 await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.worldDiscoveryRuntime.ui.setOpen(true);});
 await page.locator('#discoveryPrimaryBtn').click();
 await page.waitForFunction(()=>{const snap=window.geologyTestContext.worldDiscoveryRuntime.fieldSession.snapshot();if(snap.error)throw Error(snap.error);return snap.phase==='recorded';},null,{timeout:20000});
 const result=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');const s=ctx.worldDiscoveryRuntime;const event=(await s.profileStore.listEvents()).find(e=>e.catalogId==='mapped-geology-study');s.ui.setTab('journal');await s.ui.refreshData();s.ui.setOpen(true);return event;});
 assert.ok(result.evidencePayload.geologyEvidence.units.length);assert.equal(result.projections.collection,false);
 await page.locator('.discoveryGeologyEvidence summary').first().click();await page.screenshot({path:`${out}/${width}-journal.png`});
 await page.reload();await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:60000});
 const persisted=await page.evaluate(async()=>{const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js');return (await createIndexedDbDiscoveryProfileStore().listEvents()).find(e=>e.catalogId==='mapped-geology-study');});
 assert.deepEqual(persisted.evidencePayload.geologyEvidence,result.evidencePayload.geologyEvidence);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({width,name:result.name,units:result.evidencePayload.geologyEvidence.units,reloaded:true,errors}));
}finally{await browser.close();}
