import test from 'node:test';
import assert from 'node:assert/strict';
import {createWaterEnvironmentController} from '../app/js/world/water-environment-controller.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){const requests=[],stations=[];const appCtx={LOC:{lat:1,lon:1}};const controller=createWaterEnvironmentController({appCtx,marineService:{modelAt(place){const d=deferred();requests.push({...d,place});return d.promise},selected(place){const d=deferred();stations.push({...d,place});return d.promise}},resolveEvidence:({marine})=>({wave:{truthType:marine.model,renderUsable:true}})});return {appCtx,controller,requests,stations};}
test('out-of-order model responses cannot publish, relabel cache or start obsolete station requests',async()=>{
 const t=setup();const a=t.controller.refresh();await tick();t.appCtx.LOC={lat:2,lon:2};const b=t.controller.refresh();await tick();
 t.requests[1].resolve('B');await b;t.requests[0].resolve('A');assert.equal(await a,null);await tick();
 assert.equal(t.appCtx.activeWaterOpticsEvidence.wave.truthType,'B');assert.equal(t.stations.length,1);
 assert.equal((await t.controller.refresh()).wave.truthType,'B');assert.equal(t.requests.length,2);
});
test('location change clears old evidence immediately; station completion cannot revive it',async()=>{
 const t=setup();const a=t.controller.refresh();await tick();t.requests[0].resolve('A');await a;await tick();
 t.appCtx.LOC={lat:2,lon:2};const b=t.controller.refresh();assert.equal(t.appCtx.activeMarineSnapshot,null);await tick();
 t.stations[0].resolve({model:'old-station'});await tick();assert.equal(t.appCtx.activeMarineSnapshot,null);
 t.requests[1].reject(Error('offline'));assert.equal(await b,null);assert.equal(t.appCtx.waterEnvironmentStatus.state,'unavailable');
});
test('same-place calls coalesce and invalid coordinates cancel publication instead of becoming 0,0',async()=>{
 const t=setup();const a=t.controller.refresh();assert.equal(a,t.controller.refresh());await tick();
 t.appCtx.LOC={lat:null,lon:null};assert.equal(await t.controller.refresh(),null);t.requests[0].resolve('A');await a;
 assert.equal(t.appCtx.activeMarineSnapshot,null);assert.equal(t.appCtx.waterEnvironmentStatus.reason,'invalid-location');assert.equal(t.stations.length,0);
});
test('changing selected location without another refresh still invalidates a late result',async()=>{
 const t=setup();const a=t.controller.refresh();await tick();t.appCtx.LOC={lat:3,lon:3};t.requests[0].resolve('A');assert.equal(await a,null);assert.equal(t.stations.length,0);
});
