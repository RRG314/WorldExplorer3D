import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
const output=process.env.WE3D_ACTIVITY_COMMAND_OUTPUT||'output/research/activity-command-ownership-2026-10-20/browser';
await fs.mkdir(output,{recursive:true});const server=await startStaticServer({rootDir:process.cwd(),ports:[4399]});
let owned,page;const report={scope:'Actual activity/travel/spawn owners, complete walking controller, vessel controls, input and HUD on controlled bridge, roof and lake. Not full-world, live-service or performance acceptance.',passed:false,cases:[],errors:[]};
const state=()=>page.evaluate(()=>({world:JSON.parse(render_game_to_text()),activity:activityApi.getRuntimeSnapshot()}));
const start=(mode,point)=>page.evaluate(({mode,point})=>{activityApi.stopActivity();return activityApi.startActivity({id:`browser-${mode}-${point.x}-${point.y}`,title:'Owned start',traversalMode:mode,requiresNearbyStart:false,anchors:[{id:'start',typeId:'start',...point},{id:'finish',typeId:'finish',label:'Finish',x:point.x+80,y:point.y,z:point.z}]});},{mode,point});
try{
 owned=await chromium.launchServer({channel:'chrome',headless:true});const browser=await chromium.connect(owned.wsEndpoint());page=await browser.newPage({viewport:{width:1000,height:700}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/shared-travel-command.html`);await page.waitForFunction(()=>window.fixtureReady||window.fixtureError,null,{timeout:25000});assert.equal(await page.evaluate(()=>window.fixtureError??null),null);
 await page.evaluate(async()=>{
  window.activityApi=await import('/app/js/activity-discovery/runtime.js?v=9');
  const {buildingContainingPoint}=await import('/app/js/world/navigation.js');const {initWorldSpawning}=await import('/app/js/world/spawn.js');
  const {createBuildingCollisionQuery}=await import('/app/js/physics/building-collision.js');initWorldSpawning({buildingContainingPoint});
  const ctx=sharedFixture.ctx;ctx.checkBuildingCollision=createBuildingCollisionQuery(ctx);
  const roof={minX:-40,maxX:0,minZ:60,maxZ:100,baseY:0,height:30,centerX:-20,centerZ:80};ctx.buildings=[roof];
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(40,30,40),new THREE.MeshStandardMaterial({color:0x9c8a77}));mesh.position.set(-20,15,80);ctx.scene.add(mesh);
  const advance=window.advanceTime;window.advanceTime=ms=>{advance(ms);activityApi.updateActivityRuntime(ms/1000);};
 });
 assert.equal(await start('walk',{x:10,y:22,z:0,yaw:Math.PI/2}),true);await page.evaluate(()=>sharedFixture.draw());
 const before=(await state()).world.actor.position.x;await page.locator('canvas').click({position:{x:850,y:600}});await runPrescribedGameActions(page,output,[{buttons:['up'],frames:12},{buttons:[],frames:2}],'canvas');let s=await state();assert.ok(s.world.actor.position.x>before);assert.equal(s.world.actor.position.y,23.7);assert.ok(s.activity.elapsedMs>0);report.cases.push('bridge walking activity starts and progresses under real input without losing support');await page.screenshot({path:`${output}/bridge-activity.png`});
 assert.equal(await start('drive',{x:20,y:22,z:0,yaw:Math.PI/2}),true);s=await state();assert.equal(s.world.actor.mode,'drive');assert.equal(s.world.actor.position.y,23.2);report.cases.push('driving activity adopts the accepted bridge pose');
 assert.equal(await start('walk',{x:-20,y:30,z:80,yaw:0}),true);await page.evaluate(()=>advanceTime(120));s=await state();assert.equal(s.world.actor.position.y,31.7);assert.equal(s.world.walker.onBuilding,true);report.cases.push('rooftop activity retains verified roof support after actual walking physics');await page.screenshot({path:`${output}/roof-activity.png`});
 const roofPose=s.world.actor.position;assert.equal(await start('walk',{x:80,y:100,z:80}),false);assert.deepEqual((await state()).world.actor.position,roofPose);report.cases.push('unsupported elevated start is refused without actor or progress publication');
 assert.equal(await start('boat',{x:500,y:0,z:0,yaw:.4}),true);await page.evaluate(()=>sharedFixture.draw());s=await state();assert.equal(s.world.actor.mode,'boat');assert.ok(Math.abs(s.world.actor.position.y)<2);
 const boatPose=s.world.actor.position;await page.locator('canvas').click({position:{x:850,y:600}});await runPrescribedGameActions(page,output,[{buttons:['up'],frames:18},{buttons:[],frames:2}],'canvas');s=await state();assert.ok(Math.hypot(s.world.actor.position.x-boatPose.x,s.world.actor.position.z-boatPose.z)>0);report.cases.push('mapped-water activity uses the real vessel owner and throttle');await page.screenshot({path:`${output}/vessel-activity.png`});
 const beforeRefusal=s.world.actor.position;assert.equal(await start('boat',{x:0,y:0,z:80}),false);s=await state();assert.deepEqual(s.world.actor.position,beforeRefusal);assert.equal(s.activity.active,false);report.cases.push('same-mode activity cannot fabricate water or claim a refused relocation');
 assert.equal(await start('walk',{x:10,y:22,z:0}),false);assert.deepEqual((await state()).world.actor.position,beforeRefusal);report.cases.push('activity cannot force an offshore vessel exit');
 assert.deepEqual(report.errors,[]);report.final=await state();await page.evaluate(()=>{activityApi.stopActivity();sharedFixture.input.dispose();sharedFixture.ctx.Walk.disposeWater();});report.passed=true;
}catch(error){report.failure=error.stack;report.state=await state().catch(()=>null);await page?.screenshot({path:`${output}/failure.png`}).catch(()=>{});throw error;}
finally{try{if(owned)await closeOwnedBrowser(owned);}finally{await server.close();await fs.writeFile(`${output}/receipt.json`,JSON.stringify(report,null,2));}}
console.log(JSON.stringify(report));
