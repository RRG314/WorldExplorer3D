import {afterWorldLoad} from './complete-world-readiness.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';

const out=process.env.WE3D_CONTINUITY_OUTPUT||'output/road-continuity/junction-current';
await mkdir(out,{recursive:true});
let server,owned,page;
const report={ok:false,scope:'Controlled arrival at the Middleborough/South Marlyn regression site, followed by normal-key approach, turning and departure. No claim of an uninterrupted worldwide route.',errors:[],warnings:[],arrivals:[]};
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
  await page.waitForFunction(afterWorldLoad(()=>{const d=getWorldExplorerRuntimeDiagnostics();return d.gameStarted&&!d.worldLoading&&d.transportDetail?.pinnedRegions>0&&!document.getElementById('loading')?.classList.contains('show');}),null,{timeout:300000});
  const skip=page.getByRole('button',{name:'Skip guide',exact:true});if(await skip.isVisible())await skip.click();
  await page.evaluate(async()=>{globalThis.roadCtx=(await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||document.documentElement.dataset.runtimeModulePrefix||'')+'/app/js/shared-context.js?v=55')).ctx;roadCtx.setTimeOfDay('day');});
  report.origin=await page.evaluate(()=>({sequence:roadCtx._worldLoadSequence,roads:roadCtx.roads.length,buildings:roadCtx.buildings.length,stats:{...roadCtx.transportDetail?.stats}}));
  console.log('[continuity] World ready '+report.build.buildId);
  for(const x of [10500]){
    await page.evaluate(x=>{const c=roadCtx;Object.assign(c.car,{x,z:200,speed:0,vx:0,vz:0});c.car.y=c.GroundHeight.carCenterY(x,200);c.transportDetail.step({x,z:200,source:'drive'});},x);
    await page.waitForFunction(()=>{const s=roadCtx.transportDetail?.stats;return (s?.error&&!globalThis.__roadFaults)||['window-ready','complete'].includes(s?.status);},null,{timeout:90000,polling:250});
    const arrival=await page.evaluate(()=>{const c=roadCtx;return {x:c.car.x,z:c.car.z,sequence:c._worldLoadSequence,stats:{...c.transportDetail.stats},notice:document.querySelector('[data-transport-readiness]')?.textContent||'',meshes:c.roadMeshes.length,geometry:c.renderer.info.memory.geometries};});
    report.arrivals.push(arrival);console.log(JSON.stringify(arrival));
    await page.screenshot({path:out+`/arrival-${x}.png`});
    assert.equal(arrival.stats.error,null,'Road publication failed during travel');
    assert.equal(arrival.sequence,report.origin.sequence,'Travel must not reload the selected location');
    assert.ok(arrival.stats.residentMovingRegions<=arrival.stats.maxMovingRegions);
  }
  report.junctionProbe=await page.evaluate(()=>{
    const c=roadCtx,x=12157.67978620618,z=1464.8472047390726;
    const selected=c.roads.filter(r=>r.pts?.some(p=>Math.hypot(p.x-x,p.z-z)<.1));
    const plain=value=>JSON.parse(JSON.stringify(value,(_key,v)=>ArrayBuffer.isView(v)?Array.from(v):v));
    return {
      ground:{cut:c.terrainMeshHeightAt(x,z),uncut:c.terrainMeshHeightAt(x,z,{ignorePortalCuts:true})},
      roadKeys:selected.map(r=>Object.keys(r)),
      roads:selected.map(r=>({id:r.sourceFeatureId,name:r.name,type:r.type,width:r.width,pts:r.pts,
        structureSemantics:r.structureSemantics,transportRecord:r.transportRecord,transportGraphRef:r.transportGraphRef,
        structureTransitionAnchors:r.structureTransitionAnchors,transportSurfaceModel:plain(r.transportSurfaceModel),
        links:r.transportConnections?.map(l=>({...l,feature:{id:l.feature.sourceFeatureId,name:l.feature.name,engineered:l.feature.transportSurfaceModel?.engineeredApproach}})),
        excavation:r.engineeredApproachExcavation,ordinaryStreetAnchors:r.ordinaryStreetAnchors})),
      samples:Array.from({length:81},(_,i)=>{const d=i-40;const a=selected.find(r=>r.name==='South Marlyn Avenue').pts.at(-2);const dx=x-a.x,dz=z-a.z,len=Math.hypot(dx,dz);const px=x+d*dx/len,pz=z+d*dz/len;return {d,x:px,z:pz,cut:c.terrainMeshHeightAt(px,pz),uncut:c.terrainMeshHeightAt(px,pz,{ignorePortalCuts:true}),car:c.GroundHeight.carCenterY(px,pz)};})
    };
  });
  await writeFile(out+'/junction-probe.json',JSON.stringify(report.junctionProbe,null,2));
  report.driving=await page.evaluate(()=>{
    const c=roadCtx,road=c.roads.find(r=>r.name==='South Marlyn Avenue'&&r.pts?.some(p=>Math.hypot(p.x-12157.68,p.z-1464.85)<10));
    if(!road)throw Error('Captured road regression site not present in this provider response');
    const end=road.pts.at(-1),a=road.pts.at(-2),length=Math.hypot(end.x-a.x,end.z-a.z),t=Math.max(0,1-60/length);
    Object.assign(c.car,{x:a.x+(end.x-a.x)*t,z:a.z+(end.z-a.z)*t,angle:Math.atan2(end.x-a.x,end.z-a.z),speed:0,vx:0,vz:0,yawRate:0});
    c.car.y=c.GroundHeight.carCenterY(c.car.x,c.car.z);c.paused=false;
    const through=c.roads.find(r=>r.name==='Middleborough Road'&&r.pts?.some(p=>Math.hypot(p.x-end.x,p.z-end.z)<.1));
    const i=through.pts.findIndex(p=>Math.hypot(p.x-end.x,p.z-end.z)<.1),b=through.pts[i+1];
    const run=Math.hypot(b.x-end.x,b.z-end.z);
    return {start:{x:c.car.x,y:c.car.y,z:c.car.z},junction:end,exit:{x:end.x+(b.x-end.x)*40/run,z:end.z+(b.z-end.z)*40/run}};
  });
  await page.waitForFunction(()=>{const s=roadCtx.transportDetail.stats;return !s.error&&!s.activeJobs&&roadCtx.transportDetail.readyAt(roadCtx.car);},null,{timeout:90000});
  await runPrescribedGameActions(page,out,[{buttons:[],frames:90},{buttons:['up'],frames:6},{buttons:[],frames:2}],'body > canvas:not(#minimap)');
  // Follow the actual mapped T-junction using ordinary keys. A provider may
  // omit the opposite branch, so driving straight into its bank is not a
  // junction-crossing test. Never move/rotate the actor after the starting pose.
  const route=[report.driving.start,report.driving.junction,report.driving.exit];
  const lengths=route.slice(1).map((p,i)=>Math.hypot(p.x-route[i].x,p.z-route[i].z));
  let held=new Set();report.driving.trajectory=[];
  for(let tick=0;tick<650;tick++){
    const car=await page.evaluate(()=>({x:roadCtx.car.x,y:roadCtx.car.y,z:roadCtx.car.z,angle:roadCtx.car.angle,speed:roadCtx.car.speed}));
    report.driving.trajectory.push(car);
    if(Math.hypot(car.x-route[2].x,car.z-route[2].z)<5)break;
    let closest={distance:Infinity,progress:0},offset=0;
    for(let i=0;i<2;i++){
      const a=route[i],b=route[i+1],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((car.x-a.x)*dx+(car.z-a.z)*dz)/(lengths[i]**2)));
      const distance=Math.hypot(car.x-a.x-dx*t,car.z-a.z-dz*t);
      if(distance<closest.distance)closest={distance,progress:offset+t*lengths[i]};
      offset+=lengths[i];
    }
    let targetDistance=Math.min(lengths[0]+lengths[1],closest.progress+5.5),target;
    for(let i=0;i<2;i++){
      if(targetDistance<=lengths[i]||i===1){const t=Math.min(1,targetDistance/lengths[i]);target={x:route[i].x+(route[i+1].x-route[i].x)*t,z:route[i].z+(route[i+1].z-route[i].z)*t};break;}
      targetDistance-=lengths[i];
    }
    const desired=Math.atan2(target.x-car.x,target.z-car.z),error=Math.atan2(Math.sin(desired-car.angle),Math.cos(desired-car.angle));
    const nearTurn=closest.progress>lengths[0]-12&&closest.progress<lengths[0]+10;
    const next=new Set(car.speed<(nearTurn?12:24)?['ArrowUp']:[]);
    if(error>.07)next.add('ArrowLeft');else if(error<-.07)next.add('ArrowRight');
    for(const key of held)if(!next.has(key))await page.keyboard.up(key);
    for(const key of next)if(!held.has(key))await page.keyboard.down(key);
    held=next;await page.evaluate(()=>advanceTime(100));
  }
  for(const key of held)await page.keyboard.up(key);

  report.driving.end=await page.evaluate(()=>({x:roadCtx.car.x,y:roadCtx.car.y,z:roadCtx.car.z}));
  report.driving.distance=Math.hypot(report.driving.end.x-report.driving.start.x,report.driving.end.z-report.driving.start.z);
  report.driving.exitDistance=Math.hypot(report.driving.end.x-report.driving.exit.x,report.driving.end.z-report.driving.exit.z);
  assert.ok(report.driving.exitDistance<5,'Actual controls must enter the junction, turn and continue along its connected road');
  report.final=await page.evaluate(()=>({sequence:roadCtx._worldLoadSequence,stats:{...roadCtx.transportDetail.stats},faults:globalThis.__roadFaults||0,notice:document.querySelector('[data-transport-readiness]')?.textContent||''}));
  assert.equal(report.final.sequence,report.origin.sequence);
  assert.equal(report.final.stats.error,null);
  if(report.controlledFault){assert.equal(report.final.faults,1);assert.equal(report.final.stats.recoveries,1);}
  await page.screenshot({path:out+'/distant-driving.png'});
  await writeFile(out+'/game-state.json',await page.evaluate(()=>render_game_to_text()));
  assert.deepEqual(report.errors,[]);report.ok=true;
}catch(error){report.failure=String(error);if(page){report.failureState=await page.evaluate(()=>globalThis.roadCtx?{stats:{...roadCtx.transportDetail?.stats},notice:document.querySelector('[data-transport-readiness]')?.textContent,diagnostics:getWorldExplorerRuntimeDiagnostics()}:null).catch(()=>null);await page.screenshot({path:out+'/failure.png'}).catch(()=>{});}throw error;
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));if(owned)await closeOwnedBrowser(owned);await server?.close();}
