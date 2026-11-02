import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const output='output/verification/geology-career-20261102';
await fs.mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4403,4404]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={scope:'Actual IndexedDB atomicity and station UI with explicitly controlled position; this is not physical world acceptance',checks:[],errors:[]};
try{
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/experience-browser.html`);
 report.checks=await page.evaluate(async()=>{
  const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js');
  const {GEOLOGY_STUDIES}=await import('/app/js/campaign/geology-career.js');
  const store=createIndexedDbDiscoveryProfileStore(),checks=[],study=GEOLOGY_STUDIES.campaign;
  const check=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
  const site={id:'virtual-geology:storage',name:'Virtual geology course',truthType:'virtual-training-site',location:{lat:39.3189,lon:-76.6363},points:{a:{lat:39.3189,lon:-76.6363},b:{lat:39.3189,lon:-76.6361},bench:{lat:39.319,lon:-76.6362}}};
  let now=1000,state=(await store.getProfile()).researchCareers.geology;
  await store.saveProfile(p=>({...p,retainedFutureField:{keep:true}}));
  const command=(type,target,extra={})=>({type,revision:state.revision,...extra,evidence:{environment:'EARTH',travelMode:'walk',supported:true,verticalDistance:0,liveGps:false,position:site.points[target],siteId:site.id,at:now}});
  const step=async(type,target,extra={})=>{const row=await store.updateResearchCareer('geology',command(type,target,extra),{now});state=row.state;return row;};
  state=(await store.updateResearchCareer('geology',{type:'accept',revision:state.revision,runId:'storage-study',variantId:'campaign',site},{now})).state;
  await step('observe','a',{texture:study.a.texture,grain:study.a.grain});await step('observe','b',{texture:study.b.texture,grain:study.b.grain,mapScope:'context-not-proof',map:{status:'unavailable',checkedAt:now}});
  const original=IDBObjectStore.prototype.put;let injected=false;
  IDBObjectStore.prototype.put=function(row,...args){if(this.name==='items'&&row.researchLabel?.careerId==='geology'){injected=true;throw new DOMException('Injected disk failure','QuotaExceededError');}return original.call(this,row,...args);};
  let failed=false;try{await step('collect','a',{sampleId:'a',labelSite:'a',labelLayer:'face-a'});}catch{failed=true;}finally{IDBObjectStore.prototype.put=original;}
  const backup=await store.exportData();
  check(failed&&injected&&backup.items.length===0&&!(await store.hasClaim('claim:research:storage-study:sample:a'))&&backup.profile.researchCareers.geology.revision===3&&backup.events.length===3,'failed sample write rolls back specimen, claim, event and career together');
  const collect=command('collect','a',{sampleId:'a',labelSite:'a',labelLayer:'face-a'});
  const raced=await Promise.allSettled([store.updateResearchCareer('geology',collect,{now}),store.updateResearchCareer('geology',collect,{now})]);
  state=(await store.getProfile()).researchCareers.geology;
  check(raced.filter(row=>row.status==='fulfilled').length===1&&(await store.listItems()).length===1,'concurrent collection commits one labeled specimen');
  const abort=new AbortController();let aborted=false;
  IDBObjectStore.prototype.put=function(row,...args){const result=original.call(this,row,...args);if(this.name==='items'&&row.researchLabel?.face==='b')abort.abort('world-changed');return result;};
  try{await store.updateResearchCareer('geology',command('collect','b',{sampleId:'b',labelSite:'b',labelLayer:'face-b'}),{now,signal:abort.signal});}catch{aborted=true;}finally{IDBObjectStore.prototype.put=original;}
  check(aborted&&(await store.getProfile()).researchCareers.geology.revision===4&&(await store.listItems()).length===1,'world-change abort during specimen write preserves prior custody');
  await step('collect','b',{sampleId:'b',labelSite:'b',labelLayer:'face-b'});
  const reloaded=createIndexedDbDiscoveryProfileStore();state=(await reloaded.getProfile()).researchCareers.geology;
  check(state.active.phase==='bench'&&(await reloaded.getItemsById(Object.values(state.active.samples).map(row=>row.instanceId))).length===2,'fresh store resumes bench with both exact specimen IDs');
  let missing=false;try{await step('test','bench',{sampleId:'a',method:'lens',custody:[]});}catch{missing=true;}
  check(missing,'stored or absent specimens cannot be used at the bench');
  for(const sampleId of ['a','b'])for(const method of ['lens','scratch'])await step('test','bench',{sampleId,method,custody:Object.values(state.active.samples).map(row=>row.instanceId)});
  await step('classify','bench',{classifications:{a:study.a.classification,b:study.b.classification}});await step('interpret','bench',{interpretation:study.interpretation});
  const saved=await reloaded.exportData();await reloaded.importData(saved);
  check(saved.events.length===11&&state.active.phase==='complete'&&(await reloaded.getProfile()).retainedFutureField.keep,'full same-timestamp report restores with exact revision and retains unrelated profile fields');
  const broken=structuredClone(saved);broken.items=[];let rejected=false;try{await reloaded.importData(broken);}catch{rejected=true;}
  check(rejected&&(await reloaded.getItemsById(Object.values(state.active.samples).map(row=>row.instanceId))).length===2,'incomplete specimen backup is rejected without replacing current data');
  return checks;
 });
 await context.close();
 for(const [width,height] of [[390,844],[844,390],[1440,960]]){
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/geology-station.html`);await page.locator('#open').click();
  await page.locator('select[name=texture]').selectOption('interlocking-crystals');await page.locator('select[name=grain]').selectOption('coarse');
  if(width===390){
   await page.evaluate(()=>{window.geologyCheck.failNextSave=true;});await page.getByRole('button',{name:'Save exposure observation',exact:true}).click();await page.getByRole('status').filter({hasText:'could not save'}).waitFor();
   assert.equal(await page.locator('select[name=texture]').inputValue(),'interlocking-crystals');report.checks.push('failed station save retains form and permits a retry');
  }
  await page.screenshot({path:`${output}/${width}-exposure.png`});
  await page.getByRole('button',{name:'Save exposure observation',exact:true}).click();await page.locator('dialog').waitFor({state:'hidden'});await page.locator('#open').click();
  await page.locator('select[name=texture]').selectOption('rounded-grains');await page.locator('select[name=grain]').selectOption('medium');await page.locator('select[name=mapScope]').selectOption('context-not-proof');await page.getByRole('button',{name:'Save exposure observation',exact:true}).click();await page.locator('dialog').waitFor({state:'hidden'});
  await page.reload();await page.locator('#open').click();assert.equal(await page.locator('h2').textContent(),'Label sample A before collecting');
  for(const id of ['a','b']){
   await page.locator(`select[name=labelSite]`).selectOption(id);await page.locator(`select[name=labelLayer]`).selectOption('face-'+id);await page.getByRole('button',{name:'Label and collect sample '+id.toUpperCase(),exact:true}).click();
   await page.locator('dialog').waitFor({state:'hidden'});await page.locator('#open').click();
  }
  assert.equal(await page.getByRole('button',{name:'Save sample comparison',exact:true}).isDisabled(),true);
  for(const id of ['a','b'])for(const method of ['lens','scratch']){await page.locator(`[data-research-test="${method}"][data-sample="${id}"]`).click();await page.locator(`[data-research-test="${method}"][data-sample="${id}"]`).waitFor();await page.waitForFunction(({id,method})=>document.querySelector(`[data-research-test="${method}"][data-sample="${id}"]`)?.disabled,{id,method});}
  if(width===390)await page.evaluate(()=>{window.geologyCheck.map={status:'reference',fetchedAt:Date.now(),items:[{name:'Unreviewed fresh context',material:'Fresh lookup',citation:'Presentation check'}]};});
  await page.locator('select[name=a]').selectOption('igneous');await page.locator('select[name=b]').selectOption('sedimentary');
  await page.screenshot({path:`${output}/${width}-bench.png`});await page.getByRole('button',{name:'Save sample comparison',exact:true}).click();await page.locator('select[name=interpretation]').waitFor();
  if(width===390){assert.equal(await page.getByText('Unreviewed fresh context',{exact:true}).count(),0);assert.ok(await page.getByText('The map source is unavailable.',{exact:false}).count());report.checks.push('interpretation shows the recorded map evidence rather than an unreviewed fresh lookup');}
  await page.locator('select[name=interpretation]').selectOption('different-processes-age-uncertain');await page.getByRole('button',{name:'Save field report',exact:true}).click();await page.getByRole('button',{name:'Choose next study',exact:true}).waitFor();
  assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth>innerWidth),false);
  const button=page.getByRole('button',{name:'Choose next study',exact:true});await button.scrollIntoViewIfNeeded();
  const bounds=await button.boundingBox();assert.ok(bounds.height>=44&&bounds.y>=0&&bounds.y+bounds.height<=height);
  await page.screenshot({path:`${output}/${width}-report.png`});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#open').evaluate(el=>document.activeElement===el),true);
  report.checks.push(`${width}×${height}: full station controls, reload, disabled prerequisites, report map and keyboard focus pass`);
  await context.close();
 }
 assert.deepEqual(report.errors,[]);report.ok=true;
 await fs.writeFile(`${output}/receipt.json`,JSON.stringify(report,null,2)+'\n');console.log('PASS '+report.checks.length+' geology storage/UI checks. Physical world acceptance remains separate.');
}catch(error){report.ok=false;report.failure=error.stack;await fs.writeFile(`${output}/failed-${Date.now()}.json`,JSON.stringify(report,null,2)+'\n');throw error;}
finally{await browser.close();await server.close();}
