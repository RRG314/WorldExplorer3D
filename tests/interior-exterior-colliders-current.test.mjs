import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {clearActiveInterior} from '../app/js/interiors/runtime.js?v=20';
import {createBuildingCollisionQuery} from '../app/js/physics/building-collision.js';
import {createWalkingPhysicsHelpers} from '../app/js/walking/physics.js';
const deps={isWalkModeActive:()=>false,finiteNumber:(v,f)=>Number.isFinite(v)?v:f,listSupportedInteriorsNear:()=>[]};
test('interior exit restores this world exterior obstacles without reviving a prior world',()=>{
 const keys=['activeInterior','dynamicBuildingColliders','replaceWorldCollection','_worldLoadSequence','Walk'];const saved=Object.fromEntries(keys.map(k=>[k,ctx[k]]));
 try{
  ctx.Walk=null;ctx._worldLoadSequence=2;ctx.replaceWorldCollection=(key,value=[])=>{ctx[key]=value};const bench={id:'bench'},wall={id:'wall'};
  ctx.dynamicBuildingColliders=[bench];ctx.activeInterior=null;
  assert.equal(clearActiveInterior({preservePrompt:true},deps),false);assert.deepEqual(ctx.dynamicBuildingColliders,[bench]);
  ctx.activeInterior={outsideWorldSequence:2,outsideColliders:[bench]};ctx.dynamicBuildingColliders=[wall];
  assert.equal(clearActiveInterior({preservePrompt:true},deps),true);assert.deepEqual(ctx.dynamicBuildingColliders,[bench]);assert.equal(ctx.activeInterior,null);
  ctx.activeInterior={outsideWorldSequence:1,outsideColliders:[bench]};ctx.dynamicBuildingColliders=[wall];
  clearActiveInterior({preservePrompt:true},deps);assert.deepEqual(ctx.dynamicBuildingColliders,[]);
 }finally{Object.assign(ctx,saved)}
});
test('authored venue spanning multiple exterior parts uses only its own walls until exit',()=>{
 const exterior={minX:-5,maxX:5,minZ:-5,maxZ:5,baseY:0,height:15},wall={minX:8,maxX:8.3,minZ:-5,maxZ:5,baseY:4,height:4,isInteriorCollider:true};
 let geographicQueries=0;const context={activeInterior:{floorPlan:{authored:true}},buildings:[exterior],transportStructureColliders:[exterior],dynamicBuildingColliders:[wall],getNearbyBuildings:()=>{geographicQueries++;return[exterior];}};
 const query=createBuildingCollisionQuery(context);
 assert.equal(query(0,0,.3,{actorBaseY:5}).collision,false);assert.equal(geographicQueries,0);
 assert.equal(query(8,0,.3,{actorBaseY:5}).building,wall);
 context.activeInterior=null;assert.equal(query(0,0,.3,{actorBaseY:5}).building,exterior);assert.equal(geographicQueries,1);
 context.activeInterior={mode:'mapped'};assert.equal(query(0,0,.3,{actorBaseY:5}).collision,true,'Legacy partial interiors retain world behavior');
});
test('authored walking excludes exterior roofs, creative blocks and street furniture without weakening its wall collisions',()=>{
 const names=['activeInterior','dynamicBuildingColliders','readControlActions','checkBuildingCollision','getBuildTopSurfaceAtWorldXZ','getBuildCollisionAtWorldXZ','resolveUrbanActorCollision'],saved=Object.fromEntries(names.map(n=>[n,ctx[n]]));
 try{
  ctx.activeInterior={floorPlan:{authored:true,floors:[{elevation:0,height:3.6}]},activeLevel:0,floorBaseY:0,authoredCeilings:[]};ctx.dynamicBuildingColliders=[];
  ctx.getBuildTopSurfaceAtWorldXZ=()=>{throw Error('Exterior block support leaked indoors');};ctx.getBuildCollisionAtWorldXZ=()=>{throw Error('Exterior block collision leaked indoors');};ctx.resolveUrbanActorCollision=()=>{throw Error('Street furniture leaked indoors');};
  ctx.readControlActions=()=>({move:1});ctx.checkBuildingCollision=createBuildingCollisionQuery(ctx);
  const state={walker:{x:0,z:0,y:1.7,yaw:0,angle:0,pitch:0,lookYawOffset:0,vy:0,wallJumpTimer:0}},physics=createWalkingPhysicsHelpers({CFG:{eyeHeight:1.7,walkSpeed:2.8,runSpeed:5.6,turnSpeed:2.6,blockStepHeight:.65},state,getWalkGroundY:()=>0,getBuildingsArray:()=>{throw Error('Exterior building query leaked indoors');},keys:{}});
  physics.updateWalkPhysics(.05,(v,f)=>Number.isFinite(v)?v:f);assert.ok(state.walker.z>.1);assert.equal(state.walker.y,1.7);
  ctx.dynamicBuildingColliders=[{minX:-2,maxX:2,minZ:.3,maxZ:.5,baseY:0,height:3,isInteriorCollider:true}];const z=state.walker.z;physics.updateWalkPhysics(.05,(v,f)=>Number.isFinite(v)?v:f);assert.equal(state.walker.z,z);
 }finally{Object.assign(ctx,saved);}
});

test('accurate lower-floor walls cannot extend through the upper slab clearance',()=>{
 const wall={minX:-2,maxX:2,minZ:-2,maxZ:2,baseY:4.2,height:3.6,isInteriorCollider:true};
 const query=createBuildingCollisionQuery({activeInterior:{floorPlan:{authored:true}},dynamicBuildingColliders:[wall]});
 assert.equal(query(0,0,.28,{actorBaseY:8,actorHeight:1.7}).collision,false);
 assert.equal(query(0,0,.28,{actorBaseY:7.7,actorHeight:1.7}).collision,true);
});
