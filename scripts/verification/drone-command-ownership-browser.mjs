import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {startStaticServer} from './static-server.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';

const output=process.env.WE3D_DRONE_OUTPUT || 'output/research/drone-command-ownership-2026-10-19/browser';
await fs.mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4399]});
let owned=null,page;
const report={scope:'Actual travel command, walking retirement, shared UI, activity, Earth resume, drone physics, input and HUD camera; controlled terrain. Not full-world gameplay, live services or release acceptance.',passed:false,cases:[],errors:[]};
const state=async()=>page.evaluate(()=>JSON.parse(render_game_to_text()));
const checkFlight=(s,y)=>{
  assert.equal(s.control.mode,'drone');assert.equal(s.control.camera,'drone');assert.equal(s.actor.position.x,120);
  assert.equal(s.actor.position.y,y);assert.equal(s.actor.position.z,140);assert.deepEqual(s.camera,{x:120,y,z:140});
};
try{
  owned=await chromium.launchServer({channel:'chrome',headless:true});
  const browser=await chromium.connect(owned.wsEndpoint());page=await browser.newPage({viewport:{width:1000,height:700}});
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/drone-command-ownership.html`);
  await page.waitForFunction(()=>window.fixtureReady||window.fixtureError,null,{timeout:25000});
  assert.equal(await page.evaluate(()=>window.fixtureError??null),null);
  await page.locator('#shared').click();checkFlight(await state(),78);
  report.cases.push('shared pose uses roof clearance and matching camera');
  await page.screenshot({path:`${output}/shared-flight.png`});
  await page.locator('canvas').click({position:{x:800,y:600}});
  const before=await state();
  await runPrescribedGameActions(page,output,[{buttons:['up'],frames:12},{buttons:[],frames:2}],'canvas');
  const after=await state();assert.ok(after.actor.position.z<before.actor.position.z);
  assert.equal(after.camera.z,after.actor.position.z);assert.equal(after.control.mode,'drone');
  report.cases.push('prescribed keyboard burst moves the actual drone with its camera');
  await page.screenshot({path:`${output}/movement.png`});
  await page.locator('#activity').click();checkFlight(await state(),78);
  assert.equal(await page.evaluate(()=>window.activityStarted),true);assert.equal((await state()).activity.active,true);
  report.cases.push('activity starts through the owner at a safe target pose');
  await page.locator('#resume').click();await page.waitForFunction(()=>window.resumeResult);
  checkFlight(await state(),90);assert.equal((await state()).resume.resumed,true);
  report.cases.push('Earth session restores saved flight without a world reload');
  await page.screenshot({path:`${output}/restored-flight.png`});
  const rejected=await page.evaluate(()=>{
    const {ctx,share,resetGround,draw}=droneFixture;resetGround();ctx.boatMode.active=true;
    const before=JSON.stringify(ctx.drone);ctx.pendingExperienceState={travelMode:'drone',refX:300,refY:200,refZ:300};share.applySharedRuntimeState();
    const result={vessel:ctx.boatMode.active,unchanged:before===JSON.stringify(ctx.drone)};ctx.boatMode.active=false;draw();return result;
  });
  assert.deepEqual(rejected,{vessel:true,unchanged:true});report.cases.push('refused vessel exit leaves the inactive drone untouched');
  assert.deepEqual(report.errors,[]);report.final=after;
  await page.evaluate(()=>droneFixture.input.dispose());report.passed=true;
}catch(error){
  report.failure=error.stack;report.state=await state().catch(()=>null);
  await page?.screenshot({path:`${output}/failure.png`}).catch(()=>{});throw error;
}finally{
  try{if(owned)await closeOwnedBrowser(owned);}finally{await server.close();await fs.writeFile(`${output}/receipt.json`,JSON.stringify(report,null,2));}
}
console.log(JSON.stringify(report));
