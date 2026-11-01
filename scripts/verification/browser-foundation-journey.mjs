import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {verifyTransportResidency} from './transport-residency-world.mjs';
const spaceReturnOnly=process.argv.includes('--space-return');
const marineOnly=process.argv.includes('--marine-start');
const out=`output/research/browser-foundation-implementation-2026-10-19/${marineOnly?'marine-start':spaceReturnOnly?'space-return':'world'}`;
await mkdir(out,{recursive:true});
const privateDir=await mkdtemp(path.join(tmpdir(),'we3d-foundation-'));
let identity,server,browser,owned,page,stage='setup';
const report={passed:false,scope:'Mutable source, real Baltimore world, DOM/keyboard travel and ship controls; explicit road placements isolate residency. Staging debug attestation, no performance or production claim.',cases:[],errors:[],localFailures:[]};
const mark=name=>{stage=name;console.log(JSON.stringify({stage}));};
try {
 identity=await stagingCaptureAttestation();
 const credential=path.join(privateDir,'credential.json');
 await writeFile(credential,JSON.stringify({projectId:'we3d-staging-20260712',appId:'1:524178734996:web:f59acbc9014f0e26f51981',expiresAt:new Date(Date.now()+1200000).toISOString(),token:identity.token}),{mode:0o600});
 process.env.WE3D_STAGING_APP_CHECK_FILE=credential;
 server=await startStaticServer({rootDir:process.cwd(),ports:[4397]});
 const base=`http://127.0.0.1:${server.port}`;
 owned=await chromium.launchServer({channel:'chrome',headless:true});browser=await chromium.connect(owned.wsEndpoint());
 page=await browser.newPage({viewport:{width:1360,height:850}});page.setDefaultTimeout(30000);
 page.on('pageerror',e=>report.errors.push({stage,message:e.message}));
 page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)report.localFailures.push({stage,path:new URL(r.url()).pathname,status:r.status()});});
 await configureStagingAppCheck(page,base);
 mark('open-title');
 await page.goto(`${base}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=driving`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.evaluate(async()=>{window.foundationContext=(await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||document.documentElement.dataset.runtimeModulePrefix||'')+'/app/js/shared-context.js?v=55')).ctx;window.foundationControl=(await import('/app/js/transport/control-state.js')).resolveControlState;});
 if(spaceReturnOnly)await page.locator('#globeSelectorSpaceBtn').click();
 else if(!marineOnly&&await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
 const ready=()=>page.waitForFunction(()=>{const c=window.foundationContext;return c?.gameStarted&&!c.worldLoading&&!c.titleLaunchPending&&!document.querySelector('#loading.show')&&c.buildings?.length>0&&c.roads?.length>0&&c.worldDiscoveryRuntime&&!c.worldDiscoveryRuntime.disposed;},null,{timeout:210000,polling:1000});
 if(!spaceReturnOnly&&!marineOnly)await ready();
 const read=()=>page.evaluate(()=>{const c=foundationContext;return {control:foundationControl(c),actor:c.activeTransportActor(),buildings:c.buildings.length,roads:c.roads.length,sequence:c._worldLoadSequence};});
 const travel=async id=>{await page.locator('#travelBtn').click();await page.locator(id).click();};
 const held=async(key,ms)=>{await page.keyboard.down(key);try{await page.waitForTimeout(ms);}finally{await page.keyboard.up(key);}};
 if(!spaceReturnOnly&&!marineOnly){
 report.initial=await read();assert.equal(report.initial.control.mode,'drive');
 mark('road-publication-retirement');report.residency=await verifyTransportResidency(page,out);report.cases.push('mapped-road-publication-return-and-retirement');
 mark('surface-mode-handoffs');
 await travel('#fWalk');let walk=await read();assert.equal(walk.control.locomotion,'walk');
 await held('ArrowUp',750);let moved=await read();assert.ok(Math.hypot(moved.actor.position.x-walk.actor.position.x,moved.actor.position.z-walk.actor.position.z)>.05,'Walking input did not move the actor');
 await travel('#fDrone');let drone=await read();assert.equal(drone.control.controller,'drone');assert.ok(Math.hypot(drone.actor.position.x-moved.actor.position.x,drone.actor.position.z-moved.actor.position.z)<20,'Drone launched from the parked actor');
 await held('ArrowUp',500);await travel('#fPlane');let plane=await read();assert.equal(plane.control.controller,'plane');assert.equal(plane.control.camera,'plane');
 await page.screenshot({path:`${out}/plane-handoff.png`});
 await travel('#fDriving');assert.equal((await read()).control.mode,'drive');report.cases.push('drive-walk-drone-plane-drive');
 mark('earth-ship-walk-return');
 await travel('#fBoardSolisReach');await page.waitForFunction(()=>foundationContext.activeShipInterior===true,null,{timeout:90000});
 const ship=await read();assert.equal(ship.control.frame,'ship-interior');
 await held('ArrowDown',1000);const shipMoved=await read();assert.ok(Math.hypot(shipMoved.actor.position.x-ship.actor.position.x,shipMoved.actor.position.z-ship.actor.position.z)>.1,'Ship input did not move the actor');
 await page.screenshot({path:`${out}/ship-walk.png`});
 await page.locator('#shipExitButton').click();await page.waitForFunction(()=>!foundationContext.activeShipInterior);assert.equal((await read()).control.frame,'space');report.cases.push('earth-ship-interior-walk-return-to-flight');
 }
 if(!marineOnly){
 mark('space-return-to-earth');
 await page.waitForFunction(()=>foundationContext.spaceFlight?.active===true&&!foundationContext.worldLoading,null,{timeout:90000});
 assert.equal((await read()).control.controller,'space');await page.screenshot({path:`${out}/space.png`});
 await page.locator('#universeToggle').click();await page.locator('#universeReturnEarthBtn').click();
 await ready();report.returned=await read();assert.equal(report.returned.control.frame,'surface');
 assert.ok(['walk','drive'].includes(report.returned.control.mode));assert.equal(report.returned.control.camera,report.returned.control.controller);assert.ok(Number.isFinite(report.returned.actor.position.y));
 await page.screenshot({path:`${out}/returned-earth.png`});report.cases.push(spaceReturnOnly?'title-space-earth':'earth-ship-space-earth');
 }
 mark('research-vessel-admission');
 if(!marineOnly)await page.locator('#mainMenuBtn').click();await page.locator('#coralResearchStart').click();
 await page.waitForFunction(()=>foundationContext.boatDeck?.active===true&&!foundationContext.titleLaunchPending,null,{timeout:120000});
 const marine=await read();assert.equal(marine.control.occupancy,'vessel-deck');assert.equal(marine.actor.identity.domain,'person');report.marine=marine;
 await page.screenshot({path:`${out}/research-vessel.png`});report.cases.push('research-vessel-start-with-deck-actor');
 assert.deepEqual(report.errors,[]);
 assert.deepEqual(report.localFailures.filter(f=>!f.path.startsWith('/api/')),[],'A local source or asset failed to load');
 report.passed=true;
} catch(error){report.failure={stage,message:String(error)};process.exitCode=1;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally {
 await writeFile(`${out}/receipt.json`,JSON.stringify(report,null,2));
 if(owned)await closeOwnedBrowser(owned);await server?.close();
 try{await identity?.cleanup();}finally{await rm(privateDir,{recursive:true,force:true});}
 console.log(JSON.stringify({passed:report.passed,cases:report.cases,failure:report.failure,errors:report.errors,localFailures:report.localFailures}));
}
