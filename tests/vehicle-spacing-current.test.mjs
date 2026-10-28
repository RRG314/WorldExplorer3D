import test from 'node:test';import assert from 'node:assert/strict';
import {createVehicleSpacing,vehicleFollowingGap} from '../app/js/living-world/vehicle-spacing.js';
import {roadCollisionDamageForce,resolveCrashImpact} from '../app/js/urban-sandbox/crash-physics.js';
const car=(id,x,z,yaw=0,length=5.7,y=0)=>({id,x,z,y,yaw,speed:8,variant:{width:2.03,length,height:1.5}});
test('long vehicles reserve their actual bumpers and cannot sweep through a stopped car',()=>{
 const a=car('a',0,0),b=car('b',0,8);b.speed=0;const spacing=createVehicleSpacing([a,b],a=>a);
 assert.ok(vehicleFollowingGap(a,b,0)>a.variant.length);
 const fraction=spacing.limit(a,0,20);assert.ok(fraction>.05&&fraction<.12);
 assert.equal(spacing.limit(a,0,-20),1);
});
test('crossing roads yield upstream and physically different bridge decks remain independent',()=>{
 const a=car('a',0,-10),b=car('b',-10,0,Math.PI/2);
 const spacing=createVehicleSpacing([a,b],v=>v);
 assert.equal(spacing.limit(b,8/30,0),0);
 assert.ok(spacing.limit(a,0,8/30)>0);
 b.y=8;const bridge=createVehicleSpacing([a,b],v=>v);assert.equal(bridge.limit(b,20,0),1);
});
test('parked and player chassis constrain ambient motion without owning its position',()=>{
 const a=car('a',0,0),obstacle=car('player',0,9);const spacing=createVehicleSpacing([a],v=>v,[obstacle]);
 assert.ok(spacing.limit(a,0,10)<.4);assert.equal(a.z,0);assert.equal(obstacle.z,9);
});
test('a low speed collision is forgiving while severe impacts still disable and conserve impulse',()=>{
 assert.equal(roadCollisionDamageForce(2),0);assert.ok(roadCollisionDamageForce(4.5)/160<.025);
 assert.ok(roadCollisionDamageForce(30)>100);
 const result=resolveCrashImpact({moverMassKg:1500,targetMassKg:1500,moverVelocity:{x:0,z:4.5},targetVelocity:{x:0,z:0},normal:{x:0,z:1}});
 assert.ok(result.moverDamageForce<3);assert.ok(result.targetDamageForce<3);
 assert.ok(Math.abs(result.moverVelocity.z+result.targetVelocity.z-4.5)<1e-6);
});
