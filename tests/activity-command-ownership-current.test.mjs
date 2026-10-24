import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import * as travel from '../app/js/travel-mode.js';
import {startActivity,stopActivity,getRuntimeSnapshot} from '../app/js/activity-discovery/runtime.js?v=9';
import {resolveTransportActor} from '../app/js/transport/actor-contract.js?v=6';
import {initWorldSpawning,resolveSafeWorldSpawn,applyResolvedWorldSpawn} from '../app/js/world/spawn.js';
import {createWalkingRuntimeHelpers} from '../app/js/walking/runtime.js';
import {inspectBoatCandidate,enterBoatAtWorldPoint} from '../app/js/boat-mode.js';
import {createBuildingCollisionQuery} from '../app/js/physics/building-collision.js';

function setup(t){
 const saved=Object.getOwnPropertyDescriptors(ctx),deps={...initWorldSpawning()},globals=Object.fromEntries(['document','window'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 globalThis.document={getElementById:()=>null,querySelectorAll:()=>[]};globalThis.window={};
 const calls=[],car={x:-30,y:1.2,z:-40,angle:0},scene=new THREE.Scene(),carMesh=new THREE.Object3D(),state={mode:'walk',view:'third',walker:{x:-30,y:1.7,z:-40,yaw:0,angle:0},characterMesh:new THREE.Object3D()};
 Object.assign(ctx,{car,carMesh,scene,camera:new THREE.PerspectiveCamera(),droneMode:false,drone:{},planeMode:{active:false},boat:{x:0,y:0,z:0,angle:0},boatMode:{active:false,transportCatalogId:'marina-runabout'},boatDeck:{active:false},boatSwimming:{active:false},oceanMode:{active:false},spaceFlight:{active:false},activeInterior:null,activeShipInterior:false,
  gameStarted:true,worldLoading:false,onMoon:false,onMars:false,activePlanetaryBodyId:null,buildings:[],roads:[],waterAreas:[],waterways:[],_worldLoadSequence:1,getEnv:()=> 'EARTH',METERS_PER_WORLD_UNIT:1,
  SurfaceQuery:{terrainAt:()=>({position:{y:0}}),walkAt:()=>({position:{y:0}}),driveAt:()=>({position:{y:0}})},terrainMeshHeightAt:()=>0,elevationWorldYAtWorldXZ:()=>0,
  setTravelMode:travel.setTravelMode,activateDroneAtWorldPose:travel.activateDroneAtWorldPose,activeTransportActor:()=>resolveTransportActor(ctx),resolveSafeWorldSpawn,applyResolvedWorldSpawn,inspectBoatCandidate,enterBoatAtWorldPoint,
  setCameraMode(){},clearControlInputState:()=>calls.push('clear'),clearNavigation:()=>calls.push('clear-route'),createNavigationRoute:()=>calls.push('route'),canExitBoatMode:()=>false,
  checkBuildingCollision:undefined,getNearbyBuildings:undefined,registerGameplayPlugin:undefined,startGameplayPlugin:undefined,getGameplayRegistrySnapshot:undefined,
  prepareBoatMode:()=>{calls.push('prepare-boat');return {};},startBoatMode:()=>{ctx.boatMode.active=true;return true;}});
 if(travel.activateSurfaceActivity)ctx.activateSurfaceActivity=travel.activateSurfaceActivity;
 ctx.Walk={state,CFG:{eyeHeight:1.7},...createWalkingRuntimeHelpers({CFG:{eyeHeight:1.7},state,car,carMesh,scene,camera:ctx.camera,finiteOr:(v,f)=>Number.isFinite(v)?v:f,getSafeDriveY:()=>1.2,getWalkGroundY:()=>0,createCharacterMesh:()=>state.characterMesh,syncCarFromWalker:()=>Object.assign(car,{x:state.walker.x,y:1.2,z:state.walker.z}),syncWalkerFromCar:()=>Object.assign(state.walker,{x:car.x,y:1.7,z:car.z})})};
 initWorldSpawning({buildingContainingPoint:()=>null,findNearestRoad:()=>null,isInsideWaterArea:()=>false,isVehicleRoad:()=>false,traversableFeaturesForMode:()=>[]});
 t.after(()=>{stopActivity();initWorldSpawning(deps);for(const k of Object.keys(ctx))if(Object.getOwnPropertyDescriptor(ctx,k).configurable)delete ctx[k];for(const[k,d]of Object.entries(saved))if(d.configurable)Object.defineProperty(ctx,k,d);for(const[k,d]of Object.entries(globals))d?Object.defineProperty(globalThis,k,d):delete globalThis[k];});
 return calls;
}
let sequence=0;
const activity=(mode,start={x:20,y:0,z:10},extra={})=>({id:`command-${++sequence}`,title:'Admission course',traversalMode:mode,requiresNearbyStart:false,anchors:[{id:'a',typeId:'start',...start},{id:'b',typeId:'finish',label:'Finish',x:120,y:0,z:10}],...extra});
const body=()=>({...ctx.Walk.state.walker});
test('walking activity cannot overwrite a walker inside a solid building',t=>{
 setup(t);const building={minX:-80,maxX:80,minZ:-80,maxZ:80,baseY:0,height:30};ctx.buildings=[building];ctx.checkBuildingCollision=createBuildingCollisionQuery(ctx);initWorldSpawning({buildingContainingPoint:()=>building});const before=body();
 assert.equal(startActivity(activity('walk')),false);assert.deepEqual(body(),before);assert.equal(getRuntimeSnapshot().active,false);
});
test('ground activity refuses a distant safe fallback before retiring the current actor',t=>{
 const calls=setup(t),before=body();ctx.resolveSafeWorldSpawn=()=>({valid:true,x:500,z:500,carY:1.2,walkY:1.7,angle:0});
 assert.equal(startActivity(activity('drive')),false);assert.deepEqual(body(),before);assert.equal(ctx.Walk.state.mode,'walk');assert.deepEqual(calls,[]);
});
test('activity cannot force a vessel exit or mutate an inactive ground controller',t=>{
 const calls=setup(t),before=body();ctx.boatMode.active=true;ctx.stopBoatMode=()=>{ctx.boatMode.active=false;};
 assert.equal(startActivity(activity('walk')),false);assert.deepEqual(body(),before);assert.equal(ctx.boatMode.active,true);assert.deepEqual(calls,[]);
});
test('boat activity requires mapped water and never invents a synthetic launch',t=>{
 const calls=setup(t);assert.equal(startActivity(activity('boat')),false);assert.equal(ctx.boatMode.active,false);assert.deepEqual(calls,[]);
});
test('same-mode vessel activity cannot treat a refused relocation as a successful start',t=>{
 setup(t);ctx.boatMode.active=true;const before={...ctx.boat};assert.equal(startActivity(activity('boat')),false);assert.deepEqual(ctx.boat,before);assert.equal(getRuntimeSnapshot().active,false);
});
test('rooftop activity retains a verified roof while an unsupported elevated start is refused',t=>{
 setup(t);const roof={minX:0,maxX:40,minZ:0,maxZ:40,baseY:0,height:30};ctx.buildings=[roof];initWorldSpawning({buildingContainingPoint:(x,z)=>x>0&&x<40&&z>0&&z<40?roof:null});
 assert.equal(startActivity(activity('walk',{x:20,y:30,z:10,environment:'rooftop'})),true);assert.equal(ctx.Walk.state.walker.y,31.7);stopActivity();const before=body();
 assert.equal(startActivity(activity('walk',{x:70,y:90,z:70,environment:'rooftop'})),false);assert.deepEqual(body(),before);
});
test('ground activity uses fresh-arrival clearance rather than saved doorway margins',t=>{
 setup(t);const seen=[];ctx.checkBuildingCollision=(x,z,r)=>{seen.push(r);return {collision:false};};
 assert.equal(startActivity(activity('walk')),true);assert.ok(seen.includes(1.5));assert.equal(ctx.Walk.state.walker.x,20);
});
test('dedicated interior and loading sessions refuse activities without changing the actor',t=>{
 setup(t);const before=body();ctx.activeShipInterior=true;assert.equal(startActivity(activity('walk')),false);assert.deepEqual(body(),before);ctx.activeShipInterior=false;
 ctx.worldLoading=true;assert.equal(startActivity(activity('walk')),false);assert.deepEqual(body(),before);
});
test('world replacement during activity spawn resolution cannot publish progress or actor state',t=>{
 const calls=setup(t),before=body();ctx.resolveSafeWorldSpawn=()=>{ctx._worldLoadSequence++;return {valid:true,x:20,z:10,carY:1.2,walkY:1.7,angle:0};};
 assert.equal(startActivity(activity('walk')),false);assert.deepEqual(body(),before);assert.deepEqual(calls,[]);assert.equal(getRuntimeSnapshot().active,false);
});
test('nearby admission still guides the player without activating a remote activity',t=>{
 const calls=setup(t),before=body();assert.equal(startActivity(activity('walk',{x:300,y:0,z:400},{requiresNearbyStart:true})),false);assert.deepEqual(calls,['route']);assert.deepEqual(body(),before);
});
test('invalid activity coordinates cannot poison the active walker',t=>{
 setup(t);const before=body();assert.equal(startActivity(activity('walk',{x:NaN,y:0,z:10})),false);assert.deepEqual(body(),before);
});
