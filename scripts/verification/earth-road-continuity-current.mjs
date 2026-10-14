import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';

const out=process.env.WE3D_CONTINUITY_OUTPUT||'output/road-continuity/local-recovery-current';
await mkdir(out,{recursive:true});
let server,owned,page;
const report={ok:false,scope:'Controlled long-distance road arrivals with actual render/contact publication; keyboard motion checked separately. No claim of an uninterrupted worldwide route.',errors:[],warnings:[],arrivals:[]};
try{
  if(process.env.WE3D_VERIFY_ROOT)server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT,ports:[4595]});
  const base=server?`http://127.0.0.1:${server.port}`:(process.env.WE3D_VERIFY_BASE_URL||'https://worldexplorer3d.io');
  report.base=base;report.build=await(await fetch(base+'/build-manifest.json')).json();
  owned=await chromium.launchServer({channel:'chrome',headless:false,args:['--js-flags=--max-old-space-size=1536']});
  const browser=await chromium.connect(owned.wsEndpoint());page=await browser.newPage({viewport:{width:1280,height:800}});
  await configureStagingAppCheck(page,base);
  page.on('pageerror',error=>report.errors.push(String(error)));
  if(process.env.WE3D_ROAD_FAULT==='once'){
    report.controlledFault='One worker compile response interrupted; actual replacement worker must recover without navigation.';
    await page.addInitScript(()=>{
      const NativeWorker=Worker;globalThis.__roadFaults=0;
      globalThis.Worker=class extends NativeWorker {
        constructor(url,options){super(url,options);this.roadWorker=String(url).includes('transport-detail-worker');}
        postMessage(data,...rest){if(this.roadWorker&&data.type==='compile'&&!globalThis.__roadFaults){globalThis.__roadFaults++;queueMicrotask(()=>this.onmessage?.({data:{type:'error',message:'Controlled road worker interruption'}}));return;}super.postMessage(data,...rest);}
      };
    });
  }

  page.on('console',m=>{if(['warning','error'].includes(m.type())&&report.warnings.length<80)report.warnings.push(m.text().slice(0,800));});
  await page.goto(base+'/app/?launch=earth&gm=free&loc=custom&lat=39.3098&lon=-76.6147&lname=Baltimore&mode=driving&diagnostics=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
  if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(()=>{const d=getWorldExplorerRuntimeDiagnostics();return d.gameStarted&&!d.worldLoading&&d.transportDetail?.pinnedRegions>0&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:300000});
  const skip=page.getByRole('button',{name:'Skip guide',exact:true});if(await skip.isVisible())await skip.click();
  await page.evaluate(async()=>{globalThis.roadCtx=(await import('/app/js/shared-context.js?v=55')).ctx;roadCtx.setTimeOfDay('day');});
  report.origin=await page.evaluate(()=>({sequence:roadCtx._worldLoadSequence,roads:roadCtx.roads.length,buildings:roadCtx.buildings.length,stats:{...roadCtx.transportDetail?.stats}}));
  console.log('[continuity] World ready '+report.build.buildId);
  for(const x of [2500,4500,6500,8500,10500,6500,2500,-2500,-6500,-10500,0]){
    await page.evaluate(x=>{const c=roadCtx;Object.assign(c.car,{x,z:200,speed:0,vx:0,vz:0});c.car.y=c.GroundHeight.carCenterY(x,200);c.transportDetail.step({x,z:200,source:'drive'});},x);
    await page.waitForFunction(()=>{const s=roadCtx.transportDetail?.stats;return (s?.error&&!globalThis.__roadFaults)||['window-ready','complete'].includes(s?.status);},null,{timeout:90000,polling:250});
    const arrival=await page.evaluate(()=>{const c=roadCtx;return {x:c.car.x,z:c.car.z,sequence:c._worldLoadSequence,stats:{...c.transportDetail.stats},notice:document.querySelector('[data-transport-readiness]')?.textContent||'',meshes:c.roadMeshes.length,geometry:c.renderer.info.memory.geometries};});
    report.arrivals.push(arrival);console.log(JSON.stringify(arrival));
    await page.screenshot({path:out+`/arrival-${x}.png`});
    assert.equal(arrival.stats.error,null,'Road publication failed during travel');
    assert.equal(arrival.sequence,report.origin.sequence,'Travel must not reload the selected location');
    assert.ok(arrival.stats.residentMovingRegions<=arrival.stats.maxMovingRegions);
  }
  report.driving=await page.evaluate(()=>{
    const c=roadCtx,road=c.roads.find(r=>r.name==='South Marlyn Avenue'&&r.pts?.some(p=>Math.hypot(p.x-12157.68,p.z-1464.85)<10));
    if(!road)throw Error('Captured road regression site not present in this provider response');
    const end=road.pts.at(-1),a=road.pts.at(-2),length=Math.hypot(end.x-a.x,end.z-a.z),t=Math.max(0,1-60/length);
    Object.assign(c.car,{x:a.x+(end.x-a.x)*t,z:a.z+(end.z-a.z)*t,angle:Math.atan2(end.x-a.x,end.z-a.z),speed:0,vx:0,vz:0,yawRate:0});
    c.car.y=c.GroundHeight.carCenterY(c.car.x,c.car.z);c.paused=false;
    return {start:{x:c.car.x,y:c.car.y,z:c.car.z},junction:end};
  });
  await page.waitForFunction(()=>{const s=roadCtx.transportDetail.stats;return !s.error&&!s.activeJobs&&roadCtx.transportDetail.readyAt(roadCtx.car);},null,{timeout:90000});
  await runPrescribedGameActions(page,out,[{buttons:['up'],frames:240},{buttons:[],frames:6}],'body > canvas:not(#minimap)');
  report.driving.end=await page.evaluate(()=>({x:roadCtx.car.x,y:roadCtx.car.y,z:roadCtx.car.z}));
  report.driving.distance=Math.hypot(report.driving.end.x-report.driving.start.x,report.driving.end.z-report.driving.start.z);
  assert.ok(report.driving.distance>5,'Actual controls must move the car on the distant road');
  report.final=await page.evaluate(()=>({sequence:roadCtx._worldLoadSequence,stats:{...roadCtx.transportDetail.stats},faults:globalThis.__roadFaults||0,notice:document.querySelector('[data-transport-readiness]')?.textContent||''}));
  assert.equal(report.final.sequence,report.origin.sequence);
  assert.equal(report.final.stats.error,null);
  if(report.controlledFault){assert.equal(report.final.faults,1);assert.equal(report.final.stats.recoveries,1);}
  await page.screenshot({path:out+'/distant-driving.png'});
  await writeFile(out+'/game-state.json',await page.evaluate(()=>render_game_to_text()));
  assert.deepEqual(report.errors,[]);report.ok=true;
}catch(error){report.failure=String(error);if(page){report.failureState=await page.evaluate(()=>globalThis.roadCtx?{stats:{...roadCtx.transportDetail?.stats},notice:document.querySelector('[data-transport-readiness]')?.textContent,diagnostics:getWorldExplorerRuntimeDiagnostics()}:null).catch(()=>null);await page.screenshot({path:out+'/failure.png'}).catch(()=>{});}throw error;
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));if(owned)await closeOwnedBrowser(owned);await server?.close();}
