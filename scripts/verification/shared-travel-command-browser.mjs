import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
const output=process.env.WE3D_SHARED_TRAVEL_OUTPUT||'output/research/shared-travel-command-2026-10-20/browser';
await fs.mkdir(output,{recursive:true});const server=await startStaticServer({rootDir:process.cwd(),ports:[4399]});
let owned,page;const report={scope:'Controlled bridge/surface/lake with actual shared UI, travel/spawn, complete walking controller, aircraft and vessel owners, input and HUD camera. Not a full-world or live-service acceptance run.',passed:false,cases:[],errors:[]};
const state=()=>page.evaluate(()=>JSON.parse(render_game_to_text()));
try{
  owned=await chromium.launchServer({channel:'chrome',headless:true});const browser=await chromium.connect(owned.wsEndpoint());page=await browser.newPage({viewport:{width:1000,height:700}});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/shared-travel-command.html`);await page.waitForFunction(()=>window.fixtureReady||window.fixtureError,null,{timeout:25000});assert.equal(await page.evaluate(()=>window.fixtureError??null),null);
  await page.locator('#walk').click();let s=await state();assert.equal(s.actor.mode,'walk');assert.equal(s.actor.position.y,23.7);assert.equal(s.car.roadId,'fixture:bridge');
  await page.locator('canvas').click({position:{x:850,y:600}});const x=s.actor.position.x;
  await runPrescribedGameActions(page,output,[{buttons:['up'],frames:12},{buttons:[],frames:2}],'canvas');s=await state();assert.ok(s.actor.position.x>x);assert.equal(s.actor.position.y,23.7);assert.equal(s.control.camera,'walk');
  report.cases.push('shared bridge walker retains deck height through prescribed keyboard movement');await page.screenshot({path:`${output}/bridge-walk.png`});
  await page.locator('#drive').click();s=await state();assert.equal(s.actor.mode,'drive');assert.equal(s.actor.position.y,23.2);assert.equal(s.car.roadId,'fixture:bridge');assert.equal(s.control.camera,'drive');report.cases.push('shared driving publishes the accepted bridge pose and road identity');await page.screenshot({path:`${output}/bridge-drive.png`});
  await page.locator('#plane').click();s=await state();assert.equal(s.actor.mode,'plane');assert.deepEqual(s.actor.position,{x:40,y:80,z:-120});assert.equal(s.control.camera,'plane');
  await page.evaluate(()=>advanceTime(300));s=await state();assert.equal(s.actor.mode,'plane');assert.ok(s.actor.position.y>70);report.cases.push('shared aircraft pose enters through real preparation and continues under its flight owner');await page.screenshot({path:`${output}/plane.png`});
  await page.locator('#boat').click();s=await state();assert.equal(s.actor.mode,'boat');assert.equal(s.actor.position.x,500);assert.ok(Math.abs(s.actor.position.y)<2);assert.equal(s.control.camera,'boat');report.cases.push('shared vessel starts on mapped fixture water and ignores unchecked altitude');
  await page.evaluate(()=>sharedFixture.apply({travelMode:'boat',refX:530,refY:999,refZ:20,yaw:.6}));s=await state();assert.equal(s.actor.position.x,530);assert.equal(s.actor.position.z,20);assert.ok(Math.abs(s.actor.position.y)<2);report.cases.push('active vessel relocation retains physical water admission');
  const before=s.actor.position;await page.locator('canvas').click({position:{x:850,y:600}});await runPrescribedGameActions(page,output,[{buttons:['up'],frames:18},{buttons:[],frames:2}],'canvas');s=await state();assert.ok(Math.hypot(s.actor.position.x-before.x,s.actor.position.z-before.z)>0);report.cases.push('restored vessel responds to real keyboard throttle');await page.screenshot({path:`${output}/boat.png`});
  const blocked=await page.evaluate(()=>{const {ctx,apply}=sharedFixture,before=JSON.stringify(ctx.boat),car=JSON.stringify(ctx.car);apply({travelMode:'walking',refX:10,refY:23.7,refZ:0,camMode:2});return {boat:before===JSON.stringify(ctx.boat),car:car===JSON.stringify(ctx.car),active:ctx.boatMode.active,camMode:ctx.camMode};});
  assert.deepEqual(blocked,{boat:true,car:true,active:true,camMode:0});report.cases.push('offshore shared walking request preserves vessel, parked actor and camera');
  assert.deepEqual(report.errors,[]);report.final=await state();await page.evaluate(()=>{sharedFixture.input.dispose();sharedFixture.ctx.Walk.disposeWater();});report.passed=true;
}catch(error){report.failure=error.stack;report.state=await state().catch(()=>null);await page?.screenshot({path:`${output}/failure.png`}).catch(()=>{});throw error;}
finally{try{if(owned)await closeOwnedBrowser(owned);}finally{await server.close();await fs.writeFile(`${output}/receipt.json`,JSON.stringify(report,null,2));}}
console.log(JSON.stringify(report));
