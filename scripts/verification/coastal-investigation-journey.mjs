import {verifyOceanEcology,verifyOceanEcologySwitch} from './ocean-ecology-observation.mjs';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
export async function verifyCoastalInvestigation({page,dir,report,goDeck,deploy}){
 report.controlScope='Real submarine controls under normal frames; actual diver controller advanced in bounded 0.05 s steps; deck controller stepping; not an uncoached playthrough.';
 const targetId=process.env.WE3D_DIVE_TARGET||'case';
 const phase=p=>page.waitForFunction(p=>marineCtx.marineResearch.investigation.snapshot().phase===p&&!marineCtx.marineResearch.investigation.snapshot().busy,p);
 const click=async(prefix='coastalOcean')=>{await page.locator(`#${prefix}Investigation`).evaluate(n=>n.open=true);await page.locator(`#${prefix}Investigate`).click();await page.waitForFunction(()=>!marineCtx.marineResearch.investigation.snapshot().busy);};
 const subTo=async(x,z,face='case')=>{
  const result=await page.evaluate(async({x,z,face})=>{const ctx=marineCtx,sub=ctx.oceanMode.submarine,old=ctx.readControlActions;let a={};ctx.readControlActions=()=>a;
   try{for(let i=0;i<2400;i++){
    const dx=x-sub.position.x,dz=z-sub.position.z,d=Math.hypot(dx,dz),t=ctx.oceanMode.habitat.plan.contacts.find(t=>t.id===face),yaw=d>1?Math.atan2(dx,dz):Math.atan2(t.x-sub.position.x,t.z-sub.position.z),err=Math.atan2(Math.sin(yaw-sub.yaw),Math.cos(yaw-sub.yaw)),dy=-12-sub.position.y;
    if(d<1.2&&Math.abs(dy)<.6&&Math.abs(err)<.08&&Math.abs(sub.speed)<.4&&Math.abs(sub.verticalSpeed)<.4)return {ok:true,position:{...sub.position}};
    a={turn:Math.max(-1,Math.min(1,err*2)),move:d>1&&Math.abs(err)<.2?Math.min(.65,d/20):0,vertical:Math.abs(dy)>.2?Math.max(-1,Math.min(1,dy*.5)):0};await new Promise(requestAnimationFrame);
   }return {ok:false,position:{...sub.position},x,z};}finally{ctx.readControlActions=old;}
  },{x,z,face});assert.equal(result.ok,true,JSON.stringify(result));
 };
 const swimTo=async(target)=>{
  const result=await page.evaluate(async target=>{const ctx=marineCtx,diver=ctx.oceanMode.diver,old=ctx.readControlActions;let a={};ctx.readControlActions=()=>a;
   try{for(let i=0;i<2400;i++){
    const actor=diver.navigationActor(),p=actor.position,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz),dy=target.y-p.y,face=target.face||target,yaw=d>.7?Math.atan2(dx,dz):Math.atan2(face.x-p.x,face.z-p.z),err=Math.atan2(Math.sin(yaw-actor.yaw),Math.cos(yaw-actor.yaw));
    if(d<.85&&Math.abs(dy)<.3&&Math.abs(err)<.65&&actor.speed<.6&&Math.abs(actor.vy)<.6)return {ok:true,position:p,swimming:diver.snapshot().swimming};
    a={turn:Math.max(-1,Math.min(1,err*2)),move:d>.7&&Math.abs(err)<.2?Math.min(1,d*2):0,vertical:Math.abs(dy)>.08?Math.max(-1,Math.min(1,dy*2)):0};diver.update(.05,i*.05);if(i%30===0)await new Promise(requestAnimationFrame);
   }return {ok:false,target,actor:diver.navigationActor(),swimming:diver.snapshot().swimming};}finally{ctx.readControlActions=old;}
  },target);assert.equal(result.ok,true,JSON.stringify(result));return result;
 };
 await page.waitForFunction(()=>marineCtx.marineResearch.investigation.snapshot().ready);await click();await phase('sonar');
 const contacts=await page.evaluate(()=>marineCtx.oceanMode.habitat.plan.contacts);report.investigationTargets=contacts;
 assert.equal(contacts.length,3);assert.equal(await page.evaluate(()=>!!marineCtx.oceanMode.scene.getObjectByName('Modern research instrument case')),true);
 const center={x:contacts.reduce((sum,t)=>sum+t.x/3,0),z:contacts.reduce((sum,t)=>sum+t.z/3,0)};
 for(const t of contacts){await page.locator('#coastalOceanContact').selectOption(t.id);await subTo(center.x,center.z,t.id);await click();}
 await phase('chart');await click();await phase('selection');assert.equal(await page.evaluate(()=>marineCtx.marineResearch.investigation.snapshot().annotations.length),3);
 await page.screenshot({path:`${dir}/sonar-chart.png`});report.cases.push({id:'three-actual-contacts-real-submarine-controls-heading-and-annotated-map',passed:true});
 await page.locator('#coastalOceanContact').selectOption(targetId);await click();await phase('dive');
 const target=contacts.find(t=>t.id===targetId);await subTo(target.x+12,target.z-4,targetId);
 await page.locator('#oceanDiverToggle').click();await page.waitForFunction(()=>marineCtx.oceanMode.diver.active&&marineCtx.oceanMode.diver.snapshot().swimming?.airCapacity===300);
 const parked=await page.evaluate(()=>({...marineCtx.oceanMode.submarine.position}));
 await swimTo({x:target.x+3,y:target.y+2.1,z:target.z-2,face:target});await click('coastalDiver');assert.equal(await page.evaluate(()=>marineCtx.marineResearch.investigation.snapshot().views.length),1);
 await page.screenshot({path:`${dir}/direct-target-observation.png`});
 if(process.env.WE3D_ECOLOGY_CAPTURE==='1')await verifyOceanEcology({page,dir,report});
 await page.evaluate(()=>marineCtx.setPauseReason('investigation-check',true));const paused=await page.evaluate(()=>marineCtx.oceanMode.diver.snapshot());await page.waitForTimeout(250);const held=await page.evaluate(()=>marineCtx.oceanMode.diver.snapshot());assert.deepEqual(held.position,paused.position);assert.equal(held.swimming.airSeconds,paused.swimming.airSeconds);await page.evaluate(()=>marineCtx.setPauseReason('investigation-check',false));
 report.cases.push({id:'survey-scuba-reaches-chosen-target-first-view-pause-retains-air',passed:true});
 await page.evaluate(()=>marineCtx.oceanMode.diver.board(true));await page.locator('#oceanVoyageRecover').click();await page.waitForFunction(()=>marineCtx.boatDeck.active&&!marineCtx.oceanMode.active);await goDeck(6,-23.5);await page.getByLabel('Deck destination').selectOption('lab');await click('coastalDeck');assert.equal(await page.evaluate(()=>marineCtx.marineResearch.investigation.snapshot().phase),'dive');
 assert.equal(await page.evaluate(()=>marineCtx.marineResearch.investigation.snapshot().diver),false);report.cases.push({id:'assisted-partial-return-keeps-evidence-without-awarding-completion',passed:true});
 await deploy();await subTo(target.x+12,target.z-4,targetId);await page.locator('#oceanDiverToggle').click();await page.waitForFunction(()=>marineCtx.oceanMode.diver.active);
 await swimTo({x:target.x-2,y:target.y+2.1,z:target.z-2,face:target});await click('coastalDiver');await phase('return');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(650);const projected=await page.evaluate(()=>{const m=marineCtx.oceanMode,p=m.diver.navigationActor().position,v=new THREE.Vector3(p.x,p.y-.6,p.z).project(m.camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};});assert.ok(projected.x<195,'Portrait diver must stay left of the side panel: '+JSON.stringify(projected));await page.screenshot({path:`${dir}/diver-phone-return.png`});const panel=await page.locator('#oceanDiverControls').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=390);await page.setViewportSize({width:1440,height:900});
 // Return above the contact before crossing the submarine hull.
 await swimTo({x:target.x-2,y:-12,z:target.z-2});const sub=await page.evaluate(()=>({...marineCtx.oceanMode.submarine.position}));await swimTo({x:sub.x-6,y:sub.y,z:sub.z});
 const before=await page.evaluate(()=>({...marineCtx.oceanMode.submarine.position}));await page.locator('#oceanDiverToggle').click();await phase('report');assert.equal(await page.evaluate(()=>marineCtx.oceanMode.diver.active),false);assert.deepEqual(await page.evaluate(()=>({...marineCtx.oceanMode.submarine.position})),before);
 report.cases.push({id:'second-diver-view-normal-return-same-submarine-grants-badge-and-reserve',passed:true});
 await page.locator('#oceanVoyageRecover').click();await page.waitForFunction(()=>marineCtx.boatDeck.active&&!marineCtx.oceanMode.active);await goDeck(6,-23.5);await page.getByLabel('Deck destination').selectOption('lab');
 await page.locator('#coastalDeckInvestigation').evaluate(n=>n.open=true);await page.locator('#coastalDeckConclusion').selectOption('wreck');assert.equal(await page.locator('#coastalDeckInvestigate').isEnabled(),false);await page.locator('#coastalDeckConclusion').selectOption(targetId);await click('coastalDeck');await phase('complete');await page.screenshot({path:`${dir}/supported-coastal-report.png`});
 await deploy();await subTo(target.x+12,target.z-4,targetId);await page.locator('#oceanDiverToggle').click();await page.waitForFunction(()=>marineCtx.oceanMode.diver.snapshot().swimming?.airCapacity===360);
 await swimTo({x:target.x+3,y:target.y+2.1,z:target.z-2,face:target});await page.locator('#coastalDiverInvestigation').evaluate(n=>n.open=true);await page.locator('#coastalDiverContact').selectOption(targetId);await click('coastalDiver');await click('coastalDiver');
 const followups=await page.evaluate(async()=>(await marineCtx.discoveryProfileStore.listEvents(100)).filter(e=>e.eventId.startsWith('coastal-investigation-v1:followup:')));assert.equal(followups.length,1);assert.equal(followups[0].metadata.targetId,targetId);await page.screenshot({path:`${dir}/coastal-watch.png`});report.cases.push({id:'repeatable-direct-coastal-watch-record-is-physical-and-deduplicated',passed:true});
 await page.evaluate(()=>marineCtx.oceanMode.diver.board(true));await page.locator('#oceanVoyageRecover').click();await page.waitForFunction(()=>marineCtx.boatDeck.active&&!marineCtx.oceanMode.active);
 const saved=await page.evaluate(()=>marineCtx.discoveryProfileStore.exportData());report.investigationRecords=saved.events.filter(e=>e.sourceSystem==='coastal-investigation');await page.evaluate(async data=>{await marineCtx.discoveryProfileStore.importData(data);await marineCtx.marineResearch.investigation.refresh();},saved);assert.equal(await page.evaluate(()=>marineCtx.marineResearch.investigation.snapshot().completed),true);report.cases.push({id:'supported-lab-conclusion-actual-indexeddb-backup-roundtrip',passed:true});
 await page.reload();if(await page.locator('#landingPrimaryCta').isVisible())await page.locator('#landingPrimaryCta').click();await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});await page.evaluate(async()=>{window.marineCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});await page.locator('#oceanVoyageResume').click();await page.waitForFunction(()=>marineCtx.boatDeck.active&&marineCtx.marineResearch?.investigation.snapshot().ready,null,{timeout:90000});assert.equal(await page.evaluate(()=>marineCtx.marineResearch.investigation.snapshot().completed),true);
 await deploy();await page.locator('#oceanDiverToggle').click();await page.waitForFunction(()=>marineCtx.oceanMode.diver.snapshot().swimming?.airCapacity===360);report.cases.push({id:'real-reload-retains-badges-and-next-dive-uses-earned-air-reserve',passed:true});
 // Reuse the prescribed client's exact keyboard choreography on this owned,
 // already-attested game page. Normal RAF stepping retains the production loop.
 const source=await readFile(`${process.env.HOME}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'utf8');
 assert.ok(source.includes('main().catch((err) => {'));
 const adapter=resolve(dir,'prescribed-actions.mjs');await writeFile(adapter,source.slice(0,source.indexOf('main().catch((err) => {'))+'\nexport {doChoreography};\n');
 try{
  const {doChoreography}=await import(pathToFileURL(adapter));
  await page.evaluate(()=>{window.advanceTime=async ms=>{for(let left=ms;left>0;left-=1000/60)await new Promise(requestAnimationFrame);};window.render_game_to_text=()=>JSON.stringify({coordinateSystem:'x east, y up, z south; Ocean launch origin',diver:marineCtx.oceanMode.diver.snapshot(),submarine:{...marineCtx.oceanMode.submarine.position},investigation:marineCtx.marineResearch.investigation.snapshot().phase});});
  const before=await page.evaluate(()=>marineCtx.oceanMode.diver.snapshot().position);
  await doChoreography(page,await page.locator('#oceanModeCanvas').elementHandle(),[{buttons:['up'],frames:30},{buttons:['left'],frames:10},{buttons:[],frames:10}]);
  const after=await page.evaluate(()=>marineCtx.oceanMode.diver.snapshot().position);assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>.1);
  await page.screenshot({path:`${dir}/prescribed-keyboard.png`});await writeFile(`${dir}/prescribed-state.json`,await page.evaluate(()=>render_game_to_text()));
  report.cases.push({id:'prescribed-game-client-keyboard-burst-on-actual-attested-ocean-page',passed:true});
 }finally{await unlink(adapter);}
 report.investigation=await page.evaluate(()=>marineCtx.marineResearch.investigation.snapshot());
 if(process.env.WE3D_ECOLOGY_CAPTURE==='1')await verifyOceanEcologySwitch({page,dir,report});
}
