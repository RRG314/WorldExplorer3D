import test,{after} from 'node:test';import assert from 'node:assert/strict';
import {createUrbanRoomAuthorityRuntime} from '../app/js/urban-sandbox/room-authority-runtime.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const oldAdd=globalThis.addEventListener,oldRemove=globalThis.removeEventListener,events=new EventTarget();
globalThis.addEventListener=events.addEventListener.bind(events);globalThis.removeEventListener=events.removeEventListener.bind(events);
after(()=>{if(oldAdd)globalThis.addEventListener=oldAdd;else delete globalThis.addEventListener;if(oldRemove)globalThis.removeEventListener=oldRemove;else delete globalThis.removeEventListener;});
function setup({claim}={}){
 let active=true,room={code:'ROOM01',world:{seed:'one'}};const car={x:1,y:2,z:3,yaw:.4},calls=[];
 const state={activeVehicle:null,transition:null,vehicles:[],npcs:[],remoteEntities:new Map()};
 const runtime=createUrbanRoomAuthorityRuntime({state,isActive:()=>active,getCurrentRoom:()=>room,
  createAuthority:({room})=>({actorUid:'owner',roomCode:room.code,claimVehicle:claim||(async(v,p)=>{calls.push(['claim',v.id,{...p}]);return {accepted:true};}),updateVehicle:async(v,p)=>{calls.push(['update',v.id,{...p}]);return {accepted:true};},
   releaseVehicle:async(v,p)=>{calls.push(['release',v.id,{...p}]);return {accepted:true};},dispose(){calls.push(['dispose',room.code]);}}),
  vehiclePose:v=>v.attachedToPlayer?{...car}:{x:v.x,y:v.y,z:v.z,yaw:v.yaw},setStatus(){},reconcileVehicles(){}});
 const vehicle={id:'personal:owner:bmw_e34',personalVehicleId:'bmw_e34',attachedToPlayer:true,...car};
 return {runtime,state,vehicle,car,calls,setActive:v=>active=v,setRoom:v=>room=v};
}
test('starter custody uses the ordinary room heartbeat and releases the captured driver pose',async()=>{
 const h=setup();try{await settle();assert.equal((await h.runtime.ensureDefaultDriverLease(h.vehicle)).accepted,true);await settle();
  assert.equal(h.state.defaultRoomVehicle,h.vehicle);assert.ok(h.calls.some(c=>c[0]==='update'));h.car.x=20;h.runtime.releaseDefaultDriverLease();h.car.x=100;
  assert.equal(h.state.defaultRoomVehicle,null);assert.equal(h.calls.filter(c=>c[0]==='release').length,1);assert.equal(h.calls.find(c=>c[0]==='release')[2].x,20);
 }finally{h.runtime.dispose();}
});
test('an obsolete starter claim releases its lease without adopting controls',async()=>{
 let resolve;const h=setup({claim:()=>new Promise(done=>resolve=done)});
 try{await settle();const pending=h.runtime.ensureDefaultDriverLease(h.vehicle);await settle();h.setActive(false);resolve({accepted:true});
  assert.equal((await pending).accepted,false);assert.equal(h.state.defaultRoomVehicle,null);assert.equal(h.calls.filter(c=>c[0]==='release').length,1);
 }finally{h.runtime.dispose();}
});
test('changing rooms retires the starter lease instead of carrying it into a replacement room',async()=>{
 const h=setup();try{await settle();await h.runtime.ensureDefaultDriverLease(h.vehicle);h.setRoom({code:'ROOM02',world:{seed:'two'}});await h.runtime.sync();
  assert.equal(h.state.defaultRoomVehicle,null);assert.equal(h.runtime.snapshot().roomCode,'ROOM02');assert.ok(h.calls.some(c=>c[0]==='release'));
 }finally{h.runtime.dispose();}
});
