import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const output='output/verification/archaeology-career-20261102';
await fs.mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4403,4404]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={scope:'Actual IndexedDB transaction and native station UI with controlled position; separate physical-world acceptance required',checks:[],errors:[]};
try{
 if(process.env.WE3D_ARCHAEOLOGY_UI_ONLY==='1'){
  const accepted=JSON.parse(await fs.readFile(`${output}/storage-accepted.json`,'utf8'));assert.equal(accepted.ok,true);report.storageEvidence=`${output}/storage-accepted.json`;report.checks.push(...accepted.checks);
 }else{
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/experience-browser.html`);
 report.checks=await page.evaluate(async()=>{
  const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js'),{studyHarness}=await import('/tests/helpers/archaeology-study.mjs');
  const store=createIndexedDbDiscoveryProfileStore(),checks=[],h=studyHarness();h.survey();
  for(const tool of ['trowel','trowel','brush'])h.step('excavate',{tool});
  const layer=h.study.layers[0];h.step('context',{contextId:layer.id,cell:layer.cell,fabric:layer.fabric,orientation:layer.orientation,relationship:'above-next'});
  const commands=[...h.events];
  for(const event of commands.slice(0,-1))await store.updateResearchCareer('archaeology',event.metadata.action,{now:event.occurredAt});
  await store.saveProfile(p=>({...p,retainedFutureField:{keep:true}}));
  const check=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
  const put=IDBObjectStore.prototype.put;let failed=false;
  IDBObjectStore.prototype.put=function(row,...args){if(this.name==='events'&&row.metadata?.careerId==='archaeology'&&row.metadata.action.type==='context')throw new DOMException('Injected quota failure','QuotaExceededError');return put.call(this,row,...args);};
  try{const event=commands.at(-1);await store.updateResearchCareer('archaeology',event.metadata.action,{now:event.occurredAt});}catch{failed=true;}finally{IDBObjectStore.prototype.put=put;}
  check(failed&&!Object.keys((await store.getProfile()).researchCareers.archaeology.active.contexts).length,'failed context write rolls back record and career together');
  const event=commands.at(-1);await store.updateResearchCareer('archaeology',event.metadata.action,{now:event.occurredAt});
  const fresh=createIndexedDbDiscoveryProfileStore(),saved=(await fresh.getProfile()).researchCareers.archaeology;
  check(saved.active.contexts[layer.id].recordEventId===event.eventId,'fresh store resumes the exposed layer and exact pre-lift context');
  const command=h.command('collect',{packing:'labelled-box'}),before=await store.exportData();failed=false;
  IDBObjectStore.prototype.put=function(row,...args){if(this.name==='items'&&row.researchLabel?.careerId==='archaeology')throw new DOMException('Injected artifact failure','QuotaExceededError');return put.call(this,row,...args);};
  try{await store.updateResearchCareer('archaeology',command,{now:1000});}catch{failed=true;}finally{IDBObjectStore.prototype.put=put;}
  const after=await store.exportData();check(failed&&after.items.length===0&&after.events.length===before.events.length&&after.profile.researchCareers.archaeology.revision===saved.revision,'failed artifact write preserves context without granting a find, claim or event');
  const raced=await Promise.allSettled([store.updateResearchCareer('archaeology',command,{now:1000}),store.updateResearchCareer('archaeology',command,{now:1000})]);
  check(raced.filter(row=>row.status==='fulfilled').length===1&&(await store.listItems()).length===1,'two-tab collection grants one contextual find');
  h.step('collect',{packing:'labelled-box'});
  const lower=h.study.layers[1];for(const tool of ['trowel','trowel','brush'])h.step('excavate',{tool});h.step('context',{contextId:lower.id,cell:lower.cell,fabric:lower.fabric,orientation:lower.orientation,relationship:'below-previous'});h.step('collect',{packing:lower.artifact.packing});h.lab();h.report();
  const revision=(await store.getProfile()).researchCareers.archaeology.revision;
  for(const row of h.events.filter(row=>row.metadata.action.revision>=revision))await store.updateResearchCareer('archaeology',row.metadata.action,{now:row.occurredAt});
  const backup=await store.exportData();await fresh.importData(backup);
  check((await fresh.getProfile()).researchCareers.archaeology.active.phase==='complete'&&(await fresh.getProfile()).retainedFutureField.keep,'same-timestamp full report restores without losing unrelated profile data');
  const broken=structuredClone(backup);broken.events=broken.events.filter(row=>row.metadata?.action?.type!=='context');failed=false;
  try{await fresh.importData(broken);}catch{failed=true;}
  check(failed&&(await fresh.listItems()).length===2,'damaged context history cannot replace the current collection');
  return checks;
 });await context.close();
 await fs.writeFile(`${output}/storage-accepted.json`,JSON.stringify({ok:true,scope:'Actual IndexedDB transaction cases',checks:report.checks},null,2)+'\n');
 }
 for(const [width,height] of [[390,844],[844,390],[1440,960]]){
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  try{
   await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/archaeology-station.html`);await page.locator('#open').click();
   const submit=async(name,changesStation=false,expectFailure=false)=>{const revision=await page.evaluate(()=>JSON.parse(render_game_to_text()).revision);await page.getByRole('button',{name,exact:true}).click();if(expectFailure){await page.getByRole('status').filter({hasText:'could not save'}).waitFor();}else await page.waitForFunction(prior=>JSON.parse(render_game_to_text()).revision>prior,revision,{timeout:5000});if(changesStation){await page.locator('dialog').waitFor({state:'hidden'});assert.equal(await page.locator('#world').evaluate(el=>document.activeElement===el),true);await page.locator('#open').click();}};
   const footer=async()=>{const b=page.locator('.research-station-actions button').first(),r=await b.boundingBox();assert.ok(r.height>=44&&r.y>=0&&r.y+r.height<=height);assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth>innerWidth),false);};
   await page.locator('select[name=feature]').selectOption('stone-line');await footer();await submit('Record feature observation',true);
   await page.locator('select[name=orientation]').selectOption('north');await page.locator('select[name=unit]').selectOption('metre');await submit('Lay the survey grid');
   await page.locator('select[name=relation]').selectOption('north-of');await submit('Measure and record relationship');
   await page.locator('select[name=relation]').selectOption('south-east-of');await submit('Measure and record relationship',true);
   for(const [index,id] of ['102','101'].entries()){
    for(const tool of ['trowel','trowel','brush']){await page.locator('select[name=tool]').selectOption(tool);await submit('Expose the next 5 cm');}
    await page.locator('input[name=contextId]').fill(id);await page.locator('select[name=cell]').selectOption(index?'B1':'A1');await page.locator('select[name=fabric]').selectOption(index?'fine-with-charcoal':'angular-stone');await page.locator('select[name=orientation]').selectOption(index?'north-south':'east-west');await page.locator('select[name=relationship]').selectOption(index?'below-previous':'above-next');
    if(width===390&&index===0){await page.evaluate(()=>window.archaeologyCheck.failNextSave=true);await submit('Save context before lifting',false,true);assert.equal(await page.locator('input[name=contextId]').inputValue(),id);report.checks.push('failed station save keeps the complete context form for retry');}
    await footer();await page.screenshot({path:`${output}/${width}-context-${id}.png`});await submit('Save context before lifting');
    if(index===0){await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.archaeologyCheck.globalEscapes),0);await page.reload();await page.locator('#open').click();await page.locator('select[name=packing]').waitFor();}
    await page.locator('select[name=packing]').selectOption('labelled-box');await submit('Pack and lift contextual find',index===1);
   }
   assert.equal(await page.getByRole('button',{name:'Save contextual catalog',exact:true}).isDisabled(),true);
   for(const id of ['102','101'])for(const method of ['material','wear']){await page.locator(`[data-research-action=test][data-context-id="${id}"][data-method="${method}"]`).click();await page.waitForFunction(({id,method})=>document.querySelector(`[data-research-action=test][data-context-id="${id}"][data-method="${method}"]`)?.textContent==='Recorded',{id,method});}
   await page.locator('select[name=material102]').selectOption('ceramic');await page.locator('select[name=material101]').selectOption('ceramic');await footer();await page.screenshot({path:`${output}/${width}-lab.png`});await submit('Save contextual catalog');
   await page.locator('select[name=interpretation]').selectOption('later-cover-over-use');await page.locator('select[name=alternative]').selectOption('household-or-workshop');await page.locator('select[name=conservation]').selectOption('dry-padded-separate');await submit('Save site report and conservation plan');await page.getByRole('button',{name:'Choose next case',exact:true}).waitFor();await footer();await page.screenshot({path:`${output}/${width}-report.png`});
   report.checks.push(`${width}x${height}: five station stages, exact context reload, both finds, lab prerequisites, conservation, fixed footer and Escape ownership pass`);
  }catch(error){await page.screenshot({path:`${output}/${width}-failed-${Date.now()}.png`}).catch(()=>{});await fs.writeFile(`${output}/${width}-failed-state-${Date.now()}.json`,await page.evaluate(()=>render_game_to_text()).catch(()=> '{}'));throw error;}finally{await context.close();}
 }
 assert.deepEqual(report.errors,[]);report.ok=true;await fs.writeFile(`${output}/receipt.json`,JSON.stringify(report,null,2)+'\n');console.log('PASS '+report.checks.length+' archaeology storage/UI checks; physical course is separate.');
}catch(error){report.ok=false;report.failure=error.stack;await fs.writeFile(`${output}/failed-${Date.now()}.json`,JSON.stringify(report,null,2)+'\n');throw error;}
finally{await browser.close();await server.close();}
