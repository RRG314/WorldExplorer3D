import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createHostResourceGuard} from './host-resource-guard.mjs';
import {GEOLOGY_STUDIES} from '../../app/js/campaign/geology-career.js';
const output=`output/verification/geology-career-20261102/world-${Date.now()}`;
await fs.mkdir(output,{recursive:true});
const base=process.env.WE3D_PREVIEW_URL||'http://127.0.0.1:4192';
let browserServer=null,browser=null,page=null;
const report={scope:'Actual source Earth course, held-key walking with controlled orientation; no position teleport or time advance. Disposable browser data, unchanged production.',checks:[],errors:[],providerErrors:[],workerTrace:[]};
let recovery=null;
if(process.env.WE3D_GEOLOGY_RECOVERY){
 const source=path.resolve(process.env.WE3D_GEOLOGY_RECOVERY),root=path.resolve('output/verification/geology-career-20261102')+path.sep;
 assert.ok(source.startsWith(root)&&path.basename(source)==='qa-fieldwork-backup.json','Recovery must be an owned source-world QA checkpoint');
 const bytes=await fs.readFile(source);recovery=JSON.parse(bytes);
 const saved=recovery.profile?.researchCareers?.geology;
 assert.equal(saved?.active?.variantId,'campaign');assert.equal(saved.active.phase,'bench');assert.equal(Object.keys(saved.completed).length,0);assert.equal(Object.keys(saved.active.samples).length,2);
 report.recoveredActualFieldwork={source,sha256:createHash('sha256').update(bytes).digest('hex'),scope:'Real observations and specimen collections reused from the saved source-world run; this run rechecks resume and completes the remaining boundaries.'};
}
const guard=createHostResourceGuard({rootDir:process.cwd(),stopOwnedTask:async cause=>{report.resourceStop=cause;await browserServer?.kill();},record:row=>fs.appendFile(`${output}/host-resources.jsonl`,JSON.stringify(row)+'\n')});
const snapshot=()=>page.evaluate(async()=>{
 const {ctx}=await import('/app/js/shared-context.js?v=55'),w=ctx.Walk?.state?.walker,m=ctx.perfStats?.lastLoad;
 return {loading:ctx.worldLoading,started:ctx.gameStarted,paused:ctx.paused,worldSequence:ctx._worldLoadSequence,fieldwork:ctx.saveActiveGameplay?.(),registry:ctx.getGameplayRegistrySnapshot?.(),walker:w?{x:w.x,y:w.y,z:w.z,onGround:w.onGround}:null,unit:ctx.METERS_PER_WORLD_UNIT||1.11,load:{success:m?.success,error:m?.error,reason:m?.reason,loadMs:m?.loadMs,streetOverview:m?.streetOverview},overview:ctx.streetOverview?.stats,colliders:ctx.dynamicBuildingColliders?.filter(c=>c.sourceBuildingId?.startsWith('research-geology:')).length};
});
const record=async(name)=>{const state=await snapshot();report.checks.push({name,state});await fs.writeFile(`${output}/progress.json`,JSON.stringify(report,null,2)+'\n');
 const backup=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.discoveryProfileStore.exportData();});
 await fs.writeFile(`${output}/qa-fieldwork-backup.json`,JSON.stringify(backup)+'\n',{mode:0o600});console.log(name);return state;};
async function waitForCourse(variantId){
 const deadline=Date.now()+180000;let nextLog=Date.now()+15000;
 while(Date.now()<deadline){
  const state=await snapshot();if(state.fieldwork?.careerId==='geology'&&(!variantId||state.fieldwork.variantId===variantId))return state;
  if(!state.loading&&state.load.success===false)throw Error(state.load.error||'World load failed');
  const plugin=state.registry?.plugins?.find(p=>p.id==='research-career');if(plugin?.lastError)throw Error(plugin.lastError);
  if(Date.now()>nextLog){console.log(`Earth course loading; ${state.overview?.requestPhase||state.overview?.status||'location sources'}`);nextLog=Date.now()+15000;}
  await page.waitForTimeout(500);
 }
 throw Error('The source course did not become ready within the finite three-minute load window.');
}
async function walkTo(point,tolerance=.55){
 const start=await snapshot(),deadline=Date.now()+22000;let stalled=0,lastDistance=Infinity;
 while(Date.now()<deadline){
  const state=await snapshot(),w=state.walker,d=Math.hypot(point.x-w.x,point.z-w.z)*state.unit;
  if(d<tolerance){await page.keyboard.up('w');return;}
  if(Math.abs(lastDistance-d)<.015)stalled++;else stalled=0;
  if(stalled>12)throw Error(`Walking blocked ${d.toFixed(1)} m from the station approach`);
  lastDistance=d;
  await page.evaluate(async p=>{const {ctx}=await import('/app/js/shared-context.js?v=55'),w=ctx.Walk.state.walker;w.yaw=Math.atan2(p.x-w.x,p.z-w.z);w.lookYawOffset=0;},point);
  await page.keyboard.down('w');await page.waitForTimeout(Math.min(180,Math.max(40,d*60)));await page.keyboard.up('w');
 }
 throw Error(`Walking approach exceeded 22 seconds from ${start.walker.x},${start.walker.z}`);
}
async function approach(variantId){
 const state=await snapshot(),p=state.fieldwork.target,u=state.unit;
 await walkTo({x:state.walker.x,z:p.z+6/u});await walkTo({x:p.x,z:p.z+6/u});await walkTo({x:p.x,z:p.z+(p.id==='bench'?1.2:2.55)/u},.15);
 if(state.fieldwork.phase==='exposure-a')await page.screenshot({path:`${output}/${variantId||state.fieldwork.variantId}-exposure-a-approach.png`});
 const reached=await snapshot();assert.ok(Math.hypot(reached.walker.x-p.x,reached.walker.z-p.z)*u<2.8,'Actual approach must be inside the three-metre interaction boundary');
 await page.waitForFunction(()=>document.querySelector('[data-research-station]')?.disabled===false,{},{timeout:2500});await page.locator('[data-research-station]').click();await page.locator('.research-station[open]').waitFor();
}
async function observe(definition,variantId){
 await approach(variantId);await page.locator('select[name=texture]').selectOption(definition.texture);await page.locator('select[name=grain]').selectOption(definition.grain);
 if(await page.locator('select[name=mapScope]').count()){await page.locator('select[name=mapScope]').selectOption('context-not-proof');await page.getByRole('button',{name:'Save exposure observation',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('button[form=researchFormActive]')?.disabled===false,{},{timeout:35000});}
 await page.getByRole('button',{name:'Save exposure observation',exact:true}).click();await page.locator('.research-station').waitFor({state:'hidden'});
}
try{
 await guard.start();
 browserServer=await chromium.launchServer({channel:'chrome',headless:true,host:'127.0.0.1'});
 report.ownedBrowserPid=browserServer.process().pid;
 browser=await chromium.connect(browserServer.wsEndpoint());
 page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.providerErrors.push(m.text().replace(/https?:\/\/\S+/g,'[provider]'));});
 await page.addInitScript(()=>{const Native=globalThis.Worker;window.__qaOverview=[];globalThis.Worker=class extends Native{constructor(url,options){super(url,options);if(!String(url).includes('overview'))return;const start=performance.now(),log=(type,detail={})=>window.__qaOverview.push({type,at:performance.now()-start,...detail});log('created',{url:String(url)});this.addEventListener('message',e=>log('received',{messageType:e.data?.type}));this.addEventListener('error',e=>log('error',{message:e.message}));const post=this.postMessage.bind(this);this.postMessage=(packet,...args)=>{log('sent',{messageType:packet?.type});return post(packet,...args);};}};});
 await page.goto(`${base}/app/?diagnostics=1`);
 if(recovery)await page.evaluate(async backup=>{const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js?v=5');await createIndexedDbDiscoveryProfileStore().importData(backup);},recovery);
 await page.getByRole('button',{name:'⌖ Activities',exact:true}).click();await page.locator('[data-experience-id="career:geologist"]').click();await page.locator('[data-experience-begin]').click();
 const initial=await waitForCourse('campaign'),sampleIds=[];
 assert.equal(initial.colliders,3);await record('Actual Earth course qualified and three physical prop colliders published');
 await page.screenshot({path:`${output}/course.png`});
 if(process.env.WE3D_GEOLOGY_QUALIFY_ONLY==='1'){
  assert.equal(recovery,null,'Placement verification uses a new course');
  report.scope='Actual new source-world site qualification, mapped footpath clearance and solid prop contact. Completed science procedures are reused from the separate accepted source-world receipt.';
  report.placement=await page.evaluate(async()=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55'),{earthCoordinateFrame}=await import('/app/js/earth-core/coordinate-frame.js?v=1'),{isGroundStreet}=await import('/app/js/world/compiler/street-frontage-policy.js');
   const site=(await ctx.discoveryProfileStore.getProfile()).researchCareers.geology.active.site,frame=earthCoordinateFrame(ctx.LOC,ctx.SCALE),unit=ctx.METERS_PER_WORLD_UNIT||1.11;
   const paths=(ctx.linearFeatures||[]).filter(f=>['footway','cycleway','track','path','stairs'].includes(f.kind)&&isGroundStreet(f));
   const clearance={};
   for(const [id,location] of Object.entries(site.points)){
    let minimum=Infinity;
    const p=frame.toWorld(location.lat,location.lon);
    for(const path of paths)for(let i=1;i<(path.pts?.length||0);i++){
     const a=path.pts[i-1],b=path.pts[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
     minimum=Math.min(minimum,Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t)*unit-(Number(path.width)||6)*unit/2);
    }
    clearance[id]=minimum;
   }
   return {siteId:site.id,mappedPaths:paths.length,stationDistanceToPathEdgeMeters:clearance};
  });
  assert.ok(report.placement.mappedPaths>0);assert.ok(report.placement.stationDistanceToPathEdgeMeters.a>=3.5);assert.ok(report.placement.stationDistanceToPathEdgeMeters.b>=3.5);assert.ok(report.placement.stationDistanceToPathEdgeMeters.bench>=1.5);
  await approach('clearance');await page.keyboard.press('Escape');
  const before=await snapshot(),p=before.fieldwork.target;
  assert.equal(before.paused,false,'Closing the station must not pause the world');
  await page.evaluate(async p=>{const {ctx}=await import('/app/js/shared-context.js?v=55'),w=ctx.Walk.state.walker;w.yaw=Math.atan2(w.x-p.x,w.z-p.z);w.lookYawOffset=0;ctx.renderer.domElement.focus({preventScroll:true});},p);
  await page.keyboard.down('w');await page.waitForTimeout(500);await page.keyboard.up('w');const away=await snapshot();
  const movedAway=Math.hypot(away.walker.x-before.walker.x,away.walker.z-before.walker.z)*away.unit;
  assert.ok(movedAway>.25,'The unpaused world must visibly advance keyboard walking before checking contact');
  await page.evaluate(async p=>{const {ctx}=await import('/app/js/shared-context.js?v=55'),w=ctx.Walk.state.walker;w.yaw=Math.atan2(p.x-w.x,p.z-w.z);w.lookYawOffset=0;ctx.renderer.domElement.focus({preventScroll:true});},p);
  await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');
  const after=await snapshot(),distance=Math.hypot(after.walker.x-p.x,after.walker.z-p.z)*after.unit;
  assert.ok(distance>=2.2&&distance<3,'The solid outcrop stops the approaching walker outside its footprint');
  assert.ok(Math.hypot(after.walker.x-away.walker.x,after.walker.z-away.walker.z)*after.unit>.15);
  assert.equal(after.paused,false);assert.equal(after.walker.onGround,true);report.placement.contactDistanceMeters=distance;report.placement.movementCalibrationMeters=movedAway;
  await page.screenshot({path:`${output}/solid-contact.png`});await record('Mapped paths stay clear; actual held-key approach stops at the solid exposure');
 }else{
 for(const [variantId,study] of Object.entries(GEOLOGY_STUDIES)){
  if(variantId!=='campaign'){
   await page.getByRole('button',{name:'Choose next study',exact:true}).click();
   await page.locator('[data-experience-variant]').selectOption(variantId);
   await page.locator('[data-experience-begin]').click();
   const next=await waitForCourse(variantId);assert.equal(next.worldSequence,initial.worldSequence);assert.equal(next.colliders,3);
  }
  if(!(recovery&&variantId==='campaign')){
   await observe(study.a,variantId);await record(`${variantId}: exposure A reached by keyboard walking and recorded`);
   await observe(study.b,variantId);await record(`${variantId}: exposure B comparison and real-map limitation recorded`);
   for(const id of ['a','b']){
    await approach(variantId);await page.locator('select[name=labelSite]').selectOption(id);await page.locator('select[name=labelLayer]').selectOption('face-'+id);await page.getByRole('button',{name:'Label and collect sample '+id.toUpperCase(),exact:true}).click();await page.locator('.research-station').waitFor({state:'hidden'});
   }
  }
  const collected=await record(recovery&&variantId==='campaign'?'Previously walked observations and specimens restored from actual source checkpoint':`${variantId}: both specimens labeled and collected at their physical faces`);
  if(variantId==='campaign'){
   // Reopen through the same public Activities adapter in the loaded world.
   await page.locator('[data-research-pause]').click();
   await page.locator('#exploreBtn').click();await page.locator('#fWorldDiscovery').click();await page.locator('#sandboxNearbyActivities').click();await page.getByRole('tab',{name:'Careers',exact:true}).click();await page.locator('[data-experience-id="career:geologist"]').click();
   await page.locator('[data-experience-begin]').click();const resumed=await waitForCourse(variantId);
   assert.equal(resumed.fieldwork.phase,'bench');assert.equal(resumed.fieldwork.samples.length,2);assert.equal(resumed.fieldwork.siteId,collected.fieldwork.siteId);assert.equal(resumed.worldSequence,collected.worldSequence);
   await record('Pause and public adapter resume retain the same world, site and specimen custody');
  }
  await approach(variantId);
  for(const id of ['a','b'])for(const method of ['lens','scratch']){
   const target=page.locator(`[data-research-test="${method}"][data-sample="${id}"]`);await target.click();await page.waitForFunction(({id,method})=>document.querySelector(`[data-research-test="${method}"][data-sample="${id}"]`)?.disabled,{id,method});
  }
  await page.locator('select[name=a]').selectOption(study.a.classification);await page.locator('select[name=b]').selectOption(study.b.classification);await page.getByRole('button',{name:'Save sample comparison',exact:true}).click();
  await page.locator('select[name=interpretation]').waitFor();await page.screenshot({path:`${output}/${variantId}-comparison.png`});await page.locator('select[name=interpretation]').selectOption(study.interpretation);await page.getByRole('button',{name:'Save field report',exact:true}).click();await page.getByRole('button',{name:'Choose next study',exact:true}).waitFor();
  const finished=await record(`${variantId}: physical five-stage study saved its supported field report`);assert.equal(finished.fieldwork.phase,'complete');
  await page.screenshot({path:`${output}/${variantId}-complete.png`});
  const savedIds=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return Object.values((await ctx.discoveryProfileStore.getProfile()).researchCareers.geology.active.samples).map(row=>row.instanceId);});sampleIds.push(...savedIds);
 }
 report.saved=await page.evaluate(async ids=>{const {ctx}=await import('/app/js/shared-context.js?v=55'),state=(await ctx.discoveryProfileStore.getProfile()).researchCareers.geology;return {phase:state.active.phase,completed:state.completed,items:(await ctx.discoveryProfileStore.getItemsById(ids)).map(row=>({instanceId:row.instanceId,face:row.researchLabel.face,tradeable:row.tradeable}))};},sampleIds);
 assert.equal(report.saved.items.length,6);assert.ok(report.saved.items.every(row=>row.tradeable===false));assert.deepEqual(Object.keys(report.saved.completed).sort(),Object.keys(GEOLOGY_STUDIES).sort());
 await page.getByRole('button',{name:'View Journal',exact:true}).click();
 for(const study of Object.values(GEOLOGY_STUDIES))await page.locator('#discoveryJournalList .discoveryJournalEvent').filter({has:page.getByText(study.label+' · field report',{exact:true})}).waitFor({state:'visible'});
 await page.screenshot({path:`${output}/journal.png`});await record('All three actual field reports are visible in the public Journal');
 await page.locator('#discoveryProfileBtn').click();const badge=page.locator('[data-explorer-badge="geologist-field-survey"]');await badge.waitFor({state:'attached'});
 await badge.locator('xpath=ancestor::details[1]/summary').click();assert.equal(await badge.isVisible(),true);await page.screenshot({path:`${output}/profile-badge.png`});await record('The public Explorer Profile displays the earned Geologist badge');
 }
 assert.deepEqual(report.errors,[]);
 report.ok=true;await fs.writeFile(`${output}/receipt.json`,JSON.stringify(report,null,2)+'\n');console.log('PASS '+report.scope+' '+output);
}catch(error){report.ok=false;report.failure=error.stack;report.host=guard.snapshot();try{report.last=await snapshot();report.workerTrace=await page.evaluate(()=>window.__qaOverview||[]);await page.screenshot({path:`${output}/failed.png`});}catch{}await fs.writeFile(`${output}/failed.json`,JSON.stringify(report,null,2)+'\n');throw error;}
finally{guard.dispose();if(browser)await browser.close().catch(()=>{});if(browserServer)await browserServer.close().catch(()=>{});}
