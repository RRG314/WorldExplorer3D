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

const {providerResponseError}=await import('../app/js/geospatial/provider-error.js');
test('rate limits span locations, retain valid dated cache, and admit just one recovery probe',async()=>{
 let now=100000,calls=0,stage='ready',release;
 const registry=createProviderRegistry({now:()=>now});
 registry.register({id:'weather',cacheTtlMs:600000,query:async()=>{
  calls++;
  if(stage==='limited')throw providerResponseError(new Response('private provider body',{status:429,headers:{'retry-after':'120'}}),now);
  if(stage==='probe')await new Promise(r=>release=r);
  return {items:[1]};
 }});
 const cached=await registry.query('weather',{lat:1});stage='limited';
 await assert.rejects(registry.query('weather',{lat:2}),{status:429});
 for(let lat=3;lat<13;lat++)await assert.rejects(registry.query('weather',{lat},{force:true}),{code:'PROVIDER_COOLDOWN'});
 assert.equal(calls,2);assert.equal((await registry.query('weather',{lat:1})).fetchedAt,cached.fetchedAt);
 now+=120001;stage='probe';const probe=registry.query('weather',{lat:3});await tick();
 await assert.rejects(registry.query('weather',{lat:4}),{code:'PROVIDER_COOLDOWN'});
 release();await probe;stage='ready';await registry.query('weather',{lat:4});
 assert.equal(calls,4);assert.equal(registry.snapshot().providers[0].retryAt,0);
 assert.doesNotMatch(JSON.stringify(registry.snapshot()),/private provider body/);
});
test('outage circuit and a failed recovery probe bound retries across changing queries',async()=>{
 let now=100000,calls=0;
 const registry=createProviderRegistry({now:()=>now});registry.register({id:'feed',query:()=>{calls++;throw new TypeError('Failed to fetch private-coordinate');}});
 for(let key=0;key<3;key++)await assert.rejects(registry.query('feed',{key}));
 await assert.rejects(registry.query('feed',{key:4}),{code:'PROVIDER_COOLDOWN'});assert.equal(calls,3);
 now+=30001;await assert.rejects(registry.query('feed',{key:5}));
 await assert.rejects(registry.query('feed',{key:6}),{code:'PROVIDER_COOLDOWN'});assert.equal(calls,4);
 assert.doesNotMatch(JSON.stringify(registry.snapshot()),/private-coordinate/);
});
test('a success started before a 429 cannot erase its cooldown and canceling a probe allows a new probe',async()=>{
 let now=100000,release,signal;
 const registry=createProviderRegistry({now:()=>now});registry.register({id:'feed',query:async(input,context)=>{
  if(input.key===2)throw providerResponseError(new Response('',{status:429}),now);
  signal=context.signal;await new Promise(r=>release=r);return {items:[1]};
 }});
 const old=registry.query('feed',{key:1});await tick();await assert.rejects(registry.query('feed',{key:2}));release();await old;
 await assert.rejects(registry.query('feed',{key:3}),{code:'PROVIDER_COOLDOWN'});
 now+=60001;const controller=new AbortController(),probe=registry.query('feed',{key:3},{signal:controller.signal});await tick();controller.abort();await assert.rejects(probe,{name:'AbortError'});assert.equal(signal.aborted,true);release();await tick();
 const recovered=registry.query('feed',{key:4});await tick();release();await recovered;
 assert.equal(registry.snapshot().providers[0].retryAt,0);
});
test('Retry-After dates, delays and malformed values are handled without retaining error bodies',()=>{
 const now=Date.parse('2026-10-04T00:00:00Z');
 const response=value=>new Response('private details',{status:503,headers:{'retry-after':value}});
 assert.equal(providerResponseError(response('90'),now).retryAfterMs,90000);
 assert.equal(providerResponseError(response('Sun, 04 Oct 2026 00:02:00 GMT'),now).retryAfterMs,120000);
 assert.equal(providerResponseError(response('invalid'),now).retryAfterMs,null);
 assert.equal(providerResponseError(response('999999999'),now).retryAfterMs,86400000);
});
