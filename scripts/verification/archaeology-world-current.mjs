import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ARCHAEOLOGY_STUDIES} from '../../app/js/campaign/archaeology-career.js';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
const output=`output/verification/archaeology-career-20261102/world-${Date.now()}`;
let recovery=null,recoveredFrom=null;
if(process.env.WE3D_ARCHAEOLOGY_RECOVERY){
 const source=path.resolve(process.env.WE3D_ARCHAEOLOGY_RECOVERY);
 assert.ok(source.startsWith(path.resolve('output/verification/archaeology-career-20261102')+path.sep)&&path.basename(source)==='qa-fieldwork-backup.json');
 const bytes=await fs.readFile(source);recovery=JSON.parse(bytes);assert.ok(recovery.profile?.researchCareers?.archaeology?.active);assert.notEqual(recovery.profile.researchCareers.archaeology.active.phase,'complete');
 recoveredFrom={source,sha256:createHash('sha256').update(bytes).digest('hex'),scope:'Actual source checkpoint; completed field steps are retained, not replayed.'};
}
const qa=await createFieldworkQaSession({output,careerId:'archaeology'}),{page,report}=qa;
try{
 await page.goto((process.env.WE3D_PREVIEW_URL||'http://127.0.0.1:4192')+'/app/?diagnostics=1');
 if(recovery){await page.evaluate(async data=>{const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js?v=5');await createIndexedDbDiscoveryProfileStore().importData(data);},recovery);report.recoveredFrom=recoveredFrom;}
 const currentVariant=recovery?.profile.researchCareers.archaeology.active.variantId||'campaign';
 await page.getByRole('button',{name:'⌖ Activities',exact:true}).click();await page.locator('[data-experience-id="career:archaeologist"]').click();
 if(currentVariant!=='campaign')await page.locator('[data-experience-variant]').selectOption(currentVariant);
 await page.locator('[data-experience-begin]').click();
 const initial=await qa.waitForCareer(currentVariant);assert.equal(initial.fieldwork.presentation.colliders,4);assert.ok(initial.fieldwork.presentation.meshes<=128);assert.ok(initial.fieldwork.presentation.vertices<=50000);
 await qa.record('Fictional archaeology site admitted with four stations, bounded scene lease and four physical blockers');
 // Use the existing public lighting control to inspect the new physical site.
 if(await page.locator('#quickTimeOfDay').isVisible()){
  for(let i=0;i<6;i++){const mode=await page.locator('#quickTimeOfDay').getAttribute('data-mode');if(mode==='day')break;await page.locator('#quickTimeOfDay').click();}
  await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.renderer.domElement.focus({preventScroll:true});});
 }
 if(process.env.WE3D_ARCHAEOLOGY_PRESENTATION_ONLY==='1'){
  report.scope='Affected physical presentation and contact boundary only. The three completed cases, storage and responsive station evidence are reused from their accepted receipts.';
  assert.equal(recovery,null);await qa.approach();await page.keyboard.press('Escape');let live=await qa.snapshot();assert.equal(live.paused,false);assert.equal(live.focusedWorld,true);
  const trench=await qa.approach({stationId:'trench',open:false}),before=await qa.snapshot();
  await page.evaluate(async p=>{const {ctx}=await import('/app/js/shared-context.js?v=55'),w=ctx.Walk.state.walker;w.yaw=Math.atan2(w.x-p.x,w.z-p.z);w.lookYawOffset=0;},trench);
  await page.keyboard.down('w');await page.waitForTimeout(500);await page.keyboard.up('w');const away=await qa.snapshot();
  const calibration=Math.hypot(away.walker.x-before.walker.x,away.walker.z-before.walker.z)*away.unit;assert.ok(calibration>.25);
  await page.evaluate(async p=>{const {ctx}=await import('/app/js/shared-context.js?v=55'),w=ctx.Walk.state.walker;w.yaw=Math.atan2(p.x-w.x,p.z-w.z);w.lookYawOffset=0;w.pitch=-.3;},trench);
  await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');live=await qa.snapshot();
  const contact=Math.hypot(live.walker.x-trench.x,live.walker.z-trench.z)*live.unit;
  report.contact={calibrationMeters:calibration,contactMeters:contact};
  assert.equal(live.paused,false);assert.equal(live.walker.onGround,true);assert.ok(contact>=.95&&contact<1.5);assert.ok(Math.hypot(live.walker.x-away.walker.x,live.walker.z-away.walker.z)*live.unit>.15);
  await page.screenshot({path:`${output}/trench-day-contact.png`});await qa.record('Positive unpaused walking stops at the solid freestanding trench');
  for(const mode of ['sunset','night']){
   for(let i=0;i<6;i++){if(await page.locator('#quickTimeOfDay').getAttribute('data-mode')===mode)break;await page.locator('#quickTimeOfDay').click();}
   await page.waitForTimeout(250);await page.screenshot({path:`${output}/trench-${mode}.png`});
  }
  report.materials=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55'),root=ctx.scene.getObjectByName('Fictional archaeology training yard'),materials=[];root?.traverse(row=>{if(row.isMesh&&row.material?.color)materials.push({type:row.material.type,color:row.material.color.getHex(),roughness:row.material.roughness});});return{count:materials.length,uniqueColours:[...new Set(materials.map(row=>row.color))],rendererEncoding:ctx.renderer.outputEncoding};});
  assert.ok(report.materials.uniqueColours.length>=8);await qa.record('The same site captured in day, sunset and night with explicit material encoding');
 }else{
 const variants=Object.entries(ARCHAEOLOGY_STUDIES),startIndex=variants.findIndex(([id])=>id===currentVariant);
 for(const [index,[variantId,study]] of variants.entries()){
  if(index<startIndex){assert.ok(recovery.profile.researchCareers.archaeology.completed[variantId]);continue;}
  if(index>startIndex){await page.getByRole('button',{name:'Choose next case',exact:true}).click();await page.locator('[data-experience-variant]').selectOption(variantId);await page.locator('[data-experience-begin]').click();const loaded=await qa.waitForCareer(variantId);assert.equal(loaded.worldSequence,initial.worldSequence);assert.equal(loaded.fieldwork.presentation.colliders,4);}
  let state=await qa.careerState();
  if(state.active.phase==='brief'){
   await qa.approach();await page.locator('select[name=feature]').selectOption(study.feature);await qa.submit('Record feature observation');await qa.record(`${variantId}: visible feature inspected at its physical station`);
  }
  state=await qa.careerState();
  if(state.active.phase==='survey'){
   await qa.approach();
   if(!state.active.grid){await page.locator('select[name=orientation]').selectOption('north');await page.locator('select[name=unit]').selectOption('metre');await qa.submit('Lay the survey grid');}
   state=await qa.careerState();
   for(const [target,relation] of [['feature','north-of'],['bench','south-east-of']])if(!state.active.measurements[target]){
    await page.locator('select[name=relation]').selectOption(relation);await qa.submit('Measure and record relationship');
   }
   await qa.record(`${variantId}: north-aligned metre grid and two measured spatial relationships saved`);
  }
  state=await qa.careerState();
  if(state.active.phase==='excavate'){
   await qa.approach();
   while((state=await qa.careerState()).active.phase==='excavate'){
    const layer=study.layers[state.active.layerIndex];
    let depth=state.active.excavation[layer.id]||0;
    while(depth<layer.thicknessCm){await page.locator('select[name=tool]').selectOption(layer.thicknessCm-depth>5?'trowel':'brush');await qa.submit('Expose the next 5 cm');depth+=5;}
    state=await qa.careerState();
    if(!state.active.contexts[layer.id]){
     await page.locator('input[name=contextId]').fill(layer.id);await page.locator('select[name=cell]').selectOption(layer.cell);await page.locator('select[name=fabric]').selectOption(layer.fabric);await page.locator('select[name=orientation]').selectOption(layer.orientation);await page.locator('select[name=relationship]').selectOption(state.active.layerIndex===0?'above-next':'below-previous');await qa.submit('Save context before lifting');
     await qa.record(`${variantId}: Context ${layer.id} recorded before removal`);
    }
    if(variantId==='campaign'&&state.active.layerIndex===0){
     await page.locator('[data-research-close]').click();const walking=await qa.snapshot();assert.equal(walking.paused,false);await page.screenshot({path:`${output}/exposed-trench-day.png`});
     // Same station and supported feet; show the actual exposed find and tools.
     await page.locator('[data-research-station]').click();
    }
    await page.locator('select[name=packing]').selectOption(layer.artifact.packing);await qa.submit('Pack and lift contextual find');
   }
   await qa.record(`${variantId}: labelled finds lifted with their exact contexts and required support`);
  }
  state=await qa.careerState();
  if(state.active.phase==='lab'){
   if(variantId==='campaign'){
    const before=await qa.snapshot();await page.locator('[data-research-pause]').click();await page.locator('#exploreBtn').click();await page.locator('#fWorldDiscovery').click();await page.locator('#sandboxNearbyActivities').click();await page.getByRole('tab',{name:'Careers',exact:true}).click();await page.locator('[data-experience-id="career:archaeologist"]').click();await page.locator('[data-experience-begin]').click();const resumed=await qa.waitForCareer(variantId);
    assert.equal(resumed.worldSequence,before.worldSequence);assert.equal(resumed.fieldwork.siteId,before.fieldwork.siteId);assert.deepEqual(resumed.fieldwork.items,before.fieldwork.items);assert.equal(resumed.fieldwork.phase,'lab');await qa.record('Public Activities resume preserves the same world, trench records and exact find custody');
   }
   await qa.approach();state=await qa.careerState();
   for(const layer of study.layers)for(const method of ['material','wear'])if(!state.active.tests[`${layer.id}:${method}`])await qa.submit('',()=>page.locator(`[data-research-action=test][data-context-id="${layer.id}"][data-method="${method}"]`).click());
   for(const layer of study.layers)await page.locator(`select[name=material${layer.id}]`).selectOption(layer.artifact.material);
   await qa.submit('Save contextual catalog');await qa.record(`${variantId}: material, wear and contextual catalog examined at the physical bench`);
  }
  state=await qa.careerState();
  if(state.active.phase==='interpretation'){
   if(!await page.locator('.research-station').isVisible())await qa.approach();
   await page.locator('select[name=interpretation]').selectOption(study.interpretation);await page.locator('select[name=alternative]').selectOption(study.alternative);await page.locator('select[name=conservation]').selectOption(study.conservation);await qa.submit('Save site report and conservation plan');
   await qa.record(`${variantId}: supported interpretation, retained alternative and conservation report saved`);
  }
  assert.equal((await qa.careerState()).active.phase,'complete');await page.screenshot({path:`${output}/${variantId}-report.png`});
 }
 const completed=await qa.careerState();assert.deepEqual(Object.keys(completed.completed).sort(),Object.keys(ARCHAEOLOGY_STUDIES).sort());
 await page.getByRole('button',{name:'View Journal',exact:true}).click();
 for(const study of Object.values(ARCHAEOLOGY_STUDIES))await page.locator('#discoveryJournalList .discoveryJournalEvent').filter({has:page.getByText(study.label+' · site report',{exact:true})}).waitFor({state:'visible'});
 const latest=page.locator('#discoveryJournalList .archaeology-report').first();await latest.locator('summary').click();assert.match(await latest.textContent(),/supported block specialist care/);await page.screenshot({path:`${output}/journal-contextual-report.png`});await qa.record('All three site reports visible in Journal, with the saved contextual catalog and conservation details');
 await page.locator('#discoveryProfileBtn').click();const badge=page.locator('[data-explorer-badge="archaeological-survey"]');await badge.waitFor({state:'attached'});await badge.locator('xpath=ancestor::details[1]/summary').click();assert.equal(await badge.isVisible(),true);await page.screenshot({path:`${output}/profile-badge.png`});await qa.record('Explorer Profile displays the earned Archaeological Survey badge');
 report.saved={completed:completed.completed,artifactCount:await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return(await ctx.discoveryProfileStore.listItems(100)).filter(row=>row.researchLabel?.careerId==='archaeology'&&row.tradeable===false).length;})};assert.equal(report.saved.artifactCount,6);
 }
 await qa.succeed();
}catch(error){await qa.fail(error);throw error;}finally{await qa.close();}
