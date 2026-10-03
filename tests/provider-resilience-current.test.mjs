import test from 'node:test';
import assert from 'node:assert/strict';
import {createProviderRegistry} from '../app/js/geospatial/provider-registry.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
test('forced refresh coalesces and one cancelled consumer cannot cancel another',async()=>{
 const registry=createProviderRegistry();let calls=0,resolve,signal;registry.register({id:'feed',query:(_,ctx)=>{calls++;signal=ctx.signal;return new Promise(r=>resolve=r);}});
 const first=new AbortController(),second=new AbortController();const a=registry.query('feed',{}, {signal:first.signal}),b=registry.query('feed',{}, {force:true,signal:second.signal});await tick();assert.equal(calls,1);first.abort();await assert.rejects(a,{name:'AbortError'});assert.equal(signal.aborted,false);resolve({items:[1]});assert.deepEqual((await b).items,[1]);assert.equal(registry.snapshot().activeQueries,0);
});
test('last cancellation and a removed provider cannot publish late data to cache',async()=>{
 const registry=createProviderRegistry();let resolve,signal;const remove=registry.register({id:'feed',cacheTtlMs:10000,query:(_,ctx)=>{signal=ctx.signal;return new Promise(r=>resolve=r);}});
 const control=new AbortController(),pending=registry.query('feed',{}, {signal:control.signal});await tick();control.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(signal.aborted,true);resolve({items:['late']});await tick();assert.equal(registry.snapshot().cachedQueries,0);
 const next=registry.query('feed');await tick();remove();await assert.rejects(next,{name:'AbortError'});resolve({items:['removed']});await tick();assert.equal(registry.snapshot().cachedQueries,0);
});
test('hung providers time out even if they ignore AbortSignal, and failure bursts are paced',async()=>{
 let now=10000;const registry=createProviderRegistry({now:()=>now});let calls=0;registry.register({id:'hung',timeoutMs:1000,query:()=>{calls++;return new Promise(()=>{});}});
 await assert.rejects(registry.query('hung'),{name:'AbortError'});assert.equal(registry.snapshot().activeQueries,0);await assert.rejects(registry.query('hung'),/temporarily unavailable/);assert.equal(calls,1);assert.equal(registry.snapshot().providers[0].status,'failed');
});
test('provider fan-out is bounded, dated cache survives failure without silently becoming current',async()=>{
 let now=10000,resolve;const registry=createProviderRegistry({now:()=>now,maxActiveQueries:1});registry.register({id:'feed',cacheTtlMs:500,query:input=>input.key===0?{items:[0]}:new Promise(r=>resolve=r)});
 const initial=await registry.query('feed',{key:0});assert.equal(initial.fetchedAt,new Date(now).toISOString());const active=registry.query('feed',{key:1});await tick();await assert.rejects(registry.query('feed',{key:2}),/busy/);assert.equal((await registry.query('feed',{key:0})).fromCache,true);resolve({items:[1]});await active;
 const canceled=new AbortController();canceled.abort();await assert.rejects(registry.query('feed',{key:0},{signal:canceled.signal}),{name:'AbortError'});
});
const {readBoundedText}=await import('../app/js/geospatial/bounded-response.js');
test('missing or compressed length cannot allow an oversized decoded response; stream cancels',async()=>{
 let canceled=false;const response=new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(8));},cancel(){canceled=true;}}),{headers:{'content-length':'2'}});
 await assert.rejects(readBoundedText(response,12),/size limit/);assert.equal(canceled,true);
 assert.equal(await readBoundedText(new Response('harbor'),20),'harbor');
 await assert.rejects(readBoundedText({text:async()=>'🌊🌊',headers:new Headers()},7),/size limit/);
});
