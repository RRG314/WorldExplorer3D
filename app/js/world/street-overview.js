import {yieldToMainThread,yieldToWorldFrame} from './cooperative-scheduling.js?v=1';
import {streetSourceInputCooperatively,sendStreetSourceInChunks} from './street-source-input.js';
import {createPavementTerrainMask,createPavementMaterialBinding} from './pavement-terrain-mask.js';

// Complete source coverage lives in the terrain material. Raised geometry and
// walking contact are published separately near the player. Terrain movement
// cannot bury this distant layer because it is part of the terrain itself.
export function createStreetOverview(appCtx,{onComplete=()=>{}}={}){
 const sequence=appCtx._worldLoadSequence,startedAt=performance.now();
 let worker=null,pending=null,active=null,disposed=false,sources=[],prepared=false,coveragePrepared=false,mask=null,stagedMask=null,completedBounds=null,generation=0;
 const completedKeys=new Set();
 const materialBinding=createPavementMaterialBinding(appCtx);
 // Install one stable shader interface before the first playable render. Cell
 // data and replacement atlases change uniforms, never the terrain program.
 mask=createPavementTerrainMask(appCtx,[],{materialBinding});mask.activate();mask.syncMaterials();
 let materialSyncAt=-Infinity;
 const sourceLists=()=>[appCtx.roads,appCtx.buildings,appCtx.landuses,appCtx.linearFeatures];
 const sourcesMatch=()=>sourceLists().every((list,i)=>sources[i]?.list===list&&sources[i]?.length===(list?.length||0));
 const valid=()=>!disposed&&sequence===appCtx._worldLoadSequence&&!appCtx.onMoon;
 const stats={status:'waiting',representation:'terrain material coverage',completedCells:0,totalCells:null,nonemptyCells:0,coveredSquareWorldUnits:0,
   positionBytes:0,retainedBytes:0,drawCalls:0,workerActive:false,sourceScope:'complete loaded location',error:null};
 const request=data=>new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending=null;reject(new Error('Overview cell exceeded 15 seconds'));},15000);
   pending={resolve:value=>{clearTimeout(timer);pending=null;resolve(value);},reject:error=>{clearTimeout(timer);pending=null;reject(error);}};
   try{worker.postMessage(data);}catch(error){pending.reject(error);}
 });
 function setDetailBounds(bounds){mask?.setDetailBounds(bounds);stagedMask?.setDetailBounds(bounds);}
 async function advance(focus,run){
   const current=()=>valid()&&run===generation&&sourcesMatch();
   if(!worker){
     const workerUrl=globalThis.__WORLD_EXPLORER_PRODUCTION__?.streetOverviewWorkerUrl ||
       new URL('./compiler/street-overview-worker.js',import.meta.url);
     worker=new Worker(workerUrl,{type:'module'});stats.workerActive=true;
     const instance=worker;
     worker.onmessage=event=>{if(worker===instance)event.data.type==='error'?pending?.reject(new Error(event.data.message)):pending?.resolve(event.data);};
     worker.onerror=event=>{if(worker===instance)pending?.reject(new Error(event.message));};
   }
   if(!prepared||!sourcesMatch()){
     const newSources=!coveragePrepared||!sourcesMatch();
     if(newSources){completedKeys.clear();coveragePrepared=false;}
     sources=sourceLists().map(list=>({list,length:list?.length||0}));
     const schedule={current,yieldWork:()=>appCtx.worldLoading?yieldToMainThread():yieldToWorldFrame(),budgetMs:2};
     const input=await streetSourceInputCooperatively(appCtx,()=>true,schedule);
     await sendStreetSourceInChunks(input,request,schedule);
     if(!current())return;
     const plan=await request({type:'prepare',completedKeys:[...completedKeys]});if(!current())return;
     if(!coveragePrepared){
       stagedMask?.dispose();stagedMask=createPavementTerrainMask(appCtx,plan.keys,{materialBinding});
       if(stats.totalCells===null){mask.dispose();mask=stagedMask;stagedMask=null;mask.activate();}
       setDetailBounds(appCtx.streetPavement?.coverageBounds);
       Object.assign(stats,{totalCells:plan.tiles,sourceCells:plan.sourceCells,excludedCells:plan.excludedCells,completedCells:0,nonemptyCells:0,coveredSquareWorldUnits:0,
         retainedBytes:(stagedMask||mask).bytes,maskResolution:(stagedMask||mask).layout.resolution,worldUnitsPerTexel:64/(stagedMask||mask).layout.resolution});
       coveragePrepared=true;
     }
     prepared=true;
   }
   const target=stagedMask||mask;
   const packet=await request({type:'next',focus,resolution:target.layout.resolution});
   if(!current())return;
   if(packet.type==='complete'){await complete(current);return;}
   target.publish(packet.key,packet.mask);completedKeys.add(packet.key);stats.completedCells++;stats.uploads={...target.uploadStats};
   if(packet.coveredSquareWorldUnits>0)stats.nonemptyCells++;
   stats.coveredSquareWorldUnits+=packet.coveredSquareWorldUnits||0;
   if(!packet.remaining)await complete(current);
 }
 async function complete(current){
   if(stats.completedCells!==stats.totalCells)throw new Error('Location pavement ended before every planned cell was published');
   if(stagedMask){mask?.dispose();mask=stagedMask;stagedMask=null;mask.activate();}
   const l=mask.layout;
   completedBounds=stats.totalCells?{minX:l.minX*64,maxX:(l.minX+l.lookupWidth)*64,minZ:l.minZ*64,maxZ:(l.minZ+l.lookupHeight)*64}:null;
   stats.status='finishing';stats.coverageBounds=completedBounds;
   worker?.terminate();worker=null;prepared=false;stats.workerActive=false;
   stats.materials=mask.syncMaterials();await onComplete(completedBounds);
   if(current()){stats.status='complete';stats.durationMs=Math.round(performance.now()-startedAt);}
 }
 function step(focus){
   setDetailBounds(appCtx.streetPavement?.coverageBounds);
   if(!valid())return;
   const now=performance.now();
   if(mask&&now-materialSyncAt>=500){stats.materials=mask.syncMaterials();materialSyncAt=now;}
   if(active)return;
   if((stats.status==='failed'||stats.status==='complete')&&sourcesMatch())return;
   if(stats.status==='failed'){prepared=false;stats.error=null;}
   stats.status='building';
   const coordinate=value=>Number.isFinite(Number(value))?Number(value):0;
   const point={x:coordinate(focus?.x),z:coordinate(focus?.z)};
   // At most one acknowledged cell per rendered frame, never an 80 ms burst.
   const run=++generation;
   active=advance(point,run).catch(error=>{if(valid()&&run===generation){stats.status='failed';stats.error=String(error.message);worker?.terminate();worker=null;stats.workerActive=false;}}).finally(()=>{if(run===generation)active=null;});
 }
 function suspendForDetail(){
   // A source scan/worker preparation is not a single cell. Waiting for that
   // whole task lets distant work block a new arrival and retains its full
   // plan alongside the detail compiler. Retire only unaccepted work. The
   // published atlas and completed cell identities survive and resume later.
   if(stats.status==='complete')return active||Promise.resolve();
   generation++;worker?.terminate();worker=null;
   pending?.reject(new Error('Overview yielded to nearby detail'));
   active=null;prepared=false;stats.workerActive=false;
   if(valid())stats.status='suspended';
   return Promise.resolve();
 }
 async function prepareInitialCoverage(focus,{current=()=>true,onProgress=()=>{}}={}){
   // Initial coverage belongs to the loading session. During play, the same
   // owner still advances one cell per frame as regional sources change.
   if(!appCtx.worldLoading)throw new Error('Initial pavement preparation requires the loading cover');
   while(valid()&&current()){
     if(stats.status==='failed')throw new Error(stats.error||'Location pavement preparation failed');
     if(stats.status==='complete'&&sourcesMatch())return true;
     step(focus);await (active||Promise.resolve());
     if(valid()&&current())onProgress({completed:stats.completedCells,total:stats.totalCells});
   }
   return false;
 }
 function dispose(){disposed=true;generation++;worker?.terminate();pending?.reject(new Error('Overview disposed'));completedKeys.clear();mask?.dispose();stagedMask?.dispose();mask=stagedMask=null;materialBinding.dispose();stats.status='disposed';stats.retainedBytes=0;stats.workerActive=false;}
 return {stats,step,prepareInitialCoverage,setDetailBounds,get completedBounds(){return completedBounds;},pause:()=>active||Promise.resolve(),suspendForDetail,dispose};
}
