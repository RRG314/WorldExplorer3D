import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {getDestinationMission} from '../app/js/universe/mission-catalog.js';

let sequence=0;
async function runtimeCheck(run){
 const keys=['window','document','localStorage','THREE'],original=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const values=new Map(),timers=new Map(),messages=[];let timerId=0,quota=false;
 const panel={hidden:true,innerHTML:'',querySelector:()=>null};
 Object.assign(globalThis,{THREE,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>{if(quota)throw new Error('full storage');values.set(k,v)}},
  document:{getElementById:()=>panel},window:{setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id)}});
 try{
  const api=await import(`../app/js/universe/mission-runtime.js?scan-check=${++sequence}`);
  const context={paused:false,environment:'SPACE_FLIGHT',getEnv(){return this.environment},spaceFlight:{active:true,rocket:{position:new THREE.Vector3(0,0,50)}},
   universeRuntime:{current:{id:'sol'},course:null,transition:null},showToast:m=>messages.push(m),showSpaceFlightMessage:m=>messages.push(m),
   playDestinationMissionScan:()=>true,getUniverseHudTarget:()=>({destinationId:context.targetId,position:new THREE.Vector3(),radius:6})};
  const store=api.initDestinationMissionRuntime(context);
  const prepare=(id='sol')=>{
   const mission=getDestinationMission(id);store.activate(mission);
   if(store.get(mission).phase==='available')store.advance(mission,'review_briefing');
   if(store.get(mission).phase==='approach')store.advance(mission,'arrive');
   context.universeRuntime.current={id:mission.systemId};context.universeRuntime.course={destination:{id}};context.targetId=id;
   return mission;
  };
  await run({api,context,store,prepare,timers,messages,setQuota:value=>{quota=value;}});
 }finally{for(const key of keys){const descriptor=original.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

test('surface fieldwork cannot be replaced by an orbital timer and Earth cannot retain a false arrival',()=>runtimeCheck(({api,context,store,prepare,timers})=>{
 const moon=prepare('moon');context.environment='MOON';context.activePlanetaryBodyId='moon';
 assert.equal(api.performDestinationMissionFieldwork(),false);assert.equal(timers.size,0);assert.equal(store.get(moon).phase,'fieldwork');
 const surface=prepare('proxima-centauri-b');context.environment='SPACE_FLIGHT';context.activePlanetaryBodyId=null;
 assert.equal(api.performDestinationMissionFieldwork(),false);assert.equal(store.get(surface).phase,'fieldwork');
 const sol=getDestinationMission('sol');store.activate(sol);store.advance(sol,'review_briefing');context.environment='EARTH';context.activePlanetaryBodyId=null;context.universeRuntime.current={id:'sol'};
 api.updateDestinationMissionRuntime();assert.equal(store.get(sol).phase,'approach');assert.equal(api.destinationMissionSnapshot().atDestination,false);
 context.environment='SPACE_FLIGHT';api.updateDestinationMissionRuntime();assert.equal(store.get(sol).phase,'fieldwork');
 context.activeShipInterior={};assert.equal(api.performDestinationMissionFieldwork(),false);
 context.activeShipInterior=null;context.paused=true;assert.equal(api.performDestinationMissionFieldwork(),false);
 context.paused=false;context.playDestinationMissionScan=null;assert.equal(api.performDestinationMissionFieldwork(),false);
}));

test('old scan callbacks cannot change a newly selected mission or clear its current operation',()=>runtimeCheck(({api,context,store,prepare,timers})=>{
 const sol=prepare();assert.equal(api.performDestinationMissionFieldwork(),true);const old=[...timers.values()].at(-1);
 const orbital=prepare('tau-ceti-h');api.updateDestinationMissionRuntime();assert.equal(timers.size,0);old();
 assert.equal(store.load().activeMissionId,orbital.id);assert.equal(store.get(sol).phase,'fieldwork');
 assert.equal(api.performDestinationMissionFieldwork(),true);const current=[...timers.values()].at(-1);old();
 assert.equal(api.performDestinationMissionFieldwork(),false,'old callback cannot clear the new busy guard');current();
 assert.equal(store.get(orbital).phase,'analysis');assert.equal(store.get(sol).phase,'fieldwork');
}));

test('pause, leaving space and a target excursion cancel pending scans before any evidence write',()=>runtimeCheck(({api,context,store,prepare,timers})=>{
 const mission=prepare('tau-ceti-h');
 for(const change of [()=>{context.paused=true},()=>{context.environment='EARTH'},()=>{context.spaceFlight.rocket.position.z=1000}]){
  context.paused=false;context.environment='SPACE_FLIGHT';context.spaceFlight.rocket.position.z=50;
  assert.equal(api.performDestinationMissionFieldwork(),true);const callback=[...timers.values()].at(-1);change();api.updateDestinationMissionRuntime();
  context.paused=false;context.environment='SPACE_FLIGHT';context.spaceFlight.rocket.position.z=50;callback();
  assert.equal(store.get(mission).phase,'fieldwork');assert.deepEqual(store.get(mission).evidence,[]);
 }
}));

test('thermal and transit evidence require the original physical observation at completion',()=>runtimeCheck(({api,context,store,prepare,timers})=>{
 const thermal=prepare('proxima-centauri-d');context.spaceFlight.rocket.position.set(-50,0,0);
 context.universeRuntime.frameGroup={userData:{destinationMeshes:new Map([[thermal.systemId,{getWorldPosition:p=>p.set(-1000,0,0)}]])}};
 assert.equal(api.performDestinationMissionFieldwork(),true);const pass=[...timers.values()].at(-1);context.spaceFlight.rocket.position.x=50;pass();
 assert.deepEqual(store.get(thermal).evidence,[]);
 const transit=prepare('trappist-1'),target=transit.observationTargets[0];context.targetId=target;context.universeRuntime.course.destination.id=target;
 assert.equal(api.performDestinationMissionFieldwork(),true);const observation=[...timers.values()].at(-1);context.universeRuntime.course.destination.id=transit.observationTargets[1];observation();
 assert.deepEqual(store.get(transit).evidence,[]);assert.equal(store.get(transit).phase,'fieldwork');
}));

test('a failed scan save remains retryable and successful repeat cannot award twice',()=>runtimeCheck(({api,store,prepare,timers,messages,setQuota})=>{
 const mission=prepare();assert.equal(api.performDestinationMissionFieldwork(),true);let callback=[...timers.values()].at(-1);
 setQuota(true);assert.doesNotThrow(callback);assert.equal(store.get(mission).phase,'fieldwork');assert.ok(messages.some(m=>m.includes('could not be saved')));
 setQuota(false);assert.equal(api.performDestinationMissionFieldwork(),true);callback=[...timers.values()].at(-1);callback();callback();
 assert.equal(store.get(mission).phase,'analysis');assert.equal(store.get(mission).history.filter(e=>e.event==='complete_fieldwork').length,1);
}));
