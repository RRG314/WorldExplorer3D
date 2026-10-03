import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const server=await startStaticServer({rootDir:process.cwd(),ports:[4396]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const dir='output/verification/product-plan';
const report={scope:'Controlled mapped water and wave motion, actual research model/rig/deck/swim controller and real browser Journal storage',cases:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/research-deck.html`);await page.waitForFunction(()=>window.ready===true);
 await page.locator('#researchDeckEnter').click();await page.waitForFunction(()=>researchTest.ctx.boatDeck.active);
 const go=async(x,z)=>{const result=await page.evaluate(async({x,z})=>{
   for(let i=0;i<1400;i++){
    const p=researchTest.ctx.boatDeck.snapshot().pose,dx=x-p.x,dz=z-p.z;
    if(Math.hypot(dx,dz)<.28){researchTest.setActions({});return {reached:true,pose:p};}
    researchTest.setActions(Math.abs(dx)>.17?{strafe:-Math.sign(dx)}:{move:Math.sign(dz)});
    await advanceTime(100);
   }researchTest.setActions({});return {reached:false,pose:researchTest.ctx.boatDeck.snapshot().pose};
 },{x,z});assert.equal(result.reached,true,JSON.stringify(result));};
 await go(0,-23.4);await go(0,-10);await go(-3.5,-10);
 await page.locator('#researchDeckAction').click();await page.waitForFunction(()=>document.querySelector('#researchDeckControls').textContent.includes('Saved to this device'));
 let events=await page.evaluate(()=>researchTest.ctx.discoveryProfileStore.listEvents(100));assert.equal(events.filter(e=>e.eventType==='marine-conditions-reviewed').length,1);assert.equal(events.find(e=>e.eventType==='marine-conditions-reviewed').metadata.truthType,'modeled');
 await page.locator('#researchDeckAction').click();await page.waitForFunction(()=>document.querySelector('#researchDeckControls').textContent.includes('Already recorded'));
 events=await page.evaluate(()=>researchTest.ctx.discoveryProfileStore.listEvents(100));assert.equal(events.filter(e=>e.eventType==='marine-conditions-reviewed').length,1);
 report.cases.push({id:'walk-to-lab-save-and-deduplicate-journal-review',passed:true});await page.evaluate(async()=>{researchTest.setActions({turn:1});await advanceTime(1570);researchTest.setActions({});});await page.screenshot({path:`${dir}/research-lab.png`});
 await page.evaluate(async()=>{researchTest.setActions({turn:-1});await advanceTime(1570);researchTest.setActions({});});await go(0,-10);await go(0,10);await go(-3.5,10);await page.getByLabel('Deck destination').selectOption('chart');await page.locator('#researchDeckAction').click();assert.equal(await page.evaluate(()=>researchTest.chartOpened),true);
 report.cases.push({id:'walk-through-real-bridge-door-and-open-chart',passed:true});await page.screenshot({path:`${dir}/research-bridge.png`});
 await go(0,10);await go(0,15);await page.getByLabel('Deck destination').selectOption('helm');await page.locator('#researchDeckAction').click();assert.equal(await page.evaluate(()=>researchTest.ctx.boatDeck.active),false);
 await page.locator('#researchDeckMoor').click();assert.equal(await page.evaluate(()=>researchTest.ctx.boatMode.moored),false);await page.locator('#researchDeckMoor').click();assert.equal(await page.evaluate(()=>researchTest.ctx.boatMode.moored),true);
 report.cases.push({id:'bridge-to-helm-and-explicit-mooring',passed:true});
 await page.locator('#researchDeckEnter').click();await go(6.1,-23.4);await page.getByLabel('Deck destination').selectOption('dive');await page.locator('#researchDeckAction').click();await page.waitForFunction(()=>researchTest.ctx.boatSwimming.active&&!!researchTest.ctx.Walk.state.walker.swimming);
 await page.locator('#boatSwimmingToggle').click();await page.waitForFunction(()=>researchTest.ctx.boatDeck.active&&!researchTest.ctx.boatSwimming.active);
 assert.equal(await page.evaluate(()=>researchTest.ctx.Walk.state.characterMesh.parent===researchTest.ctx.boatMode.mesh),true);
 report.cases.push({id:'dive-platform-ladder-swim-and-return-to-same-deck',passed:true});
 await page.setViewportSize({width:390,height:844});await page.locator('#researchDeckControls').waitFor({state:'visible'});const bounds=await page.locator('#researchDeckControls').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391&&bounds.y+bounds.height<=770);await page.screenshot({path:`${dir}/research-phone.png`});report.cases.push({id:'phone-station-navigation-and-controls-fit',passed:true});
 await page.reload();await page.waitForFunction(()=>window.ready===true);
 const persisted=await page.evaluate(async()=>{const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js?v=5');return (await createIndexedDbDiscoveryProfileStore().listEvents(100)).filter(e=>e.eventType==='marine-conditions-reviewed')});assert.equal(persisted.length,1);report.cases.push({id:'lab-record-survives-browser-reload',passed:true});
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await fs.writeFile(`${dir}/research-deck-browser.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify(report));
