import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {createBuildingCollisionQuery} from '../app/js/physics/building-collision.js';
import {createWalkingPhysicsHelpers} from '../app/js/walking/physics.js';
import {resolveInteriorCeiling} from '../app/js/interiors/vertical-boundary.js';
import {createShipNavigation} from '../app/js/expedition/ship-navigation.js';
const box=(minX,maxX,minZ,maxZ,height=4)=>({minX,maxX,minZ,maxZ,baseY:0,height});
test('a local ship ignores retained Earth obstacles, then restores their collision on exit',()=>{
 const earth=box(-5,5,-5,5),wall={...box(8,9,-5,5),isInteriorCollider:true};
 const context={activeInterior:{environmentKind:'expedition-ship'},buildings:[earth],getNearbyBuildings:()=>[earth],dynamicBuildingColliders:[wall]};
 const collision=createBuildingCollisionQuery(context);
 assert.equal(collision(0,0,.3).collision,false);
 assert.equal(collision(8.2,0,.3).collision,true);
 context.activeInterior=null;assert.equal(collision(0,0,.3).collision,true);
});
test('ship floor support cannot be replaced by an Earth roof or placed block',()=>{
 const saved={activeInterior:ctx.activeInterior,getBuildTopSurfaceAtWorldXZ:ctx.getBuildTopSurfaceAtWorldXZ};
 try{
  const roof=box(-5,5,-5,5,.5);
  const physics=createWalkingPhysicsHelpers({CFG:{eyeHeight:1.7,blockStepHeight:.4},state:{walker:{x:0,z:0,y:1.74}},getWalkGroundY:()=>0,getBuildingsArray:()=>[roof]});
  ctx.getBuildTopSurfaceAtWorldXZ=()=>.3;ctx.activeInterior={environmentKind:'expedition-ship'};
  assert.deepEqual(physics.resolveWalkGroundState(0,0,1.74,(v,f)=>Number.isFinite(v)?v:f),{groundY:0,effectiveGroundY:0,onBuilding:false});
  ctx.activeInterior=null;assert.equal(physics.resolveWalkGroundState(0,0,1.74,(v,f)=>Number.isFinite(v)?v:f).effectiveGroundY,.5);
 }finally{Object.assign(ctx,saved);}
});
test('each ship deck uses its rendered ceiling rather than an unrelated building story height',()=>{
 for(const ceilingY of [3.6,6]){
  const activeInterior={environmentKind:'expedition-ship',ceilingY,floorBaseY:0,activeLevel:0,floorPlan:{storyHeight:3.5}};
  assert.equal(resolveInteriorCeiling({activeInterior,eyeY:ceilingY-.3,verticalVelocity:1}).collided,false);
  assert.equal(resolveInteriorCeiling({activeInterior,eyeY:ceilingY+.2,verticalVelocity:1}).eyeY,ceilingY-.18);
 }
});
test('furnished ship routes detour around equipment without cutting its corners',()=>{
 const obstacle=box(-1.5,1.5,-1,1),nav=createShipNavigation([obstacle],8);
 const route=nav.route({x:0,z:-6},{x:0,z:6},.5);
 assert.ok(route.length>=3);
 for(let i=1;i<route.length;i++)assert.equal(nav.clear(route[i-1],route[i]),true);
 assert.ok(Math.hypot(route.at(-1).x,route.at(-1).z-6)<.5);
 assert.deepEqual(nav.route({x:0,z:-6},{x:0,z:0},.5),[],'Never guide into solid equipment');
});
test('an interaction approach uses the reachable side of equipment, not a closer isolated pocket',()=>{
 const walls=[box(-1.2,-1,-1.2,1.2),box(1,1.2,-1.2,1.2),box(-1.2,1.2,-1.2,-1),box(-1.2,1.2,1,1.2)];
 const nav=createShipNavigation(walls,8),route=nav.route({x:0,z:-6},{x:0,z:0},2.15);
 assert.ok(route.length>=2);assert.ok(route.at(-1).z<-1.2);assert.ok(Math.hypot(route.at(-1).x,route.at(-1).z)<2.15);
});
test('jumping beside ship furniture cannot invoke the outdoor roof exception and pass through it',()=>{
 const names=['activeInterior','readControlActions','checkBuildingCollision','getBuildTopSurfaceAtWorldXZ'];
 const saved=Object.fromEntries(names.map(name=>[name,ctx[name]]));
 try{
  ctx.activeInterior={environmentKind:'expedition-ship',floorBaseY:0,ceilingY:3.6,floorPlan:{storyHeight:3.6},activeLevel:0};
  ctx.readControlActions=()=>({move:1});ctx.getBuildTopSurfaceAtWorldXZ=undefined;
  ctx.checkBuildingCollision=createBuildingCollisionQuery({dynamicBuildingColliders:[{...box(-2,2,0,2,1.9),isInteriorCollider:true}]});
  const state={walker:{x:0,z:-.32,y:2.9,yaw:0,angle:0,pitch:0,lookYawOffset:0,vy:0,wallJumpTimer:0}};
  const helpers=createWalkingPhysicsHelpers({CFG:{eyeHeight:1.7,walkSpeed:2.8,runSpeed:5.6,turnSpeed:2.6,blockStepHeight:.65},state,getWalkGroundY:()=>0,keys:{}});
  helpers.updateWalkPhysics(.02,(v,f)=>Number.isFinite(v)?v:f);
  assert.equal(state.walker.z,-.32);
 }finally{Object.assign(ctx,saved);}
});
