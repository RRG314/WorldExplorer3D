import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarineService} from '../app/js/geospatial/marine.js';
import {createOperationalFeedService} from '../app/js/geospatial/operational-feeds.js';
import {createAircraftService} from '../app/js/geospatial/aircraft.js';
import {createStreetImageryService} from '../app/js/geospatial/street-imagery.js';
import {createGeologyService} from '../app/js/geospatial/geology.js';
import {createMarineState,ensureSelectedMarineData,cancelSelectedMarineData} from '../app/js/live-earth/marine-state.js';
const tick=()=>new Promise(r=>setImmediate(r));
const point={lat:1,lon:2};
const json=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
const delayed=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('public feed services retain HTTP status for HTML 429 pages and block a new point',async()=>{
 for(const factory of [
  fetchImpl=>({service:createMarineService({fetchImpl}),query:s=>s.modelAt(point),other:s=>s.modelAt({lat:3,lon:4})}),
  fetchImpl=>({service:createOperationalFeedService({fetchImpl}),query:s=>s.weather([point]),other:s=>s.weather([{lat:3,lon:4}])}),
  fetchImpl=>({service:createAircraftService({fetchImpl}),query:s=>s.search(point),other:s=>s.search({lat:3,lon:4})}),
  fetchImpl=>({service:createStreetImageryService({fetchImpl}),query:s=>s.search('panoramax',point),other:s=>s.search('panoramax',{lat:3,lon:4})})]) {
  let calls=0;const {service,query,other}=factory(async()=>{calls++;return new Response('<html>rate limit</html>',{status:429,headers:{'retry-after':'100'}});});
  await assert.rejects(query(service),{status:429});await assert.rejects(other(service),{code:'PROVIDER_COOLDOWN'});assert.equal(calls,1);
 }
});
test('marine model and selected consumers cancel independently without starting obsolete station followups',async()=>{
 const pending=[];const service=createMarineService({fetchImpl:async(url,{signal})=>{const request={url,signal,...delayed()};pending.push(request);return request.promise;}});
 const keeper=service.modelAt(point),controller=new AbortController(),selected=service.selected(point,{signal:controller.signal});await tick();
 assert.equal(pending.length,2);controller.abort();await assert.rejects(selected,{name:'AbortError'});
 assert.equal(pending.find(r=>r.url.includes('stations')).signal.aborted,true);
 assert.equal(pending.find(r=>r.url.includes('/marine')).signal.aborted,false);
 for(const request of pending)request.resolve(json(request.url.includes('stations')?{stations:[]}:{latitude:1,longitude:2,current:{time:'2026-10-04T00:00',wave_height:1}}));
 assert.ok(await keeper);assert.equal(service.diagnostics().activeQueries,0);
});
test('weather facade forwards cancellation and missing coordinates never become zero',async()=>{
 let signal;const data=delayed();const service=createOperationalFeedService({fetchImpl:async(_,options)=>{signal=options.signal;return data.promise;}});
 const controller=new AbortController(),request=service.weather([point],{signal:controller.signal});await tick();controller.abort();await assert.rejects(request,{name:'AbortError'});assert.equal(signal.aborted,true);data.resolve(json({}));
 for(const value of [null,'','  ',false,undefined,[],{}]){
  await assert.rejects(service.weather([{lat:value,lon:0}]),RangeError);
  await assert.rejects(createMarineService().modelAt({lat:0,lon:value}),RangeError);
  await assert.rejects(createAircraftService().search({lat:value,lon:0}),RangeError);
  await assert.rejects(createStreetImageryService().search('panoramax',{lat:0,lon:value}),RangeError);
 }
});
test('aircraft and street image responses stop oversized streaming bodies',async()=>{
 for(const factory of [fetchImpl=>()=>createAircraftService({fetchImpl}).search(point),fetchImpl=>()=>createStreetImageryService({fetchImpl}).search('panoramax',point)]) {
  let canceled=false,pulls=0;const invoke=factory(async()=>new Response(new ReadableStream({pull(c){pulls++;c.enqueue(new Uint8Array(1000000));},cancel(){canceled=true;}})));
  await assert.rejects(invoke(),/size limit/);assert.ok(canceled);assert.ok(pulls<=7);
 }
});
test('geology stops an oversized primary response and identifies its bounded regional fallback',async()=>{
 let canceled=false,calls=0;
 const service=createGeologyService({fetchImpl:async()=>++calls===1?new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(600000));},cancel(){canceled=true;}})):json({success:{data:[{source_id:1,map_id:2,name:'Mapped unit',lith:'Sandstone'}]}})});
 const result=await service.lookup(point);assert.equal(calls,2);assert.ok(canceled);assert.equal(result.items[0].provider,'macrostrat');assert.equal(result.warnings.length,1);
});
test('geology primary rate-limit cooldown survives a successful fallback at another point',async()=>{
 let primary=0,fallback=0;const service=createGeologyService({fetchImpl:async url=>{
  if(url.includes('usgs.gov')){primary++;return new Response('',{status:429,headers:{'retry-after':'120'}});}
  fallback++;return json({success:{data:[{source_id:1,map_id:2,name:'Mapped unit',lith:'Sandstone'}]}});
 }});
 await service.lookup(point);await service.lookup({lat:3,lon:4});assert.equal(primary,1);assert.equal(fallback,2);
});
test('marine panel coalesces, cancels on exit, expires observations, and does not cache failure as success',async t=>{
 let now=1000000; t.mock.method(Date,'now',()=>now);
 let selection=point,calls=0;const requests=[];const state=createMarineState();
 const ctx={selectorSelection:()=>selection,marineService:{selected:(_,options)=>{calls++;const r={...delayed(),signal:options.signal};requests.push(r);return r.promise;}}};
 const a=ensureSelectedMarineData(ctx,state);assert.equal(a,ensureSelectedMarineData(ctx,state,true));await tick();
 requests[0].resolve({model:{},station:null});await a;
 assert.equal(await ensureSelectedMarineData(ctx,state),state.marineSnapshot);assert.equal(calls,1);
 now+=300001;const expired=ensureSelectedMarineData(ctx,state);await tick();cancelSelectedMarineData(state);assert.equal(requests[1].signal.aborted,true);requests[1].resolve({model:{stale:true}});await expired;assert.equal(state.marineSnapshot.model.stale,undefined);
 selection={lat:3,lon:4};const failed=ensureSelectedMarineData(ctx,state);await tick();requests[2].resolve({model:null,station:null,warnings:['unavailable']});await failed;assert.equal(state.marineLoadedAt,0);
 const retry=ensureSelectedMarineData(ctx,state);await tick();assert.equal(calls,4);requests[3].resolve({model:{recovered:true}});await retry;assert.equal(state.marineSnapshot.model.recovered,true);
});

test('partial orbital groups retain successful data without re-requesting a rate-limited group',async()=>{
 const calls=[];const service=createOperationalFeedService({fetchImpl:async url=>{const group=new URL(url).searchParams.get('GROUP');calls.push(group);return group==='weather'?new Response('',{status:429,headers:{'retry-after':'90'}}):new Response('Reference orbital elements');}});
 const first=await service.celestrak(['weather','stations']);const second=await service.celestrak(['weather','stations'],{force:true});
 assert.equal(first.items.length,1);assert.equal(second.items.length,1);assert.equal(second.warnings.length,1);
 assert.equal(calls.filter(group=>group==='weather').length,1);assert.equal(calls.filter(group=>group==='stations').length,2);
});
