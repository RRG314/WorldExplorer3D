import test from 'node:test';
import assert from 'node:assert/strict';
import {installOnDemandBlockBuilder} from '../app/js/runtime/on-demand-block-builder.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const config=id=>({enabled:true,roomId:id,world:{kind:'earth',lat:39,lon:-76}});
function fixture(){
 const load=deferred(),events=[],ctx={gameStarted:true};
 const blocks={configureSharedBuildSync:c=>events.push(['room',c.roomId||'',c.enabled]),setSharedBuildEntries:rows=>events.push(['rows',rows.map(r=>r.id)]),
  setSharedBuildConnectionState:c=>events.push(['connection',c]),refreshBlockBuilderForCurrentLocation:()=>events.push(['refresh'])};
 const runtime=installOnDemandBlockBuilder(ctx,{loadUi:()=>load.promise,loadBlocks:async()=>blocks});
 return{ctx,events,runtime,release:()=>load.resolve({})};
}
test('lazy room loading publishes only the latest room and its latest rows once',async()=>{
 const h=fixture();h.ctx.configureSharedBuildSync(config('A'));h.ctx.setSharedBuildEntries([{id:'A-row'}]);
 h.ctx.configureSharedBuildSync(config('B'));h.ctx.setSharedBuildEntries([{id:'B-old'}]);h.ctx.setSharedBuildEntries([{id:'B-final'}]);
 h.ctx.setSharedBuildConnectionState(false);h.release();await h.runtime.ensureBlockBuilderReady();
 assert.deepEqual(h.events,[['room','B',true],['connection',false],['rows',['B-final']],['refresh']]);
});
test('switching rooms before the builder loads discards the departed room rows even without a new snapshot',async()=>{
 const h=fixture();h.ctx.configureSharedBuildSync(config('A'));h.ctx.setSharedBuildEntries([{id:'A-row'}]);h.ctx.configureSharedBuildSync(config('B'));
 h.release();await h.runtime.ensureBlockBuilderReady();assert.equal(h.events.some(e=>e[0]==='rows'),false);assert.deepEqual(h.events[0],['room','B',true]);
});
test('leaving during lazy load cannot rejoin the old room and separate installations cannot share queues',async()=>{
 const first=fixture(),second=fixture();first.ctx.configureSharedBuildSync(config('A'));first.ctx.setSharedBuildEntries([{id:'A-row'}]);
 first.ctx.configureSharedBuildSync({enabled:false});second.ctx.configureSharedBuildSync(config('C'));second.ctx.setSharedBuildEntries([{id:'C-row'}]);
 first.release();second.release();await first.runtime.ensureBlockBuilderReady();await second.runtime.ensureBlockBuilderReady();
 assert.deepEqual(first.events[0],['room','',false]);assert.equal(first.events.some(e=>e[0]==='rows'),false);
 assert.deepEqual(second.events[0],['room','C',true]);assert.deepEqual(second.events.find(e=>e[0]==='rows'),['rows',['C-row']]);
});
test('a failed lazy import remains retryable and retains only the current room state',async()=>{
 let attempt=0;const events=[],ctx={};const runtime=installOnDemandBlockBuilder(ctx,{loadUi:async()=>{if(++attempt===1)throw Error('network');return{};},
  loadBlocks:async()=>({configureSharedBuildSync:c=>events.push(c.roomId),setSharedBuildEntries:rows=>events.push(rows[0].id)})});
 await assert.rejects(runtime.ensureBlockBuilderReady(),/network/);
 ctx.configureSharedBuildSync(config('B'));ctx.setSharedBuildEntries([{id:'B-row'}]);await runtime.ensureBlockBuilderReady();
 assert.deepEqual(events,['B','B-row']);assert.equal(attempt,2);
});
