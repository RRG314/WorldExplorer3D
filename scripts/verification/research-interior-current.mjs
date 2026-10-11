import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
const dir=process.env.WE3D_RESEARCH_OUTPUT||'output/research-interior-20261011/journey';await fs.mkdir(dir,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4397]}),browser=await chromium.launch({channel:'chrome',headless:true});
const report={scope:'Actual licensed ship and furnishings, actual controller/triangle navigation; controlled sea, test-owned provisions and IndexedDB. Not hosted or physical-device acceptance.',cases:[],errors:[],failures:[]};let page;
try{
 page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.failures.push({url:r.url(),status:r.status()});});
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/research-deck.html`);await page.waitForFunction(()=>window.ready,null,{timeout:60000});
 assert.equal(await page.evaluate(()=>researchTest.ctx.boatMode.mesh.userData.researchVesselState),'ready',await page.evaluate(()=>researchTest.ctx.boatMode.mesh.userData.researchVesselError));
 const topology=await page.evaluate(async()=>{const {researchRouteGraph}=await import('/app/js/boat-mode/research/interior-plan.js'),g=researchRouteGraph(),nav=researchTest.ctx.boatMode.mesh.userData.researchNavigation;return {edges:g.edges.length,failed:g.edges.filter(([a,b])=>{const from=g.nodes.find(n=>n.id===a),to=g.nodes.find(n=>n.id===b);return !nav.walkableSegment(from,to)||!nav.walkableSegment(to,from);}),stats:nav.stats};});
 assert.deepEqual(topology.failed,[]);report.topology=topology;report.cases.push({id:'all-authored-connections-traversable-both-directions-in-furnished-mesh',passed:true});
 await page.locator('#researchDeckEnter').click();await page.waitForFunction(()=>researchTest.ctx.boatDeck.active);
 const burstBefore=await page.evaluate(()=>researchTest.ctx.boatDeck.snapshot().pose.z);
 await runPrescribedGameActions(page,dir,[{buttons:['up'],frames:8},{buttons:[],frames:2}],'canvas');
 assert.ok(await page.evaluate(()=>researchTest.ctx.boatDeck.snapshot().pose.z)>burstBefore);report.cases.push({id:'prescribed-real-keyboard-walk-input',passed:true});
 const go=async id=>{await page.getByLabel('Deck destination').selectOption(id);const result=await page.evaluate(id=>{
  const ctx=researchTest.ctx;ctx.boatDeck.select(id);ctx.boatDeck.update(.7);const route=ctx.boatDeck.snapshot().route;
  if(!route.length)return {ok:false,reason:'No walking route',snapshot:ctx.boatDeck.snapshot()};let steps=0;
  try{for(const target of route.slice(1)){let reached=false;for(let i=0;i<1200;i++){
   const pose=ctx.boatDeck.snapshot().pose,dx=target.x-pose.x,dz=target.z-pose.z,d=Math.hypot(dx,dz);if(d<.05){reached=true;break;}
   const length=Math.max(d,.11);researchTest.setActions({move:(Math.sin(pose.yaw)*dx+Math.cos(pose.yaw)*dz)/length,strafe:(-Math.cos(pose.yaw)*dx+Math.sin(pose.yaw)*dz)/length});ctx.boatDeck.update(.05);steps++;
  }if(!reached)return {ok:false,target,snapshot:ctx.boatDeck.snapshot(),steps};}return {ok:true,snapshot:ctx.boatDeck.snapshot(),steps};}finally{researchTest.setActions({});}
 },id);assert.equal(result.ok,true,JSON.stringify(result));assert.ok(await page.evaluate(()=>researchTest.ctx.boatDeck.stationDistance(researchTest.ctx.boatDeck.snapshot().targetId))<.2);report.cases.push({id:`walk-to-${id}`,passed:true,steps:result.steps});await page.waitForTimeout(150);};
 const look=async yaw=>{await page.evaluate(yaw=>{const c=researchTest.ctx,current=c.boatDeck.snapshot().pose.yaw,delta=Math.atan2(Math.sin(yaw-current),Math.cos(yaw-current));researchTest.setActions({turn:Math.sign(delta)});for(let left=Math.abs(delta)/2;left>1e-8;left-=.025)c.boatDeck.update(Math.min(left,.025));researchTest.setActions({});},yaw);await page.waitForTimeout(150);};
 await page.locator('#researchDeckAction').isDisabled().then(v=>assert.equal(v,true));
 await go('lab');await page.locator('#researchDeckAction').click();await page.waitForFunction(()=>document.getElementById('researchDeckControls').textContent.includes('Saved to this device'));
 await page.screenshot({path:`${dir}/wet-lab.png`});
 await page.evaluate(()=>{const scene=researchTest.ctx.scene;window.interiorSavedLight=[];for(const l of scene.children)if(l.isLight){interiorSavedLight.push([l,l.intensity]);l.intensity=l.isHemisphereLight?.06:0;}});await page.waitForTimeout(150);await page.screenshot({path:`${dir}/wet-lab-night.png`});await page.evaluate(()=>{for(const [l,intensity] of interiorSavedLight)l.intensity=intensity;});await page.locator('#researchDeckAction').click();await page.waitForFunction(()=>document.getElementById('researchDeckControls').textContent.includes('Already recorded'));
 report.cases.push({id:'interior-wet-lab-saves-real-journal-once',passed:true});
 await go('galley');await look(-Math.PI/2);await page.locator('#researchDeckAction').click();assert.match(await page.locator('[aria-label="Carried galley provisions"]').innerText(),/No food or water/);
 await page.evaluate(async()=>{const ctx=researchTest.ctx;await ctx.playerBackpackSessionReady;const {COMMERCE_CATALOG}=await import('/app/js/urban-sandbox/commerce-model.js');ctx.playerBackpackInventory.upsertItem({instanceId:'fixture-snack',catalogId:'route-snack',quantity:2,metadata:{label:'Route snack',conditionRestore:.12,category:'consumable',verbs:['consume']}},{silent:false});ctx.playerConditionAuthority.set(.5,'controlled-test-condition');});
 await page.locator('#researchDeckAction').click();await page.getByRole('button',{name:'Route snack · 2',exact:true}).click();const meal=await page.evaluate(()=>({condition:researchTest.ctx.playerConditionAuthority.snapshot().condition,quantity:researchTest.ctx.playerBackpackInventory.item('fixture-snack').quantity}));assert.equal(meal.quantity,1);assert.equal(meal.condition,.62);
 await page.screenshot({path:`${dir}/galley.png`});report.cases.push({id:'galley-consumes-existing-provision-through-shared-condition-authority',passed:true});
 await go('mess');await look(-Math.PI/2);await page.screenshot({path:`${dir}/mess.png`});
 await go('drylab');await look(0);await page.screenshot({path:`${dir}/dry-lab.png`});
 await go('quarters');await look(0);await page.screenshot({path:`${dir}/crew-quarters.png`});
 await go('briefing');await look(-Math.PI/2);await page.screenshot({path:`${dir}/briefing.png`});
 await go('chart');await look(0);await page.locator('#researchDeckAction').click();assert.equal(await page.evaluate(()=>researchTest.chartOpened),true);await page.screenshot({path:`${dir}/bridge-chart.png`});
 await go('helm');await look(0);await page.screenshot({path:`${dir}/bridge.png`});
 await page.locator('#researchShipMapButton').click();await page.waitForSelector('#researchShipMap[open]');
 const before=await page.evaluate(()=>researchTest.ctx.boatDeck.snapshot().pose);await runPrescribedGameActions(page,dir,[{buttons:['up'],frames:8},{buttons:[],frames:2}],'canvas');assert.deepEqual(await page.evaluate(()=>researchTest.ctx.boatDeck.snapshot().pose),before);
 await page.screenshot({path:`${dir}/ship-map-desktop.png`});await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${dir}/ship-map-phone.png`});const fit=await page.locator('#researchShipMap').boundingBox();assert.ok(fit.x>=0&&fit.x+fit.width<=390&&fit.y>=0&&fit.y+fit.height<=844);
 await page.getByRole('button',{name:'Main deck',exact:true}).click();await page.locator('#researchShipMap [data-station="lab"]').click();assert.equal(await page.evaluate(()=>researchTest.ctx.boatDeck.snapshot().targetId),'lab');assert.equal(await page.locator('#researchShipMap').isVisible(),false);
 report.cases.push({id:'desktop-phone-map-deck-tabs-destination-focus-and-movement-lock',passed:true});await page.setViewportSize({width:1440,height:900});
 await go('lab');await go('sub');await page.screenshot({path:`${dir}/working-deck.png`});await go('dive');await page.locator('#researchDeckAction').click();await page.waitForFunction(()=>researchTest.ctx.boatSwimming.active);await page.locator('#boatSwimmingToggle').click();await page.waitForFunction(()=>researchTest.ctx.boatDeck.active);report.cases.push({id:'return-through-interior-to-stern-and-ladder-swim-reboarding',passed:true});
 const timing=await page.evaluate(()=>{const n=researchTest.ctx.boatMode.mesh.userData.researchNavigation,t=[];let p={x:0,y:1.944,z:-15};for(let i=0;i<240;i++){const start=performance.now();p=n.move(p,.03*(i%2?1:-1),0);n.blocked(p.x,p.z,.25,p.y+1.4,.6);t.push(performance.now()-start);}t.sort((a,b)=>a-b);return {p95:t[228],geometry:researchTest.ctx.boatMode.mesh.userData.researchNavigation.stats};});assert.ok(timing.p95<8,JSON.stringify(timing));report.timing=timing;
 await page.reload();await page.waitForFunction(()=>window.ready,null,{timeout:60000});const persisted=await page.evaluate(async()=>{const {ensurePlayerBackpackInventory}=await import('/app/js/urban-sandbox/equipment-model.js?v=10');const inv=ensurePlayerBackpackInventory(researchTest.ctx);await researchTest.ctx.playerBackpackSessionReady;return inv.item('fixture-snack')?.quantity;});assert.equal(persisted,1);report.cases.push({id:'used-galley-provision-survives-real-reload',passed:true});
 const cleanup=await page.evaluate(async()=>{const ctx=researchTest.ctx;ctx.boatDeck.dispose();ctx.boatSwimming.dispose();ctx.boatMode.mesh.userData.disposeVesselVisual();const {modelAssetCacheSnapshot}=await import('/app/js/assets/model-asset-runtime.js?v=16');return {map:!!document.getElementById('researchShipMap'),children:ctx.boatMode.mesh.children.length,leases:modelAssetCacheSnapshot().entries.filter(e=>/solis-|workspace-|marine-research|marine-atlantic/.test(e.id)).map(e=>({id:e.id,leases:e.leases}))};});assert.equal(cleanup.map,false);assert.equal(cleanup.children,0);assert.ok(cleanup.leases.every(e=>e.leases===0));report.cleanup=cleanup;
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failures,[]);report.passed=true;
}catch(error){report.failure=error.message;report.state=await page?.evaluate(()=>window.render_game_to_text?.()).catch(()=>null);await page?.screenshot({path:`${dir}/failure.png`}).catch(()=>{});throw error;}finally{await fs.writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify(report));
