import {createRoadRegionLease} from '../app/js/terrain/road-region-lease.js';
import * as THREE from 'three';
import {actorNeedsRoadDetail,actorRequestsRoadDetail} from '../app/js/terrain/transport-detail-plan.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {resolveControlState} from '../app/js/transport/control-state.js';
import {resolveTransportActor,activeActorPose} from '../app/js/transport/actor-contract.js?v=6';
import {setTravelMode,getCurrentTravelMode} from '../app/js/travel-mode.js';
import {activePresentationOwner,dedicatedPresentationActive} from '../app/js/runtime/renderer-owners.js';
import {updateAlternateTravelMode} from '../app/js/physics/mode-dispatch.js?v=5';

const actor=(x=0)=>({x,y:2,z:3,yaw:0});
test('helm, deck, swimming and dedicated worlds retain distinct actor and controller identities',()=>{
 const c={gameStarted:true,car:actor(),Walk:{state:{mode:'drive',walker:actor(30)}},boatMode:{active:true},boat:actor(100),boatDeck:{active:false,navigationActor:()=>({position:{x:110,y:7,z:15},yaw:.4})}};
 assert.equal(activeActorPose(c).mode,'boat');assert.equal(resolveControlState(c).camera,'boat');
 c.boatDeck.active=true;const deck=resolveTransportActor(c);
 assert.deepEqual([deck.mode,deck.locomotion,deck.controller,deck.camera,deck.occupancy],['boat','walk','boat','research-deck','vessel-deck']);
 assert.equal(activeActorPose(c).x,110);assert.equal(activeActorPose(c).mode,'walk');
 c.boatMode.active=false;c.boatDeck.active=false;c.Walk.state.mode='walk';c.Walk.state.walker.swimming={submerged:true};
 assert.equal(activeActorPose(c).mode,'swim');assert.equal(resolveControlState(c).camera,'walk');
 assert.equal(resolveTransportActor(c).contact.kind,'water_column');assert.equal(resolveTransportActor(c).contact.grounded,false);
 c.oceanMode={active:true,submarine:{position:{x:500,y:-40,z:2}},diver:{active:false,navigationActor:()=>({position:{x:510,y:-20,z:5}})}};
 assert.equal(resolveTransportActor(c).locomotion,'submarine');assert.equal(activePresentationOwner(c),'ocean');
 c.oceanMode.diver.active=true;assert.equal(activeActorPose(c).x,510);assert.equal(activeActorPose(c).mode,'swim');
 c.oceanMode.active=false;c.spaceFlight={active:true,rocket:{position:{x:1,y:8,z:4}}};assert.equal(activePresentationOwner(c),'space');
 c.activeShipInterior=true;delete c.Walk.state.walker.swimming;
 assert.equal(activePresentationOwner(c),'main');assert.equal(activeActorPose(c).frame,'ship-interior');assert.equal(resolveControlState(c).camera,'walk');assert.equal(dedicatedPresentationActive(c),false);
 c.worldLoading=true;assert.equal(dedicatedPresentationActive(c),true);c.worldLoading=false;
 c.activeShipInterior=false;c.spaceFlight.active=false;assert.equal(activeActorPose(c).x,30);assert.equal(activePresentationOwner(c),'main');
});

test('physics, actor and camera agree when legacy activation flags overlap',()=>{
 const updates=[],c={car:actor(),boat:actor(12),boatMode:{active:true},planeMode:{...actor(99),active:true},droneMode:true,drone:actor(80),Walk:{state:{mode:'walk',walker:actor(50)}},updateBoatMode:()=>updates.push('boat')};
 assert.equal(updateAlternateTravelMode(c,.016,{updatePlane:()=>updates.push('plane'),updateDrone:()=>updates.push('drone')}),true);
 assert.deepEqual(updates,['boat']);assert.equal(resolveTransportActor(c).position.x,12);assert.equal(resolveControlState(c).camera,'boat');
});

function setup(t){
 const saved=new Map(Object.keys(ctx).map(key=>[key,Object.getOwnPropertyDescriptor(ctx,key)]));
 for(const key of Object.keys(ctx))delete ctx[key];
 const oldDocument=globalThis.document;globalThis.document={getElementById:()=>null};
 const calls=[];
 Object.assign(ctx,{car:actor(),boat:actor(100),boatMode:{active:true},planeMode:{...actor(200),active:false},Walk:{state:{mode:'drive'},setModeDrive(){this.state.mode='drive'}},getEnv:()=> 'EARTH',ENV:{EARTH:'EARTH'},canExitBoatMode:()=>true,clearControlInputState:()=>calls.push('clear'),stopBoatMode(){calls.push('exit-boat');ctx.boatMode.active=false},stopPlaneMode(){calls.push('exit-plane');ctx.planeMode.active=false},setCameraMode(){}});
 t.after(()=>{for(const key of Object.keys(ctx))delete ctx[key];for(const [key,d]of saved)Object.defineProperty(ctx,key,d);globalThis.document=oldDocument;});
 return calls;
}
test('denied or failed vehicle preparation preserves the current controller and inputs',t=>{
 const calls=setup(t);ctx.preparePlaneMode=()=>false;
 assert.equal(setTravelMode('plane'),'boat');assert.equal(getCurrentTravelMode(),'boat');assert.deepEqual(calls,[]);
 ctx.preparePlaneMode=()=>{throw Error('asset unavailable')};assert.throws(()=>setTravelMode('plane'),/asset unavailable/);assert.equal(getCurrentTravelMode(),'boat');assert.deepEqual(calls,[]);
 ctx.boatMode.active=false;ctx.planeMode.active=true;ctx.prepareBoatMode=()=>false;
 assert.equal(setTravelMode('boat'),'plane');assert.deepEqual(calls,[]);
 assert.equal(setTravelMode('unknown'),'plane');assert.equal(ctx.planeMode.active,true);
});
test('accepted vehicle entry prepares before exit and consumes that exact admission',t=>{
 const calls=setup(t),ticket={ready:true};
 ctx.preparePlaneMode=()=>{calls.push('prepare-plane');return ticket};
 ctx.startPlaneMode=(options,prepared)=>{assert.equal(prepared,ticket);calls.push('enter-plane');ctx.planeMode.active=true;return true};
 assert.equal(setTravelMode('plane'),'plane');assert.deepEqual(calls,['prepare-plane','clear','exit-boat','enter-plane']);
 assert.equal(ctx.boatMode.active,false);assert.equal(ctx.planeMode.active,true);
});
test('surface controls cannot take ownership of an ocean, spacecraft or ship interior',t=>{
 const calls=setup(t);ctx.oceanMode={active:true};assert.equal(setTravelMode('drive'),'ocean');
 ctx.oceanMode.active=false;ctx.spaceFlight={active:true};assert.equal(setTravelMode('walk'),'rocket');
 ctx.activeShipInterior=true;assert.equal(setTravelMode('drone'),'walk');assert.deepEqual(calls,[]);
});

test('road preparation follows the contact owner, allowing swimming and occupied decks to continue',()=>{
 for(const occupancy of ['water','vessel-deck']){
  const point={x:3500,y:0,z:0,source:'walk',occupancy};
  assert.equal(actorNeedsRoadDetail(point,0),false);assert.equal(actorRequestsRoadDetail(point,0),false);
 }
 assert.equal(actorNeedsRoadDetail({source:'walk',occupancy:'ground'},0),true);
});

test('retiring an old road publication releases only its own geometry/contact after world replacement',()=>{
 const scene=new THREE.Scene(),material=new THREE.MeshBasicMaterial();
 const old=new THREE.Mesh(new THREE.PlaneGeometry(),material),current=new THREE.Mesh(new THREE.PlaneGeometry(),material);scene.add(old,current);
 let oldDisposed=0,currentDisposed=0,materialsDisposed=0,contacts=0;
 old.geometry.addEventListener('dispose',()=>oldDisposed++);current.geometry.addEventListener('dispose',()=>currentDisposed++);material.addEventListener('dispose',()=>materialsDisposed++);
 const lease=createRoadRegionLease([old],{remove:key=>{assert.equal(key,'old');contacts++;}},'old'),newWorld=[current];
 assert.equal(lease.dispose(),true);assert.equal(lease.dispose(),false);
 assert.deepEqual(scene.children,newWorld);assert.deepEqual([oldDisposed,currentDisposed,materialsDisposed,contacts],[1,0,0,1]);
 current.geometry.dispose();material.dispose();
});

test('a blocked vessel exit does not prepare a replacement visual',t=>{
 const calls=setup(t);ctx.canExitBoatMode=()=>false;
 ctx.preparePlaneMode=()=>{calls.push('prepare-plane');return {}};
 assert.equal(setTravelMode('plane'),'boat');assert.deepEqual(calls,[]);
});
test('drone launch keeps the departed walker position when drive-mode retirement changes the parked car',t=>{
 setup(t);ctx.boatMode.active=false;ctx.Walk.state={mode:'walk',walker:actor(120)};
 ctx.activeTransportActor=()=>resolveTransportActor(ctx);ctx.drone={};
 ctx.Walk.setModeDrive=function(){this.state.mode='drive';ctx.car.x=999;};
 ctx.Walk.getMapRefPosition=()=>({x:ctx.car.x,z:ctx.car.z});
 assert.equal(setTravelMode('drone'),'drone');assert.equal(ctx.drone.x,120);assert.notEqual(ctx.drone.x,ctx.car.x);
});
