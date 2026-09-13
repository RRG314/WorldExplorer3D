import {streetSourceInput} from './street-source-input.js';
import {createPavementTerrainMask} from './pavement-terrain-mask.js';
import {yieldToMainThread} from './cooperative-scheduling.js?v=1';

// Complete source coverage lives in the terrain material. Raised geometry and
// walking contact are published separately near the player. Terrain movement
// cannot bury this distant layer because it is part of the terrain itself.
export function createStreetOverview(appCtx,{onComplete=()=>{}}={}){
 const sequence=appCtx._worldLoadSequence,startedAt=performance.now();
 let worker=null,pending=null,active=null,disposed=false,sources=[],prepared=false,mask=null,stagedMask=null,completedBounds=null;
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
 async function advance(focus){
   if(!worker){
     worker=new Worker(new URL('./compiler/street-overview-worker.js',import.meta.url),{type:'module'});stats.workerActive=true;
     worker.onmessage=event=>event.data.type==='error'?pending?.reject(new Error(event.data.message)):pending?.resolve(event.data);
     worker.onerror=event=>pending?.reject(new Error(event.message));
   }
   if(!prepared||!sourcesMatch()){
     sources=sourceLists().map(list=>({list,length:list?.length||0}));
     const plan=await request({type:'prepare',input:streetSourceInput(appCtx)});if(!valid())return;
     stagedMask?.dispose();stagedMask=createPavementTerrainMask(appCtx,plan.keys);
     if(!mask){mask=stagedMask;stagedMask=null;}
     setDetailBounds(appCtx.streetPavement?.coverageBounds);
     Object.assign(stats,{totalCells:plan.tiles,sourceCells:plan.sourceCells,excludedCells:plan.excludedCells,completedCells:0,nonemptyCells:0,coveredSquareWorldUnits:0,
       retainedBytes:(stagedMask||mask).bytes,maskResolution:(stagedMask||mask).layout.resolution,worldUnitsPerTexel:64/(stagedMask||mask).layout.resolution});
     prepared=true;
   }
   const target=stagedMask||mask;
   const packet=await request({type:'next',focus,resolution:target.layout.resolution});
   if(!valid()||!sourcesMatch())return;
   if(packet.type==='complete'){complete();return;}
   target.publish(packet.key,packet.mask);stats.completedCells++;
   if(packet.coveredSquareWorldUnits>0)stats.nonemptyCells++;
   stats.coveredSquareWorldUnits+=packet.coveredSquareWorldUnits||0;
   if(!packet.remaining)complete();
 }
 function complete(){
   if(stats.completedCells!==stats.totalCells)throw new Error('Location pavement ended before every planned cell was published');
   if(stagedMask){mask?.dispose();mask=stagedMask;stagedMask=null;}
   const l=mask.layout;
   completedBounds=stats.totalCells?{minX:l.minX*64,maxX:(l.minX+l.lookupWidth)*64,minZ:l.minZ*64,maxZ:(l.minZ+l.lookupHeight)*64}:null;
   stats.status='complete';stats.coverageBounds=completedBounds;stats.durationMs=Math.round(performance.now()-startedAt);
   worker?.terminate();worker=null;prepared=false;stats.workerActive=false;
   stats.materials=mask.syncMaterials();onComplete(completedBounds);
 }
 function step(focus){
   setDetailBounds(appCtx.streetPavement?.coverageBounds);
   if(!valid())return;
   if(mask)stats.materials=mask.syncMaterials();
   if(active)return;
   if((stats.status==='failed'||stats.status==='complete')&&sourcesMatch())return;
   if(stats.status==='failed'){prepared=false;stats.error=null;}
   stats.status='building';
   const coordinate=value=>Number.isFinite(Number(value))?Number(value):0;
   const point={x:coordinate(focus?.x),z:coordinate(focus?.z)};
   active=(async()=>{
     const started=performance.now();
     do{
       await advance(point);
       if(stats.status==='complete'||!valid()||appCtx._streetPavementUpdating||!appCtx.gameStarted)break;
       await yieldToMainThread();
     }while(performance.now()-started<80);
   })().catch(error=>{if(valid()){stats.status='failed';stats.error=String(error.message);worker?.terminate();worker=null;stats.workerActive=false;}}).finally(()=>{active=null;});
 }
 function dispose(){disposed=true;worker?.terminate();pending?.reject(new Error('Overview disposed'));mask?.dispose();stagedMask?.dispose();mask=stagedMask=null;stats.status='disposed';stats.retainedBytes=0;stats.workerActive=false;}
 return {stats,step,setDetailBounds,get completedBounds(){return completedBounds;},pause:()=>active||Promise.resolve(),dispose};
}
