import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const out='output/verification/authored-home-runtime';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4195/app/?loc=custom&lat=39.715&lon=-76.955&mode=walking');
  await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
  if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
  if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(()=>{const d=globalThis.getWorldExplorerRuntimeDiagnostics?.();return d?.gameStarted&&!d.worldLoading&&d.modes?.walking&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:120000});
  const entry=await page.evaluate(async()=>{
    const {ctx}=await import('/app/js/shared-context.js?v=55'),core=await import('/app/js/interiors/core.js?v=4'),runtime=await import('/app/js/interiors/runtime.js?v=20'),{buildInteriorScene}=await import('/app/js/interiors/scene-builder.js?v=13'),{makeStarterLayout}=await import('/functions/interior-layout.mjs');
    const x=ctx.Walk.state.walker.x,z=ctx.Walk.state.walker.z;
    const outline=[{x:-5,z:-6},{x:5,z:-6},{x:5,z:6},{x:-5,z:6}],layout=makeStarterLayout({footprint:outline,heightMeters:6},{floorCount:2});
    const building={pts:outline.map(p=>({x:p.x+x,z:p.z+z})),centerX:x,centerZ:z,bodyHeightMeters:6,height:6,baseY:ctx.Walk.state.walker.y-1.7};
    const support={key:'local-authored-home-verification',label:'Local authored home test',enterable:true,building,synthetic:true};
    const deps={...core,buildInteriorScene,interiorCache:new Map(),listSupportedInteriorsNear:()=>[],resolveInteriorDefinitionForEntry:async()=>({label:support.label,support,building,communityRealityCapture:{layout}})};
    window.authoredTest={ctx,core,runtime,deps,layout};
    const entered=await runtime.enterInteriorForSupport(support,deps);
    return {entered,hint:ctx.interiorHint,mode:ctx.activeInterior?.mode,floors:ctx.activeInterior?.floorPlan?.floorCount};
  });
  assert.equal(entry.entered,true,JSON.stringify(entry));assert.equal(entry.mode,'authored');assert.equal(entry.floors,2);assert.equal(await page.evaluate(()=>window.authoredTest.ctx.camera.near),.04);
  await page.waitForTimeout(250);await page.screenshot({path:`${out}/entry.png`});
  const before=await page.evaluate(()=>({...window.authoredTest.ctx.Walk.state.walker}));
  await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
  const after=await page.evaluate(()=>{const {ctx}=window.authoredTest;return {x:ctx.Walk.state.walker.x,z:ctx.Walk.state.walker.z,y:ctx.Walk.state.walker.y};});
  assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>.1,'real walking control did not move the player');
  const stairs=await page.evaluate(()=>{const {ctx,runtime,deps}=window.authoredTest,active=ctx.activeInterior,ramp=active.stairs[0],samples=[];let y=ramp.yStart;for(let i=0;i<=40;i++){const t=i/40,x=ramp.start.x+(ramp.end.x-ramp.start.x)*t,z=ramp.start.z+(ramp.end.z-ramp.start.z)*t,s=runtime.sampleInteriorWalkSurface(x,z,y,deps);samples.push({expected:ramp.yStart+(ramp.yEnd-ramp.yStart)*t,actual:s?.y,source:s?.source});y=s?.y;}return samples;});
  for(const s of stairs)assert.ok(Math.abs(s.expected-s.actual)<.01,JSON.stringify(s));
  const target=await page.evaluate(()=>{const {ctx}=window.authoredTest,r=ctx.activeInterior.stairs[0],w=ctx.Walk.state.walker;w.x=r.start.x;w.z=r.start.z-.1;w.y=r.yStart+ctx.Walk.CFG.eyeHeight;w.vy=0;w.angle=w.yaw=0;w.pitch=0;w.lookYawOffset=0;w._resolvedGroundState=null;return {z:r.end.z,y:r.yEnd+ctx.Walk.CFG.eyeHeight};});
  let reached=null;await page.keyboard.down('w');
  for(let i=0;i<32;i++){await page.waitForTimeout(250);reached=await page.evaluate(()=>{const {ctx}=window.authoredTest,w=ctx.Walk.state.walker;return {x:w.x,z:w.z,y:w.y,level:ctx.activeInterior.activeLevel};});if(reached.z>=target.z-.1)break;}
  await page.keyboard.up('w');await page.screenshot({path:`${out}/stairs.png`});
  const visual=await page.evaluate(()=>{const {ctx}=window.authoredTest,b=new THREE.Box3().setFromObject(ctx.activeInterior.group);return {camera:ctx.camera.position.toArray(),near:ctx.camera.near,groupVisible:ctx.activeInterior.group.visible,bounds:{min:b.min.toArray(),max:b.max.toArray()},walker:{x:ctx.Walk.state.walker.x,y:ctx.Walk.state.walker.y,z:ctx.Walk.state.walker.z}};});console.log(JSON.stringify(visual));
  assert.ok(reached.z>=target.z-.1,'could not walk to upper landing');assert.ok(Math.abs(reached.y-target.y)<.35,JSON.stringify({target,reached}));assert.equal(reached.level,1);
  await page.screenshot({path:`${out}/walk.png`});
  await page.evaluate(()=>{const {runtime,deps}=window.authoredTest;runtime.clearActiveInterior({restorePlayer:true},deps);});
  assert.equal(await page.evaluate(()=>!!window.authoredTest.ctx.activeInterior),false);
  assert.equal(await page.evaluate(()=>window.authoredTest.ctx.camera.near),.5);
  assert.deepEqual(errors,[]);await writeFile(`${out}/report.json`,JSON.stringify({entry,before:{x:before.x,z:before.z},after,stairs,target,reached,visual,errors,scope:'Actual game entry, W movement, stair ascent, surface sampling and exit; synthetic local layout, no account/cloud verification.'},null,2));
  console.log('Actual game: authored entry, W movement, stair surface continuity and exit passed. Cloud/account not tested.');
}finally{await browser.close();}
