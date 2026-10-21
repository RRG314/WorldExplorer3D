import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {completeBrowserChecks} from './browser-completion-checks.mjs';
import {collectBrowserGraphicsErrors} from './browser-graphics-errors.mjs';
const framesOnly=process.argv.includes('--frames-only'),remaining=framesOnly||process.argv.includes('--remaining'),baseline=process.argv.includes('--baseline'),root=process.cwd(),servedRoot=path.resolve(process.env.WE3D_VERIFY_ROOT||'.');
const out=process.env.WE3D_COMPLETION_OUTPUT||`output/research/browser-completion-2026-10-20/${framesOnly?'frames':remaining?'remaining':baseline?'baseline':'candidate'}`;
const disk=await fs.statfs(root);assert.ok(disk.bavail*disk.bsize>4*1024**3,'Preserve 4 GiB free disk while verifying');await fs.mkdir(out,{recursive:true});
const privateDir=await fs.mkdtemp(path.join(os.tmpdir(),'we3d-browser-completion-'));let identity,server,owned,page,stage='setup';
const report={passed:false,baseline,remainingOnly:remaining,framesOnly,scope:'One assembled Baltimore world; ordinary transport commands and short input bursts across finite selected-area road publications, repeat-route resource sampling. Local candidate; staging attestation for the world, separate ordinary packaged startup; not live candidate production acceptance.',cases:[],errors:[],visits:[],localFailures:[],consoleErrors:[]};
const mark=name=>{stage=name;console.log(JSON.stringify({stage}));};
const read=()=>page.evaluate(()=>{const c=completionContext;return {mode:c.getCurrentTravelMode(),actor:c.activeTransportActor(),world:c._worldLoadSequence,buildings:c.buildings.length,roads:c.roads.length,transport:{...c.transportDetail?.stats},scenery:c.getRegionalSceneryState?.(),gpu:{...c.renderer.info.memory},heap:performance.memory?.usedJSHeapSize,publicationId:c.worldPublication?.id,residency:c.worldSnapshotStore?{count:c.worldSnapshotStore.residency().resourceCount,keys:c.worldSnapshotStore.residency().regions.map(r=>r.key).sort()}:null};});
try{
 identity=await stagingCaptureAttestation();const credential=path.join(privateDir,'credential.json');await fs.writeFile(credential,JSON.stringify({projectId:'we3d-staging-20260712',appId:'1:524178734996:web:f59acbc9014f0e26f51981',expiresAt:new Date(Date.now()+1800000).toISOString(),token:identity.token}),{mode:0o600});process.env.WE3D_STAGING_APP_CHECK_FILE=credential;
 server=await startStaticServer({rootDir:servedRoot,ports:[4397]});const base=`http://127.0.0.1:${server.port}`;
 owned=await chromium.launchServer({channel:'chrome',headless:true,args:['--js-flags=--max-old-space-size=2048']});const browser=await chromium.connect(owned.wsEndpoint());
 if(!baseline&&!remaining){
  mark('ordinary-packaged-startup');const ordinary=await browser.newContext({viewport:{width:1280,height:800}}),tab=await ordinary.newPage();const errors=[];tab.on('pageerror',e=>errors.push(e.message));collectBrowserGraphicsErrors(tab,errors);
  await tab.goto(`${base}/app/`,{waitUntil:'domcontentloaded'});await tab.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
  report.ordinaryStartup=await tab.evaluate(async()=>({debug:!!globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN,build:await fetch('/build-manifest.json').then(r=>r.json()),startVisible:!!document.getElementById('globeSelectorStartBtn')}));
  assert.equal(report.ordinaryStartup.debug,false);assert.equal(report.ordinaryStartup.build.sourceDirty,false);assert.equal(report.ordinaryStartup.startVisible,true);
  const expectedGuard='Production Firebase is blocked outside the live site. Use staging or emulators for testing.';
  assert.ok(errors.length>0&&errors.every(message=>message===expectedGuard));
  report.ordinaryStartup.localProductionGuard={verified:true,messages:errors.slice(),scope:'Production configuration correctly refuses localhost. Title/UI assets load locally; this is not hosted production-service acceptance.'};
  if(await tab.locator('#analyticsConsentDenyBtn').isVisible())await tab.locator('#analyticsConsentDenyBtn').click();
  await tab.locator('#testerInvitation').waitFor({state:'visible'});await tab.screenshot({path:`${out}/tester-invitation-desktop.png`});
  await tab.locator('#testerInvitationOpen').click();assert.equal(await tab.locator('#testerInvitationForm').isVisible(),true);assert.equal(await tab.locator('#testerInvitationConsent').isChecked(),false);
  await tab.setViewportSize({width:390,height:844});await tab.screenshot({path:`${out}/tester-invitation-mobile.png`});
  const invite=await tab.locator('#testerInvitation').boundingBox(),close=await tab.locator('#testerInvitationClose').boundingBox();assert.ok(invite.x>=0&&invite.x+invite.width<=390&&close.width>=44&&close.height>=44);
  await tab.locator('#testerInvitationClose').focus();await tab.keyboard.press('Escape');await tab.locator('#testerInvitation').waitFor({state:'hidden'});
  await tab.reload({waitUntil:'domcontentloaded'});await tab.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});assert.equal(await tab.locator('#testerInvitation').isVisible(),false);
  report.testerInvitation={passed:true,flow:'explicit interest, Resend verification, private confirmed list; delivery tested separately under controlled HTTP',dismissalPersists:true,keyboardEscape:true,mobileFits:true};
  await ordinary.close();report.cases.push('ordinary isolated production-package startup and dismissible tester invitation without debug attestation');
 }
 page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:!baseline});page.setDefaultTimeout(30000);
 await configureStagingAppCheck(page,base);page.on('pageerror',e=>report.errors.push({stage,message:e.message}));
 collectBrowserGraphicsErrors(page,report.errors);page.on('console',m=>{if(m.type()==='error'&&report.consoleErrors.length<40)report.consoleErrors.push({stage,message:m.text().slice(0,1600)});});
 page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!new URL(r.url()).pathname.startsWith('/api/'))report.localFailures.push({stage,path:new URL(r.url()).pathname,status:r.status()});});
 mark('load-one-Baltimore-world');const start=Date.now();await page.goto(`${base}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=driving`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.evaluate(async()=>{window.completionContext=(await import('/app/js/shared-context.js?v=55')).ctx;window.completionFrames=[];let previous=performance.now();const sample=now=>{completionFrames.push(now-previous);if(completionFrames.length>600)completionFrames.shift();previous=now;window.completionFrameHandle=requestAnimationFrame(sample);};window.completionFrameHandle=requestAnimationFrame(sample);});
 if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(()=>{const c=completionContext;return c?.gameStarted&&!c.worldLoading&&!c.titleLaunchPending&&!c.earthResumePending&&c.worldLoadRuntimeState?.status==='ready'&&c.worldLoadRuntimeState?.gameplayRuntimesReady&&c.buildings?.length&&c.roads?.length;},null,{timeout:300000,polling:1000});
 report.loadMs=Date.now()-start;report.initial=await read();
 // Keep the location-based setting for equal coverage and a bounded source. The
 // residency test below does not silently enable unlimited geographic fetching.
 report.locationBased=await page.evaluate(()=>{const c=completionContext;c.setRegionalSceneryEnabled?.(false);return c.getRegionalSceneryState?.();});
 if(remaining){await completeBrowserChecks({page,out,report,read,mark,remainingOnly:true,framesOnly});}else{
 const samples=await page.evaluate(()=>{const c=completionContext;return [3500,5000,7000].map(target=>{let selected=null,best=Infinity;for(const r of c.roads){if(r.structureSemantics?.terrainMode!=='at_grade')continue;const a=r.pts?.[0],b=r.pts?.[1];if(!a||!b)continue;const x=(a.x+b.x)/2,z=(a.z+b.z)/2,d=Math.hypot(x-target,z);if(d<best){best=d;selected={x,z,id:String(r.sourceFeatureId||r.id),distance:d};}}return selected;});});
 assert.ok(samples.every(p=>p&&p.distance<1500),'Finite mapped source does not cover the selected route');report.route=samples;
 for(let cycle=0;cycle<2;cycle++)for(const [index,target]of [...samples,samples[0]].entries()){
  mark(`route-${cycle+1}-publication-${index+1}`);
  assert.equal(await page.evaluate(p=>completionContext.travelToWorldPoint(p.x,p.z,{source:'large_map_context'})?.valid===true,target),true);
  await page.waitForFunction(()=>{const d=completionContext.transportDetail?.stats;if(d?.error)throw Error(d.error);return d&&!d.activeJobs&&['window-ready','complete'].includes(d.status);},null,{timeout:90000,polling:250});
  await page.waitForTimeout(500);if(index===0){await page.locator('#viewport').click({position:{x:1100,y:700}}).catch(()=>{});await page.keyboard.down('ArrowUp');try{await page.waitForTimeout(350);}finally{await page.keyboard.up('ArrowUp');}await page.waitForTimeout(350);}
  const sample=await read();sample.cycle=cycle;sample.target=target;sample.contact=await page.evaluate(p=>completionContext.roadContactIndex.sampleAt(p.x,p.z,NaN,'at_grade'),target);sample.frames=await page.evaluate(()=>{const a=completionFrames.slice().sort((a,b)=>a-b);return {count:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};});
  assert.equal(sample.world,report.initial.world);assert.equal(sample.buildings,report.initial.buildings);assert.equal(sample.roads,report.initial.roads);assert.ok(Number.isFinite(sample.contact));assert.ok(sample.transport.residentMovingRegions<=sample.transport.maxMovingRegions);report.visits.push(sample);
  if(index===3)await page.screenshot({path:`${out}/return-cycle-${cycle+1}.png`});
 }
 report.cases.push('finite selected-area route and return repeated without world reload or coverage loss');report.cases.push('actual moving-road publications retain contact and a bounded resource window');
 mark('bridge-tunnel-contact');report.structures=await page.evaluate(()=>{const c=completionContext,result={};for(const r of c.roads){const mode=r.structureSemantics?.terrainMode;if(!['elevated','subgrade'].includes(mode)||result[mode])continue;const i=Math.floor((r.pts?.length||0)/2),a=r.pts?.[Math.max(0,i-1)],b=r.pts?.[i];if(!a||!b)continue;const x=(a.x+b.x)/2,z=(a.z+b.z)/2,expected=c.sampleFeatureSurfaceY(r,x,z);result[mode]={id:r.sourceFeatureId,x,z,expected,contact:c.roadContactIndex.sampleAt(x,z,expected,mode)};}return result;});
 for(const record of Object.values(report.structures))assert.ok(Number.isFinite(record.contact));report.cases.push('available bridge and tunnel source/contact records inspected');
 if(!baseline){
  const first=report.visits[3],second=report.visits[7];
  report.routeStability={firstReturn:first.gpu,secondReturn:second.gpu,firstResidency:first.residency,secondResidency:second.residency};
  assert.deepEqual(second.residency,first.residency,'Equal routes must retain the same owned geographic scopes');
  assert.ok(second.gpu.geometries<=first.gpu.geometries&&second.gpu.textures<=first.gpu.textures,'Repeated travel must not grow retained GPU resources');
  await completeBrowserChecks({page,out,report,read,mark});
 }
 }
 report.final=await read();assert.deepEqual(report.errors,[]);assert.deepEqual(report.localFailures,[]);report.passed=true;
}catch(error){report.failure={stage,message:String(error)};process.exitCode=1;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{try{await page?.evaluate(()=>cancelAnimationFrame(window.completionFrameHandle)).catch(()=>{});if(owned)await closeOwnedBrowser(owned);}finally{await server?.close();try{await identity?.cleanup();}finally{await fs.rm(privateDir,{recursive:true,force:true});await fs.writeFile(`${out}/receipt.json`,JSON.stringify(report,null,2));}}console.log(JSON.stringify({passed:report.passed,cases:report.cases,failure:report.failure,errors:report.errors}));}
