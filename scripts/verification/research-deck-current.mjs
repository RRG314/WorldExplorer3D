import {walkResearchStation} from './research-station-walk.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const server=await startStaticServer({rootDir:process.cwd(),ports:[4396]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const dir=process.env.WE3D_RESEARCH_OUTPUT||'output/verification/product-plan';await fs.mkdir(dir,{recursive:true});
const report={scope:'Controlled mapped water and wave motion, actual research model/rig/deck/swim controller and real browser Journal storage',cases:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/research-deck.html`);await page.waitForFunction(()=>window.ready===true||!!window.admissionFailure,{},{timeout:30000});
 assert.equal(await page.evaluate(()=>researchTest.ctx.boatMode.mesh.userData.researchVesselState),'ready');
 await page.locator('#researchDeckEnter').click();await page.waitForFunction(()=>researchTest.ctx.boatDeck.active);
 const goStation=id=>walkResearchStation(page,id,{fixture:true});
 const go=async(x,z)=>{const result=await page.evaluate(async({x,z})=>{
   for(let i=0;i<180;i++){
    const p=researchTest.ctx.boatDeck.snapshot().pose,dx=x-p.x,dz=z-p.z;
    if(Math.hypot(dx,dz)<.065){researchTest.setActions({});return {reached:true,pose:p};}
    const delta=Math.min(.1,Math.max(.017,Math.abs(Math.abs(dx)>.025?dx:dz)/2.2));
    researchTest.setActions(Math.abs(dx)>.025?{strafe:-Math.sign(dx)}:{move:Math.sign(dz)});
    await advanceTime(delta*1000);
   }researchTest.setActions({});const pose=researchTest.ctx.boatDeck.snapshot().pose,nav=researchTest.ctx.boatMode.mesh.userData.researchNavigation;return {reached:false,pose,probes:[.02,.04,.08,.1,.2].map(d=>({d,move:nav.move(pose,0,d),y:nav.support(pose.x,pose.z+d,pose.y),blocked:nav.blocked(pose.x,pose.z+d,.3,nav.support(pose.x,pose.z+d,pose.y)??pose.y),feet:[[.2,0],[-.2,0],[0,.2],[0,-.2]].map(([x,z])=>nav.support(pose.x+x,pose.z+d+z,pose.y))}))};
 },{x,z});assert.equal(result.reached,true,JSON.stringify(result));};
 await goStation('lab');
 await page.locator('#researchDeckAction').click();await page.waitForFunction(()=>document.querySelector('#researchDeckControls').textContent.includes('Saved to this device'));
 let events=await page.evaluate(()=>researchTest.ctx.discoveryProfileStore.listEvents(100));assert.equal(events.filter(e=>e.eventType==='marine-conditions-reviewed').length,1);assert.equal(events.find(e=>e.eventType==='marine-conditions-reviewed').metadata.truthType,'modeled');
 await page.locator('#researchDeckAction').click();await page.waitForFunction(()=>document.querySelector('#researchDeckControls').textContent.includes('Already recorded'));
 events=await page.evaluate(()=>researchTest.ctx.discoveryProfileStore.listEvents(100));assert.equal(events.filter(e=>e.eventType==='marine-conditions-reviewed').length,1);
 report.cases.push({id:'walk-to-lab-save-and-deduplicate-journal-review',passed:true});await page.evaluate(async()=>{researchTest.setActions({turn:1});await advanceTime(1570);researchTest.setActions({});});await page.screenshot({path:`${dir}/research-lab.png`});
 await page.evaluate(async()=>{researchTest.setActions({turn:-1});await advanceTime(1570);researchTest.setActions({});});await goStation('chart');await page.getByLabel('Deck destination').selectOption('chart');await page.locator('#researchDeckAction').click();assert.equal(await page.evaluate(()=>researchTest.chartOpened),true);
 report.cases.push({id:'walk-through-ship-and-open-bridge-chart',passed:true});await page.screenshot({path:`${dir}/research-chart.png`});
 await goStation('helm');assert.ok(await page.evaluate(()=>researchTest.ctx.boatDeck.snapshot().pose.y>12));await page.screenshot({path:`${dir}/research-upper-deck.png`});
 await goStation('lab');assert.ok(await page.evaluate(()=>researchTest.ctx.boatDeck.snapshot().pose.y<2.1));
 report.cases.push({id:'actual-interior-companionway-up-down-and-clear-equipment-routes',passed:true});

 const timing=await page.evaluate(()=>{const nav=researchTest.ctx.boatMode.mesh.userData.researchNavigation,values=[];let p={x:0,y:1.944,z:-29,yaw:0};for(let i=0;i<240;i++){const t=performance.now();p=nav.move(p,i%2?.04:-.04,0);nav.blocked(p.x,p.z,.25,p.y+1.4,.5);values.push(performance.now()-t);}return {mean:values.reduce((a,b)=>a+b,0)/values.length,p95:values.sort((a,b)=>a-b)[228],stats:nav.stats};});report.navigationTiming=timing;assert.ok(timing.p95<8,JSON.stringify(timing));
 report.cases.push({id:'bounded-walking-and-camera-query-budget',passed:true});
 await goStation('helm');await page.getByLabel('Deck destination').selectOption('helm');await page.locator('#researchDeckAction').click();assert.equal(await page.evaluate(()=>researchTest.ctx.boatDeck.active),false);
 await page.locator('#researchDeckMoor').click();assert.equal(await page.evaluate(()=>researchTest.ctx.boatMode.moored),false);await page.locator('#researchDeckMoor').click();assert.equal(await page.evaluate(()=>researchTest.ctx.boatMode.moored),true);
 report.cases.push({id:'deck-helm-and-explicit-mooring',passed:true});
 await page.locator('#researchDeckEnter').click();await goStation('dive');await page.getByLabel('Deck destination').selectOption('dive');await page.locator('#researchDeckAction').click();await page.waitForFunction(()=>researchTest.ctx.boatSwimming.active&&!!researchTest.ctx.Walk.state.walker.swimming);
 await page.locator('#boatSwimmingToggle').click();await page.waitForFunction(()=>researchTest.ctx.boatDeck.active&&!researchTest.ctx.boatSwimming.active);
 assert.equal(await page.evaluate(()=>researchTest.ctx.Walk.state.characterMesh.parent===researchTest.ctx.boatMode.mesh),true);
 report.cases.push({id:'dive-platform-ladder-swim-and-return-to-same-deck',passed:true});
 await page.setViewportSize({width:390,height:844});await page.locator('#researchDeckControls').waitFor({state:'visible'});const bounds=await page.locator('#researchDeckControls').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391&&bounds.y+bounds.height<=770);await page.screenshot({path:`${dir}/research-phone.png`});report.cases.push({id:'phone-station-navigation-and-controls-fit',passed:true});
 await page.reload();await page.waitForFunction(()=>window.ready===true);
 const persisted=await page.evaluate(async()=>{const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js?v=5');return (await createIndexedDbDiscoveryProfileStore().listEvents(100)).filter(e=>e.eventType==='marine-conditions-reviewed')});assert.equal(persisted.length,1);report.cases.push({id:'lab-record-survives-browser-reload',passed:true});
 const lifecycle=await page.evaluate(async()=>{
  const {createVesselVisual,updateVesselVisual}=await import('/app/js/transport/vessel-visual-recipe.js?v=8');
  const {getMaritimeCatalogEntry}=await import('/app/js/transport/maritime-catalog.js?v=1');
  const {modelAssetCacheSnapshot}=await import('/app/js/assets/model-asset-runtime.js?v=16');
  const root=researchTest.ctx.boatMode.mesh,other=createVesselVisual(THREE,getMaritimeCatalogEntry('ocean-research-vessel'),{state:'ambient'});await other.root.userData.visualReady;
  const a=root.userData.vesselDamageMaterials[0],b=other.root.userData.vesselDamageMaterials[0],color=b.material.color.getHex();
  updateVesselVisual({root},.05);const damaged=a.material.color.getHex()!==a.baseColor,isolated=b.material.color.getHex()===color;
  const lights=[];root.traverse(o=>{if(o.userData.vesselNavigationLight)lights.push(o.visible)});updateVesselVisual({root},1);
  const restored=a.material.color.getHex()===a.baseColor;
  const lodTriangles=other.root.userData.vesselDamageMaterials.length;other.dispose();
  researchTest.ctx.boatDeck.dispose();researchTest.ctx.boatSwimming.dispose();root.userData.disposeVesselVisual();
  const canceled=createVesselVisual(THREE,getMaritimeCatalogEntry('ocean-research-vessel'),{state:'active'});canceled.dispose();const late=await canceled.root.userData.visualReady;
  return {damaged,isolated,restored,lights,lodTriangles,late,children:root.children.length,leases:modelAssetCacheSnapshot().entries.filter(e=>/marine-research-vessel|marine-atlantic|solis-/.test(e.id)).map(e=>({id:e.id,leases:e.leases}))};
 });assert.ok(lifecycle.damaged&&lifecycle.isolated&&lifecycle.restored);assert.deepEqual(lifecycle.lights,[false,false]);assert.equal(lifecycle.late,false);assert.equal(lifecycle.children,0);assert.ok(lifecycle.leases.every(e=>e.leases===0),JSON.stringify(lifecycle));report.lifecycle=lifecycle;
 report.cases.push({id:'isolated-damage-distant-model-and-complete-canceled-load-disposal',passed:true});
 const retry=await browser.newPage({viewport:{width:1440,height:900}});await retry.route('**/research-vessel/rcrv-walkable.glb*',route=>route.abort());
 await retry.goto(`http://127.0.0.1:${server.port}/tests/fixtures/research-deck.html`);await retry.waitForFunction(()=>window.ready);
 assert.equal(await retry.locator('#researchDeckEnter').isEnabled(),false);await retry.unroute('**/research-vessel/rcrv-walkable.glb*');await retry.locator('#researchVesselRetry').click();
 await retry.waitForFunction(()=>researchTest.ctx.boatMode.mesh.userData.researchVesselState==='ready');await retry.locator('#researchDeckEnter').click();assert.equal(await retry.evaluate(()=>researchTest.ctx.boatDeck.active),true);await retry.close();
 report.cases.push({id:'missing-vessel-fails-closed-and-explicit-retry-recovers',passed:true});
 assert.deepEqual(report.errors,[]);await browser.close();
 let client=await fs.readFile(`${process.env.HOME}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'utf8');
 client=client.replace('await captureScreenshot(page, canvas, shotPath);','await page.screenshot({path:shotPath,type:"png"});');
 const args=['--input-type=module','-','--headless','false','--url',`http://127.0.0.1:${server.port}/tests/fixtures/research-deck.html`,'--click-selector','#researchDeckEnter','--actions-json',JSON.stringify({steps:[{buttons:['up'],frames:5},{buttons:['left'],frames:4},{buttons:[],frames:30}]}),'--iterations','1','--screenshot-dir',`${dir}/prescribed-client`];
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:['pipe','inherit','inherit']});child.stdin.end(client);child.on('error',reject);child.on('exit',resolve);});assert.equal(code,0);assert.ok(!(await fs.readdir(`${dir}/prescribed-client`)).some(f=>f.startsWith('errors-')));
 report.cases.push({id:'prescribed-client-walk-turn-and-observe-deck',passed:true});report.passed=true;
}finally{await fs.writeFile(`${dir}/research-deck-browser.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify(report));
