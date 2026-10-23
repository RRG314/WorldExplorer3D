import {yieldToMainThread,yieldToWorldFrame} from './cooperative-scheduling.js?v=1';
import {streetSourceInputCooperatively,sendStreetSourceInChunks} from './street-source-input.js';
import {createPavementTerrainMask,createPavementMaterialBinding} from './pavement-terrain-mask.js';

// Complete source coverage lives in the terrain material. Raised geometry and
// walking contact are published separately near the player. Terrain movement
// cannot bury this distant layer because it is part of the terrain itself.
export function createStreetOverview(appCtx,{onComplete=()=>{},deferPresentation=false}={}){
 const sequence=appCtx._worldLoadSequence,startedAt=performance.now();
 let worker=null,pending=null,active=null,disposed=false,sources=[],prepared=false,coveragePrepared=false,mask=null,stagedMask=null,completedBounds=null,generation=0;
 const completedKeys=new Set();
 let coverageReady=false,preparedBounds=null,initialTask=null,initialProgress=()=>{},completionTask=null;
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
     if(newSources){completedKeys.clear();coveragePrepared=false;coverageReady=false;}
     sources=sourceLists().map(list=>({list,length:list?.length||0}));
     const loading=appCtx.worldLoading===true;
     const schedule={current,yieldWork:()=>loading?yieldToMainThread():yieldToWorldFrame(),budgetMs:loading?8:2};
     let phaseStarted=performance.now();
     const input=await streetSourceInputCooperatively(appCtx,()=>true,schedule);
     stats.sourceSnapshotMs=performance.now()-phaseStarted;phaseStarted=performance.now();
     // Each acknowledged message already ends the sending task. Under the
     // loading cover, another scheduler yield lets terrain's continuation run
     // ahead of every source chunk. Play retains its frame-aware handoff.
     await sendStreetSourceInChunks(input,request,loading?{current,chunkSize:512}:schedule);
     stats.sourceTransferMs=performance.now()-phaseStarted;phaseStarted=performance.now();
     if(!current())return;
     const plan=await request({type:'prepare',completedKeys:[...completedKeys]});if(!current())return;
     stats.sourcePlanMs=performance.now()-phaseStarted;
     if(!coveragePrepared){
       stagedMask?.dispose();stagedMask=createPavementTerrainMask(appCtx,plan.keys,{materialBinding,deferUpload:appCtx.worldLoading===true});
       if(stats.totalCells===null){mask.dispose();mask=stagedMask;stagedMask=null;mask.activate();}
       setDetailBounds(appCtx.streetPavement?.coverageBounds);
       Object.assign(stats,{totalCells:plan.tiles,sourceCells:plan.sourceCells,excludedCells:plan.excludedCells,completedCells:0,nonemptyCells:0,coveredSquareWorldUnits:0,workerPackets:0,workerMs:0,
         retainedBytes:(stagedMask||mask).bytes,maskResolution:(stagedMask||mask).layout.resolution,worldUnitsPerTexel:64/(stagedMask||mask).layout.resolution});
       coveragePrepared=true;
     }
     prepared=true;
   }
   const target=stagedMask||mask;
   const packet=await request({type:'next',focus,resolution:target.layout.resolution,...(appCtx.worldLoading?{batchSize:32}:{})});
   if(!current())return;
   if(packet.type==='complete'){await complete(current);return;}
   for(const cell of packet.type==='tiles'?packet.tiles:[packet]){
     target.publish(cell.key,cell.mask);completedKeys.add(cell.key);stats.completedCells++;
     if(cell.coveredSquareWorldUnits>0)stats.nonemptyCells++;
     stats.coveredSquareWorldUnits+=cell.coveredSquareWorldUnits||0;
   }
   stats.uploads={...target.uploadStats};
   stats.workerPackets=(stats.workerPackets||0)+1;stats.workerMs=(stats.workerMs||0)+(packet.workMs||0);
   if(!packet.remaining)await complete(current);
 }
 async function complete(current){
   if(stats.completedCells!==stats.totalCells)throw new Error('Location pavement ended before every planned cell was published');
   if(stagedMask){mask?.dispose();mask=stagedMask;stagedMask=null;mask.activate();}
   const l=mask.layout;
   preparedBounds=stats.totalCells?{minX:l.minX*64,maxX:(l.minX+l.lookupWidth)*64,minZ:l.minZ*64,maxZ:(l.minZ+l.lookupHeight)*64}:null;
   worker?.terminate();worker=null;prepared=false;stats.workerActive=false;
   mask.finishBulkUpload();coverageReady=true;stats.status='prepared';
   if(!deferPresentation)await publishPreparedCoverage({current});
 }
 async function publishPreparedCoverage({current=()=>true}={}){
   if(!valid()||!current()||!coverageReady||!sourcesMatch())return false;
   if(stats.status==='complete')return true;
   if(completionTask)return completionTask;
   deferPresentation=false;
   completionTask=(async()=>{
     stats.status='finishing';completedBounds=preparedBounds;stats.coverageBounds=completedBounds;
     stats.materials=mask.syncMaterials();await onComplete(completedBounds);
     if(!valid()||!current())return false;
     stats.status='complete';stats.durationMs=Math.round(performance.now()-startedAt);return true;
   })().finally(()=>{completionTask=null;});
   return completionTask;
 }
 function step(focus){
   setDetailBounds(appCtx.streetPavement?.coverageBounds);
   if(!valid())return;
   const now=performance.now();
   if(mask&&now-materialSyncAt>=500){stats.materials=mask.syncMaterials();materialSyncAt=now;}
   if(active)return;
   if(coverageReady&&sourcesMatch())return;
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
   initialProgress=onProgress;
   if(initialTask)return initialTask;
   initialTask=(async()=>{while(valid()&&current()){
     if(stats.status==='failed')throw new Error(stats.error||'Location pavement preparation failed');
     if(coverageReady&&sourcesMatch())return true;
     step(focus);await (active||Promise.resolve());
     if(valid()&&current())initialProgress({completed:stats.completedCells,total:stats.totalCells});
   }
   return false;})().finally(()=>{initialTask=null;});
   return initialTask;
 }
 function dispose(){disposed=true;generation++;worker?.terminate();pending?.reject(new Error('Overview disposed'));completedKeys.clear();mask?.dispose();stagedMask?.dispose();mask=stagedMask=null;materialBinding.dispose();stats.status='disposed';stats.retainedBytes=0;stats.workerActive=false;}
 return {stats,step,prepareInitialCoverage,publishPreparedCoverage,setDetailBounds,get initialPreparationPending(){return deferPresentation;},get completedBounds(){return completedBounds;},pause:()=>active||Promise.resolve(),suspendForDetail,dispose};
}
