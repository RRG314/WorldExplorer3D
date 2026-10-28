import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeVehicleGarage,personalVehicleById,personalVehicleIdentity} from '../app/js/transport/vehicle-garage-rules.js';
import {resolveControlState}from'../app/js/transport/control-state.js';

function harness(){
 const events=[],world=new AbortController();let uid='',current=true,stagedResolve,saveResolve;
 let garage=normalizeVehicleGarage({schemaVersion:1,revision:0,vehicles:{delorean:{condition:.64},bmw_e34:{condition:.43}}});
 const position={x:5,y:2,z:7},car={speed:0,condition:.64},actor={locomotion:'walk',position};
 const context={car,Walk:{state:{mode:'walk'}},activeTransportActor:()=>actor,resolveSafeWorldSpawn:()=>({valid:true,x:5,z:7,carY:1.2,angle:0}),
  setTravelMode:()=>{events.push('mode');return 'drive';},applyResolvedWorldSpawn:()=>events.push('spawn')};
 const state={worldIdentity:'test',activeVehicle:null,commerce:{vehicleGarage:()=>garage,changeVehicleGarage:request=>{
   if(request.action==='park'){events.push(['park',request.vehicleId,request.condition]);return {ok:true};}
   events.push('save');return saveResolve?new Promise(resolve=>saveResolve.resolve=resolve):{ok:true,garage};
 }},vehicleUpgradeStore:{garageSnapshot:()=>garage,hydrateGarage:next=>{garage=next;}},roomAuthorityRuntime:{
   claimPreparedVehicle:async()=>({accepted:true,state:{pose:{x:10,y:3,z:12,yaw:1}}}),
   releasePreparedVehicle:()=>events.push('releaseLease'),adoptPreparedVehicle:()=>events.push('adoptLease')}};
 const options={context,state,isCurrent:()=>current,
  prepare:()=>new Promise(resolve=>{stagedResolve=resolve;events.push('prepare');}),
  applyPublishedPose:(v,p)=>{v.pose=p;events.push('roomPose');},
  releaseCurrent:()=>events.push('releaseOld'),mount:v=>{state.activeVehicle=v;events.push('mount');},
  restoreDefault:(spawn,record)=>{car.condition=record.condition;car.personalVehicleId='bmw_e34';events.push('default');},
  dispose:()=>events.push('dispose')};
 const source=fs.readFileSync(new URL('../app/js/transport/personal-vehicle-runtime.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const scope={isActive:()=>true,defer(){},dispose(){current=false;}};
 const sandbox={AbortController,Math,Number,Object,String,crypto:globalThis.crypto,getCurrentUser:()=>uid?{uid}:null,
  createLifecycleScope:()=>scope,captureEnvironmentSession:()=>({signal:world.signal,isCurrent:()=>!world.signal.aborted}),
  resolveControlState,personalVehicleById,personalVehicleIdentity,normalizeVehicleGarage,
  commitExplorerVehicleAction:async()=>({ok:true,garage})};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);const runtime=sandbox.createPersonalVehicleRuntime(options);
 return {runtime,context,state,events,actor,car,world,resolve:()=>stagedResolve({personalVehicleId:'delorean'}),uid:value=>uid=value,
  delayedSave:()=>saveResolve={},completeSave:()=>saveResolve.resolve({ok:true,garage})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('selected car stages before releasing old controls and adopts the room-published pose',async()=>{
 const h=harness(),pending=h.runtime.selectAndDrive('delorean');assert.deepEqual(h.events,['prepare']);
 h.resolve();const result=await pending;assert.equal(result.ok,true);assert.equal(result.assetId,personalVehicleById('delorean').assetId);
 assert.deepEqual(h.events,['prepare','roomPose','save','releaseOld','mode','mount','adoptLease','spawn']);
 assert.deepEqual(JSON.parse(JSON.stringify(h.state.activeVehicle.pose)),{x:10,y:3,z:12,yaw:1});
});
for(const scenario of ['cancel','world','movement','mode','account'])test(`${scenario} during model preparation cannot release or publish a car`,async()=>{
 const h=harness(),pending=h.runtime.selectAndDrive('delorean');
 if(scenario==='cancel')h.runtime.cancelSelection();if(scenario==='world')h.world.abort();
 if(scenario==='movement')h.actor.position.x+=2;if(scenario==='mode')h.actor.locomotion='fly';if(scenario==='account')h.uid('different');
 h.resolve();assert.equal((await pending).ok,false);assert.ok(!h.events.includes('releaseOld'));assert.ok(!h.events.includes('mount'));assert.ok(h.events.includes('dispose'));
});
test('cancellation after a lease and save still reports failure and releases the staged lease',async()=>{
 const h=harness();h.delayedSave();const pending=h.runtime.selectAndDrive('delorean');h.resolve();await tick();
 assert.ok(h.events.includes('save'));h.runtime.cancelSelection();h.completeSave();
 assert.equal((await pending).ok,false);assert.ok(h.events.includes('releaseLease'));assert.ok(h.events.includes('dispose'));assert.ok(!h.events.includes('mount'));
});
test('the starter BMW restores its saved condition and checkpoints into the same garage',async()=>{
 const h=harness();assert.equal((await h.runtime.selectAndDrive('bmw_e34')).ok,true);assert.equal(h.car.condition,.43);
 h.car.condition=.31;await h.runtime.checkpoint(true);assert.ok(h.events.some(e=>Array.isArray(e)&&e[0]==='park'&&e[1]==='bmw_e34'&&e[2]===.31));
});
test('an old account projection is not exposed after identity changes',()=>{
 const h=harness();h.uid('next');assert.deepEqual(Object.keys(h.runtime.snapshot().vehicles),['bmw_e34']);
});

test('a new world hydrates starter condition once; subsequent frame updates cannot heal damage',()=>{
 const h=harness();h.car.condition=1;h.runtime.update(.016);assert.equal(h.car.condition,.43);
 h.car.condition=.3;h.runtime.update(.016);assert.equal(h.car.condition,.3);
});
test('connected car commands wait for the account projection instead of using a fabricated starter revision',async()=>{
 const h=harness();h.uid('owner');h.runtime.rebindOwner('owner');h.state.vehicleUpgradeStore.garageLoaded=false;
 assert.equal((await h.runtime.selectAndDrive('bmw_e34')).reason,'garage_loading');
 assert.equal((await h.runtime.change({action:'select',vehicleId:'bmw_e34'})).reason,'garage_loading');
 assert.deepEqual(h.events,[]);
});

test('personal car delivery cannot bypass maritime, interior, aircraft or space admission',async()=>{
 for(const patch of [{boatMode:{active:true},boatDeck:{active:true}},{boatMode:{active:true}},{activeInterior:{}},{planeMode:{active:true}},{spaceFlight:{active:true}},{oceanMode:{active:true}}]){
  const h=harness();Object.assign(h.context,patch);const result=await h.runtime.selectAndDrive('bmw_e34');assert.equal(result.ok,false);assert.equal(result.reason,'leave_current_vehicle_or_interior');assert.deepEqual(h.events,[]);
 }
});
