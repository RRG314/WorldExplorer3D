import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchWithConcurrency,loadFarMappedContext} from '../app/js/terrain/far-field-mapped-context.js';
const coordinates=count=>Array.from({length:count},(_,x)=>({x,y:10}));
const cancelled=()=>Object.assign(new Error('Tile request timed out'),{name:'AbortError'});

test('isolated transient gaps retry once, retain source order and do not refetch successful tiles',async()=>{
 const calls=new Map(),items=coordinates(40);let active=0,maxActive=0;
 const result=await fetchWithConcurrency(items,8,async item=>{
  const n=(calls.get(item.x)||0)+1;calls.set(item.x,n);
  if(item.x<3&&n===1)throw Error('Shortbread tile: HTTP 503');
  if(n===2){active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,1));active--;}
  return item;
 });
 assert.deepEqual(result.values,items);assert.deepEqual(result.missingTiles,[]);
 assert.equal(result.metrics.recovery.requested,3);assert.equal(maxActive,2);
 for(const item of items)assert.equal(calls.get(item.x),item.x<3?2:1);
});

test('denied, rate-limited, missing and invalid source tiles never trigger recovery',async()=>{
 for(const message of ['HTTP 403','HTTP 429','HTTP 404','Shortbread provider paused for cooldown or recovery probe','invalid geometry']){
  let calls=0;const result=await fetchWithConcurrency(coordinates(20),8,async item=>{calls++;if(item.x===0)throw Error(message);return item;});
  assert.equal(calls,20);assert.equal(result.metrics.recovery,null);assert.deepEqual(result.missingTiles,[{x:0,y:10}]);
 }
});

test('a provider outage or more than eight gaps cannot double the whole window request set',async()=>{
 for(const failures of [9,100]){
  let calls=0;const result=await fetchWithConcurrency(coordinates(100),8,async item=>{calls++;if(item.x<failures)throw cancelled();return item;});
  assert.equal(calls,100);assert.equal(result.metrics.recovery,null);assert.equal(result.missingTiles.length,failures);
 }
});

test('a last tile cancelled by the primary deadline can recover without losing the completed window',async()=>{
 let attempts=0,aborted=0;
 const items=coordinates(20);
 const result=await fetchWithConcurrency(items,8,(item,signal)=>{
  if(item.x!==19||attempts++>0)return Promise.resolve(item);
  return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(cancelled());},{once:true}));
 },null,{maxElapsedMs:20,recoveryMaxElapsedMs:50});
 assert.equal(aborted,1);assert.equal(result.metrics.deadlineReached,true);
 assert.equal(result.metrics.recovery.fulfilled,1);assert.deepEqual(result.values,items);
});

test('the single recovery pass also has a deadline and leaves its gap explicit',async()=>{
 let calls=0,aborted=0;
 const result=await fetchWithConcurrency(coordinates(20),8,(item,signal)=>{
  if(item.x!==0)return Promise.resolve(item);calls++;
  if(calls===1)throw cancelled();
  return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(cancelled());},{once:true}));
 },null,{recoveryMaxElapsedMs:20});
 assert.equal(calls,2);assert.equal(aborted,1);assert.equal(result.metrics.recovery.deadlineReached,true);
 assert.deepEqual(result.missingTiles,[{x:0,y:10}]);
});

test('world cancellation during recovery aborts work and never returns a partially accepted window',async()=>{
 const controller=new AbortController();let attempt=0,aborted=0;
 const pending=fetchWithConcurrency(coordinates(20),8,(item,signal)=>{
  if(item.x!==0)return Promise.resolve(item);
  if(attempt++===0)throw cancelled();
  return new Promise((_resolve,reject)=>{
   signal.addEventListener('abort',()=>{aborted++;reject(cancelled());},{once:true});
   controller.abort('location switched');
  });
 },controller.signal);
 await assert.rejects(pending);assert.equal(aborted,1);assert.equal(attempt,2);
});

test('the actual mapped-context loader publishes recovered building coverage and its source receipt',async()=>{
 const bounds={latS:0,latN:.001,lonW:0,lonE:.001};let failed=false;
 const result=await loadFarMappedContext(bounds,null,bounds,{fetchTile:async(z,x,y)=>{
  if(z===14&&!failed){failed=true;throw cancelled();}
  return {z,x,y,tile:{layers:z===14?{buildings:{length:1,feature:()=>({id:1,toGeoJSON:()=>({properties:{},geometry:{type:'Polygon',coordinates:[[[0,0],[.0002,0],[.0002,.0002],[0,.0002],[0,0]]]}})})}}:{}}};
 }});
 assert.equal(result.sourceCoverageComplete,true);assert.equal(result.loadedTiles,result.requestedTiles);
 assert.equal(result.contextBatchMetrics.recovery.fulfilled,1);assert.equal(result.availableBuildings,result.requestedTiles);
 assert.deepEqual(result.contextMissingTiles,[]);assert.equal(result.coverageStatus,'complete');
});
