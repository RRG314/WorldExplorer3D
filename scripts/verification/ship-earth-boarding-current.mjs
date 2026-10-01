// Actual Earth boarding, held-key ship walking, lift and observation controls.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
const out='output/verification/ship-earth-boarding';
await mkdir(out,{recursive:true});
const privateDir=await mkdtemp(path.join(tmpdir(),'we3d-sandbox-'));
let identity,server,browser,page;
const errors=[];const failedLocal=[];
const report={ok:false,evidence:'Earth boarding and ship traversal with real keyboard and DOM actions',runtimeRoot:process.env.WE3D_VERIFY_ROOT||'.',checks:{}};
try {
 identity=await stagingCaptureAttestation();
 const credential=path.join(privateDir,'credential.json');
 await writeFile(credential,JSON.stringify({projectId:'we3d-staging-20260712',appId:'1:524178734996:web:f59acbc9014f0e26f51981',expiresAt:new Date(Date.now()+600000).toISOString(),token:identity.token}),{mode:0o600});
 process.env.WE3D_STAGING_APP_CHECK_FILE=credential;
 server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||process.cwd(),ports:[4476]});
 const base=`http://127.0.0.1:${server.port}`;
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failedLocal.push({url:r.url(),status:r.status()});});
 await configureStagingAppCheck(page,base);
 // Delay the on-demand ship CSS to exercise semantic visibility before styles arrive.
 await page.route('**/expedition-ship.css*',async route=>{await new Promise(resolve=>setTimeout(resolve,1500));await route.continue();});
 const url=`${base}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walking`;
 const ready=async()=>{
  await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
  if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
  if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(()=>{const d=globalThis.getWorldExplorerRuntimeDiagnostics?.();return d?.gameStarted&&!d.worldLoading&&d.worldDiscovery?.active&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:180000});
  await page.evaluate(async()=>{globalThis.__sandboxTestContext=(await import('/app/js/shared-context.js?v=55')).ctx;});
 };
 await page.goto(url,{waitUntil:'domcontentloaded'});await ready();
 await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');ctx.setTimeOfDay?.('day');ctx.setWeatherMode?.('clear');});

 await page.evaluate(()=>{globalThis.__shipInputEvents=[];addEventListener('keydown',e=>globalThis.__shipInputEvents.push({code:e.code,target:e.target?.tagName,id:e.target?.id,html:e.target?.outerHTML?.slice(0,240),active:document.activeElement?.id}),true);});
 report.earth=await page.evaluate(()=>{const c=globalThis.__sandboxTestContext;return{buildings:c.buildings?.length,roads:c.roads?.length};});
 assert.ok(report.earth.buildings>0,'A real Earth world must be loaded before boarding');
 await page.locator('#travelBtn').click();await page.locator('#fBoardSolisReach').click();
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.getShipInteriorSnapshot?.()?.active,null,{timeout:120000});
 const read=()=>page.evaluate(()=>{const c=globalThis.__sandboxTestContext,w=c.Walk.state.walker;return{x:w.x,y:w.y,z:w.z,ground:w.onGround,deck:c.getShipInteriorSnapshot().deckId,earthBuildings:c.buildings?.length};});
 report.entry=await read();report.samples=[];
 assert.equal(await page.locator('#shipObservationPanel').evaluate(e=>e.hidden),true,'Unopened observation dialog must be hidden before CSS loads');

 await page.keyboard.down('ArrowDown');
 for(let i=0;i<35;i++){await page.waitForTimeout(200);report.samples.push(await read());if(i===20)report.heldFrame=await page.evaluate(()=>{const c=globalThis.__sandboxTestContext;return{actions:c.readControlActions('walk'),keys:{...c.keys},env:c.getEnv?.(),enabled:c.Walk.state.enabled,paused:c.paused};});}
 await page.keyboard.up('ArrowDown');report.afterWalk=await read();
 report.inputEvents=await page.evaluate(()=>globalThis.__shipInputEvents);
 report.movementDiagnostics=await page.evaluate(()=>{const c=globalThis.__sandboxTestContext,w=c.Walk.state.walker;const h=c.checkBuildingCollision(w.x,w.z-.4,.28,{actorBaseY:0,actorHeight:1.7});return{keys:c.keys,actions:c.readControlActions('walk'),enabled:c.Walk.state.enabled,mode:c.Walk.state.mode,paused:c.paused,focus:document.activeElement?.outerHTML?.slice(0,240),ship:c.activeShipInterior,space:c.spaceFlight.active,blocker:h.building?.sourceBuildingId,interiorKind:c.activeInterior?.environmentKind};});
 assert.ok(report.entry.z-report.afterWalk.z>15,'Retained Earth geometry blocked the ship corridor');
 assert.ok(report.samples.every(p=>p.y>1.6&&p.y<1.9&&Math.abs(p.x)<.1),'Ship floor support was replaced after Earth boarding');
 await page.keyboard.press('KeyE');await page.locator('#shipDeckPicker').waitFor({state:'visible'});await page.locator('#shipDeckPicker [data-deck="engineering"]').click();
 report.lift=await read();await page.keyboard.down('ArrowUp');await page.waitForTimeout(1000);await page.keyboard.up('ArrowUp');report.resumed=await read();
 assert.ok(report.resumed.z-report.lift.z>2,'Walking did not resume after the lift');
 await page.screenshot({path:`${out}/earth-to-engineering.png`});
 await page.locator('#shipViewsButton').click();await page.locator('#shipObservationView').selectOption('above');await page.waitForTimeout(500);await page.keyboard.press('Escape');
 await page.locator('#shipExitButton').click();await page.waitForFunction(()=>!globalThis.__sandboxTestContext.activeShipInterior);
 assert.equal(await page.locator('#shipObservationPanel').count(),0,'Observation resources survived ship exit');
 assert.deepEqual(errors,[]);assert.deepEqual(failedLocal,[]);report.ok=true;
} catch(error){report.failure=String(error);process.exitCode=1;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{report.errors=errors;report.failedLocal=failedLocal;await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server?.close();try{await identity?.cleanup();}finally{await rm(privateDir,{recursive:true,force:true});}console.log(JSON.stringify({ok:report.ok,failure:report.failure,earth:report.earth,entry:report.entry,afterWalk:report.afterWalk,movementDiagnostics:report.movementDiagnostics,inputEvents:report.inputEvents,heldFrame:report.heldFrame,lift:report.lift,resumed:report.resumed,errors,failedLocal}));}
