import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {collectBrowserGraphicsErrors} from './browser-graphics-errors.mjs';
import {createExpeditionPlan} from '../../app/js/expedition/model.js';
const out='output/verification/ship-research';await fs.mkdir(out,{recursive:true});
const seed={...createExpeditionPlan({destinationId:'proxima-centauri',shipId:'long-range-research-vessel',propulsionId:'radiant-plasma-field-drive',realism:'science-inspired',survival:'forgiving'}),scienceSamples:[{id:'fixture-mars',label:'Mars basalt specimen',bodyId:'mars',massKg:3,truthClass:'modeled-game-sample'},{id:'fixture-moon',label:'Moon regolith specimen',bodyId:'moon',massKg:2,truthClass:'modeled-game-sample'}]};
seed.resources={...seed.resources,scienceCargoKg:5};
const server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||'dist',ports:[4497,4498]});
const base=`http://127.0.0.1:${server.port}`,browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1100,height:740}}),errors=[],checks=[];
collectBrowserGraphicsErrors(page,errors);page.on('pageerror',e=>errors.push(String(e)));
try{
 await configureStagingAppCheck(page,base);
 await page.addInitScript(seed=>{if(!localStorage.getItem('ship-research-fixture-seeded')){localStorage.setItem('world-explorer:interstellar-expedition:v1',JSON.stringify(seed));localStorage.setItem('ship-research-fixture-seeded','true');}},seed);
 await page.goto(`${base}/app/?launch=space`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.getElementById('startBtn')?.disabled===false,null,{timeout:120000});
 await page.evaluate(()=>{document.getElementById('spaceLaunchToggle')?.click();document.getElementById('startBtn')?.click();});
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text?.()||'{}').modes?.space===true,null,{timeout:180000});
 await page.evaluate(async()=>{window.__shipCheck=(await import('/app/js/shared-context.js?v=55')).ctx;});
 await page.locator('#fBoardSolisReach').click();
 await page.waitForFunction(()=>window.__shipCheck.getShipInteriorSnapshot?.()?.active===true,null,{timeout:60000});
 async function approach(id,deck){
  await page.evaluate(({id,deck})=>{
   const ctx=window.__shipCheck;ctx.switchSolisReachDeck(deck);
   const interaction=ctx.activeInterior.interactions.find(i=>i.id===id);if(!interaction)throw Error(`Missing ${id}`);
   const angles=Array.from({length:16},(_,i)=>i*Math.PI/8);
   const point=angles.map(a=>({x:interaction.x+Math.sin(a)*1.9,z:interaction.z+Math.cos(a)*1.9})).find(p=>!ctx.checkBuildingCollision?.(p.x,p.z,.35,{actorBaseY:0,actorHeight:1.8}).collision);
   if(!point)throw Error(`No clearance at ${id}`);
   const yaw=Math.atan2(interaction.x-point.x,interaction.z-point.z);
   Object.assign(ctx.Walk.state.walker,{...point,y:1.74,yaw,angle:yaw,pitch:0,lookYawOffset:0});ctx.Walk.state.view='first';ctx.presentationPose=null;
  },{id,deck});
  await page.waitForTimeout(400);
  // Activate the published interaction selected by proximity, using the same handler as E.
  await page.evaluate(id=>window.__shipCheck.handleShipInteriorInteraction(window.__shipCheck.activeInterior.interactions.find(i=>i.id===id)),id);
 }
 for(const [bench,deck] of [['science-bench','command'],['analysis-bench','command'],['fabrication-bench','engineering']]){
  await approach(bench,deck);
  for(const sample of ['fixture-mars','fixture-moon']){
   await page.getByLabel('Sample from cargo').selectOption(sample);
   await page.getByRole('button',{name:'Place selected specimen',exact:true}).click();
   await page.waitForFunction(({bench,sample})=>window.__shipCheck.getShipInteriorSnapshot().research.benches[bench]?.includes(sample),{bench,sample});
  }
  await page.screenshot({path:`${out}/${bench}-mounted.png`});
  if(bench==='fabrication-bench'){
   await page.getByRole('button',{name:'Fabricate composite repair stock',exact:true}).click();
   await page.waitForFunction(()=>window.__shipCheck.getShipInteriorSnapshot().research.lastFabrication?.outputKg===7);
  }else{
   await page.getByRole('button',{name:'Run measurement',exact:true}).click();
   await page.waitForFunction(({bench})=>window.__shipCheck.getShipInteriorSnapshot().research.studies['fixture-moon']?.[bench==='science-bench'?'spectrum':'thermal'],{bench});
   await page.getByRole('button',{name:'Close',exact:true}).click();
   await page.screenshot({path:`${out}/${bench}-physical.png`});
   await approach(bench,deck);
   for(const index of [1,2])await page.getByRole('button',{name:`Return cradle ${index} to cargo`,exact:true}).click();
  }
  await page.getByRole('button',{name:'Close',exact:true}).click();
 }
 const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('world-explorer:interstellar-expedition:v1')));
 assert.equal(persisted.resources.scienceCargoKg,0);assert.equal(persisted.resources.maintenanceKg,seed.resources.maintenanceKg+7);
 assert.equal(persisted.resources.feedstockKg,seed.resources.feedstockKg-2);checks.push({name:'mounted-specimens-measured-and-fabricated',outputKg:7,persisted:true});
 await approach('craft-bay-status','engineering');
 await page.locator('[data-pod-earth]').click();
 await page.waitForFunction(()=>window.__shipCheck.getShipInteriorSnapshot()?.podLaunch?.id==='depressurizing');
 await page.screenshot({path:`${out}/bay-sealed.png`});
 await page.waitForFunction(()=>window.__shipCheck.getShipInteriorSnapshot()?.podLaunch?.id==='opening');
 await page.screenshot({path:`${out}/bay-opening.png`});
 await page.waitForFunction(()=>!window.__shipCheck.activeShipInterior&&window.__shipCheck.spaceFlight.active,null,{timeout:30000});
 checks.push({name:'bay-pressure-cycle-to-earth-course',released:true});await page.screenshot({path:`${out}/pod-released.png`});
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${out}/report.json`,JSON.stringify({ok:true,checks,errors,evidenceScope:'Real browser workbench and pod controls from an explicitly seeded sample save; placement fixtures do not prove field collection or physical-device performance.'},null,2));
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});await fs.writeFile(`${out}/report.json`,JSON.stringify({ok:false,checks,errors,error:String(error.stack)},null,2));throw error;}
finally{await browser.close();await server.close();}
