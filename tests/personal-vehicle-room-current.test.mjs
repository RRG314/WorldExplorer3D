import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{claimUrbanVehicleLease}=require('../functions/urban-sandbox.js');
const {personalVehicleById}=require('../functions/generated/vehicle-garage-rules.cjs');
function setup(){const rows=new Map([['garage',{garage:{vehicles:{delorean:{condition:.65}}}}]]),definition=personalVehicleById('delorean');return {rows,
 input:{entityId:'personal:owner:delorean',worldSeed:'city:1',label:definition.label,style:definition.category,pose:{x:0,y:1.12,z:0,yaw:0},actorPose:{x:0,y:1.12,z:0,yaw:0}},
 runTransaction:async fn=>{const pending=new Map(),r=await fn({get:async ref=>({exists:rows.has(ref),data:()=>rows.get(ref)}),set:(ref,v)=>pending.set(ref,v)});for(const [k,v]of pending)rows.set(k,v);return r;},
 entityRef:'car',personalGarageRef:'garage',uid:'owner',nowMs:1000,timestampFromMs:n=>n};}
test('room personal car claims require actual ownership and the canonical model identity',async()=>{
 const h=setup();h.input.style='suv';assert.equal((await claimUrbanVehicleLease(h)).accepted,false);assert.equal(h.rows.has('car'),false);
 h.input.style=personalVehicleById('delorean').category;h.uid='intruder';assert.equal((await claimUrbanVehicleLease(h)).accepted,false);
 h.uid='owner';const r=await claimUrbanVehicleLease(h);assert.equal(r.accepted,true);assert.equal(r.state.condition,.65);
});
test('server pose wins and a real paid garage repair is reflected when the personal car is reclaimed',async()=>{
 const h=setup();await claimUrbanVehicleLease(h);h.rows.set('car',{...h.rows.get('car'),pose:{...h.rows.get('car').pose,x:12}});h.rows.get('garage').garage.vehicles.delorean.condition=1;
 const r=await claimUrbanVehicleLease(h);assert.equal(r.state.pose.x,12);assert.equal(r.state.condition,1);
});
