// Current furnished ship runtime. Setup uses the visible expedition controls;
// movement receipts distinguish held-key traversal from collision-only samples.
import assert from 'node:assert/strict';
import {SHIP_DECKS,SHIP_ROOMS,SHIP_STATIONS} from '../../app/js/expedition/ship-layout.js';
import {createShipNavigation} from '../../app/js/expedition/ship-navigation.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const controlsOnly=process.env.WE3D_SHIP_SCOPE==='controls';
const out=controlsOnly?'output/verification/ship-controls':'output/verification/ship-traversal';
await mkdir(out,{recursive:true});
const report={ok:false,runtimeRoot:process.env.WE3D_VERIFY_ROOT||'.',errors:[],decks:[]};
let browser,server,page;
try{
 server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||process.cwd(),ports:[4477]});
 browser=await chromium.launch({headless:true,channel:'chrome'});
 page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${server.port}/app/?launch=space&diagnostics=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.evaluate(()=>{document.getElementById('spaceLaunchToggle')?.click();document.getElementById('startBtn')?.click();});
 await page.waitForFunction(()=>JSON.parse(globalThis.render_game_to_text?.()||'{}').modes?.space===true,null,{timeout:120000});
 if(await page.locator('#spaceFlightHUD').evaluate(e=>e.classList.contains('collapsed')))await page.locator('#sfHudToggle').click();
 await page.locator('#sfExpeditionBtn').click();await page.locator('#expeditionPlan').click();
 await page.waitForFunction(()=>document.querySelector('.expeditionSummary .is-ready')?.textContent?.includes('READY'));
 await page.locator('#expeditionEnterShip').click();
 await page.waitForFunction(()=>JSON.parse(globalThis.render_game_to_text?.()||'{}').expeditionShipInterior?.active);
 await page.evaluate(async()=>{globalThis.__shipTestCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
 await page.waitForTimeout(1500);
 const pose=()=>page.evaluate(()=>{const c=globalThis.__shipTestCtx,w=c.Walk.state.walker;return{x:w.x,y:w.y,z:w.z,ground:w.onGround,focus:{id:document.activeElement?.id,tag:document.activeElement?.tagName},interior:c.getShipInteriorSnapshot?.()};});
 report.entry=await pose();
 await page.keyboard.down('ArrowUp');await page.waitForTimeout(1000);await page.keyboard.up('ArrowUp');
 report.closedDoor=await pose();
 await page.keyboard.press('KeyE');await page.waitForTimeout(800);
 await page.keyboard.down('ArrowUp');await page.waitForTimeout(1100);await page.keyboard.up('ArrowUp');
 report.bridge=await pose();await page.screenshot({path:`${out}/bridge-before.png`});
 if(controlsOnly){
  await page.evaluate(()=>Object.assign(globalThis.__shipTestCtx.Walk.state.walker,{x:0,z:23.6,y:1.74,angle:0,yaw:0,vy:0}));
  await page.keyboard.press('KeyE');
  const bridgeSolid=()=>page.evaluate(()=>globalThis.__shipTestCtx.dynamicBuildingColliders.some(b=>b.sourceBuildingId==='door:bridge'));
  assert.equal(await bridgeSolid(),false,'Door closed on the actor in the opening');
  await page.keyboard.down('ArrowDown');await page.waitForTimeout(450);await page.keyboard.up('ArrowDown');await page.keyboard.press('KeyE');
  assert.equal(await bridgeSolid(),true,'Door did not close from a safe step back');
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(1000);await page.keyboard.up('ArrowUp');
  const blocked=await pose();assert.ok(blocked.z<23.4,'Walking passed through a closed pressure door');
  await page.keyboard.press('KeyE');await page.waitForTimeout(550);await page.keyboard.down('ArrowUp');await page.waitForTimeout(450);await page.keyboard.up('ArrowUp');
  const passed=await pose();assert.ok(passed.z>24,'Opening the door did not restore passage');report.doorInterlock={blockedZ:blocked.z,passedZ:passed.z};
 }

 for(const deck of ['command','habitat','engineering']){
  const data=await page.evaluate(({deckId,SHIP_DECKS})=>{
   const c=globalThis.__shipTestCtx;
   c.switchSolisReachDeck(deckId);
   const deck=SHIP_DECKS.find(d=>d.id===deckId);
   const hit=(x,z)=>{const h=c.checkBuildingCollision(x,z,.28,{actorBaseY:0,actorHeight:1.65});return h.collision?h.building?.sourceBuildingId:null;};
   const samples=[];
   for(const room of deck.rooms){
    const hits=[];
    for(let r=21;r<27;r+=.15){const x=Math.sin(room.angle)*r,z=Math.cos(room.angle)*r;const h=hit(x,z);if(h&&!h.startsWith('door:'))hits.push({r:+r.toFixed(2),hit:h});}
    samples.push({room:room.id,hits,door:room.door});
   }
   const objects=[];c.scene.updateMatrixWorld(true);const root=c.scene.getObjectByName(`solis-reach-deck:${deckId}`);
   for(const o of root.children){if(o.userData.shipRoomId && !o.isLight){const b=new THREE.Box3().setFromObject(o);objects.push({name:o.name,room:o.userData.shipRoomId,min:b.min,max:b.max});}}
   return{deckId,samples,colliders:c.dynamicBuildingColliders.map(b=>({minX:b.minX,maxX:b.maxX,minZ:b.minZ,maxZ:b.maxZ,pts:b.pts,baseY:b.baseY,height:b.height,isInteriorCollider:b.isInteriorCollider,sourceBuildingId:b.sourceBuildingId})),stations:c.activeInterior.interactions.filter(i=>!['ship-crew','ship-door'].includes(i.kind)),objects};
  },{deckId:deck,SHIP_DECKS});
  report.decks.push(data);
 }
 await page.evaluate(async()=>{const c=globalThis.__shipTestCtx;Object.assign(c.Walk.state.walker,{x:0,z:.6,y:1.74,angle:0,yaw:0,vy:0});});
 await page.keyboard.press('KeyE');await page.locator('#shipDeckPicker').waitFor({state:'visible'});
 await page.locator('#shipDeckPicker [data-deck="habitat"]').click();
 report.liftBefore=await pose();await page.keyboard.down('ArrowUp');await page.waitForTimeout(1000);await page.keyboard.up('ArrowUp');report.liftAfter=await pose();
 await page.screenshot({path:`${out}/lift-before.png`});
 assert.ok(Math.hypot(report.liftAfter.x-report.liftBefore.x,report.liftAfter.z-report.liftBefore.z)>.5,'Walking stalled after the deck picker closed');
 await page.locator('#shipViewsButton').click();await page.locator('#shipObservationPanel.show').waitFor();
 report.observation=[];
 for(const id of await page.locator('#shipObservationView option').evaluateAll(options=>options.map(o=>o.value))){
   await page.locator('#shipObservationView').selectOption(id);await page.waitForTimeout(550);
   const receipt=await page.evaluate(()=>{const p=document.querySelector('#shipObservationPanel canvas'),data=p.getContext('2d').getImageData(0,0,p.width,p.height).data;let nonblack=0,sum=0;for(let i=0;i<data.length;i+=4){sum+=data[i]+data[i+1]+data[i+2];if(data[i]+data[i+1]+data[i+2]>15)nonblack++;}return{...globalThis.__shipTestCtx.getShipInteriorSnapshot().observation,nonblack,sum};});
   report.observation.push(receipt);assert.equal(receipt.selectedViewId,id);assert.ok(receipt.nonblack>50,'View is blank: '+id);
   if(['forward','medical','local-craft-bay'].includes(id))await page.screenshot({path:`${out}/view-${id}.png`});
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/views-mobile.png`});
 assert.equal(await page.locator('.ship-observation-shell').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 await page.locator('[data-observation-next]').click();await page.keyboard.press('Escape');
 await page.locator('#shipObservationPanel').waitFor({state:'hidden'});
 await page.setViewportSize({width:1280,height:800});

 // Each route below is walked with real held keys. Only heading is steered by
 // the harness; no actor positions are assigned during this traversal.
 const readWalker=()=>page.evaluate(()=>{const c=globalThis.__shipTestCtx,w=c.Walk.state.walker;return {x:w.x,z:w.z,y:w.y,ground:w.onGround,deck:c.getShipInteriorSnapshot().deckId};});
 const navigation=new Map();
 const walkTo=async(target,radius=1)=>{
   const routeData=await page.evaluate(()=>{const c=globalThis.__shipTestCtx,w=c.Walk.state.walker;return{start:{x:w.x,z:w.z},deck:c.getShipInteriorSnapshot().deckId,colliders:c.dynamicBuildingColliders.filter(b=>!b.sourceBuildingId?.startsWith('door:'))};});
   if(!navigation.has(routeData.deck))navigation.set(routeData.deck,createShipNavigation(routeData.colliders));
   const route=navigation.get(routeData.deck).route(routeData.start,target,radius);
   assert.ok(route.length,`No furnished route to ${JSON.stringify(target)}`);
   const receipt={target,start:await readWalker(),samples:0,minY:Infinity,maxY:-Infinity,openedDoors:[]};
   for(const point of route.slice(1)){
     let last=await readWalker(),stalled=0;const deadline=Date.now()+45000;
     while(Math.hypot(last.x-point.x,last.z-point.z)>.12){
       assert.ok(Date.now()<deadline,'Route segment timed out');
       const door=await page.evaluate(()=>{const c=globalThis.__shipTestCtx,w=c.Walk.state.walker;return c.activeInterior.interactions.find(i=>i.kind==='ship-door'&&Math.hypot(i.x-w.x,i.z-w.z)<1.75&&c.dynamicBuildingColliders.some(b=>b.sourceBuildingId===i.id));});
       if(door){await page.keyboard.up('ArrowUp');await page.keyboard.up('ShiftLeft');await page.keyboard.press('KeyE');await page.waitForTimeout(550);receipt.openedDoors.push(door.id);assert.equal(await page.locator('#shipStationPanel.show').count(),0,`Door interaction opened the wrong panel: ${door.id}`);}
       await page.evaluate(p=>{const w=globalThis.__shipTestCtx.Walk.state.walker;w.yaw=Math.atan2(p.x-w.x,p.z-w.z);w.angle=w.yaw;w.lookYawOffset=0;w.pitch=0;},point);
       await page.keyboard.down('ArrowUp');
       // Walking speed near corners prevents overshoot; sprint on long straights.
       if(Math.hypot(last.x-point.x,last.z-point.z)>1.5)await page.keyboard.down('ShiftLeft');else await page.keyboard.up('ShiftLeft');
       await page.waitForTimeout(Math.min(65,Math.max(16,Math.hypot(last.x-point.x,last.z-point.z)/2.8*600)));const next=await readWalker();
       receipt.samples++;receipt.minY=Math.min(receipt.minY,next.y);receipt.maxY=Math.max(receipt.maxY,next.y);
       stalled=Math.hypot(next.x-last.x,next.z-last.z)<.015?stalled+1:0;
       if(stalled>14){const diag=await page.evaluate(p=>{const c=globalThis.__shipTestCtx,w=c.Walk.state.walker;const h=c.checkBuildingCollision(w.x+Math.sin(w.yaw)*.35,w.z+Math.cos(w.yaw)*.35,.28,{actorBaseY:0,actorHeight:1.7});return{target:p,walker:{x:w.x,y:w.y,z:w.z},blocker:h.building?.sourceBuildingId,focus:document.activeElement?.outerHTML?.slice(0,200),keys:c.keys,actions:c.readControlActions('walk')};},point);throw Error('Walking stalled: '+JSON.stringify(diag));}
       last=next;
     }
     await page.keyboard.up('ArrowUp');await page.keyboard.up('ShiftLeft');
   }
   receipt.end=await readWalker();assert.ok(receipt.minY>1.6&&receipt.maxY<1.9,'Floor height changed on a flat deck');return receipt;
 };
 report.walkedRoutes=[];
 for(const deckId of controlsOnly?[]:['habitat','command','engineering']){
   if((await readWalker()).deck!==deckId){
     report.walkedRoutes.push(await walkTo({x:0,z:0},.4));await page.keyboard.press('KeyE');
     await page.locator('#shipDeckPicker').waitFor({state:'visible'});await page.locator(`#shipDeckPicker [data-deck="${deckId}"]`).click();
   }
   const targets=SHIP_ROOMS.filter(r=>r.deckId===deckId).sort((a,b)=>a.angle-b.angle).map(r=>({roomId:r.id,...r.center,radius:3,...SHIP_STATIONS.find(s=>s.roomId===r.id)}));
   for(const target of targets){const receipt=await walkTo(target,target.radius-.1);report.walkedRoutes.push(receipt);console.log(JSON.stringify({walked:target.roomId,end:receipt.end}));
    if(['local-craft-bay','observation-gallery','storm-shelter'].includes(target.roomId))await page.screenshot({path:`${out}/walked-${target.roomId}.png`});
   }
 }
 if(controlsOnly){
   report.cancelLaunch=await page.evaluate(async()=>{
     const c=globalThis.__shipTestCtx;globalThis.__shipTestCtx.switchSolisReachDeck('engineering');
     const walker=c.Walk.state.walker;Object.assign(walker,{x:4.8,y:1.74,z:-27.14,yaw:0,angle:0,vy:0,onGround:true});
     globalThis.__cancelReleaseCount=0;const before={x:walker.x,y:walker.y,z:walker.z};
     return{setup:'Explicit safe bay pose for launch cancellation, not a traversal claim',before,started:c.beginExpeditionPodLaunch(()=>{globalThis.__cancelReleaseCount++;return false;})};
   });
   assert.equal(report.cancelLaunch.started,true);await page.waitForFunction(()=>globalThis.__cancelReleaseCount===1,null,{timeout:20000});
   report.cancelLaunch.after=await readWalker();assert.ok(Math.hypot(report.cancelLaunch.after.x-report.cancelLaunch.before.x,report.cancelLaunch.after.z-report.cancelLaunch.before.z)<.05);
   await page.locator('#shipExitButton').click();await page.waitForFunction(()=>!globalThis.__shipTestCtx.activeShipInterior);assert.equal(await page.locator('#shipObservationPanel').count(),0);
 }
 assert.deepEqual(report.errors,[]);
 report.ok=true;
}catch(e){report.failure=String(e);process.exitCode=1;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server?.close();console.log(JSON.stringify({ok:report.ok,failure:report.failure,errors:report.errors,liftBefore:report.liftBefore&&{x:report.liftBefore.x,z:report.liftBefore.z,focus:report.liftBefore.focus},liftAfter:report.liftAfter&&{x:report.liftAfter.x,z:report.liftAfter.z,focus:report.liftAfter.focus}}));}
