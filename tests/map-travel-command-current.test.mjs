import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import * as travel from '../app/js/travel-mode.js';
import {teleportToLocation,initWorldNavigation} from '../app/js/world/navigation.js';
import {initWorldSpawning,resolveSafeWorldSpawn,applyResolvedWorldSpawn,applySpawnTarget,tryAutoEnterBoatAt} from '../app/js/world/spawn.js';
import {createWalkingRuntimeHelpers} from '../app/js/walking/runtime.js';
import {resolveTransportActor} from '../app/js/transport/actor-contract.js?v=6';
import {enterBoatAtWorldPoint,inspectBoatCandidate} from '../app/js/boat-mode.js';
import {normalizeWaterBody} from '../app/js/world/water-body-contract.js?v=4';
import {createBuildingCollisionQuery} from '../app/js/physics/building-collision.js';

function setup(t) {
  const saved=Object.getOwnPropertyDescriptors(ctx),deps={...initWorldSpawning()};
  const globals=Object.fromEntries(['document','window'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  globalThis.document={getElementById:()=>null,querySelectorAll:()=>[]};globalThis.window={location:{search:''}};
  const calls=[],car={x:-40,y:1.2,z:60,angle:.1},scene=new THREE.Scene(),carMesh=new THREE.Object3D(),characterMesh=new THREE.Object3D();
  const state={mode:'walk',view:'third',walker:{x:-40,y:1.7,z:60,angle:.2,yaw:.2},characterMesh};
  Object.assign(ctx,{car,scene,carMesh,camera:new THREE.PerspectiveCamera(),camMode:0,
    boat:{x:10,y:0,z:20,angle:.1},boatMode:{active:false,transportCatalogId:'marina-runabout'},boatDeck:{active:false},boatSwimming:{active:false},
    planeMode:{active:false},oceanMode:{active:false},spaceFlight:{active:false},drone:{x:0,y:20,z:0,yaw:0,pitch:0},droneMode:false,
    gameStarted:true,worldLoading:false,activeInterior:null,activeShipInterior:false,onMoon:false,onMars:false,travelingToMoon:false,activePlanetaryBodyId:null,
    _worldLoadSequence:1,worldLoadRuntimeState:null,roads:[],buildings:[],waterAreas:[],waterways:[],terrainEnabled:true,LOC:{lat:39,lon:-76},METERS_PER_WORLD_UNIT:1,
    SurfaceQuery:{terrainAt:()=>({position:{y:0}}),walkAt:()=>({position:{y:0}}),driveAt:()=>({position:{y:0}})},
    terrainMeshHeightAt:()=>0,elevationWorldYAtWorldXZ:()=>0,getEnv:()=> 'EARTH',
    setTravelMode:travel.setTravelMode,activateDroneAtWorldPose:travel.activateDroneAtWorldPose,enterBoatAtWorldPoint,inspectBoatCandidate,
    activeTransportActor:()=>resolveTransportActor(ctx),resolveSafeWorldSpawn,applyResolvedWorldSpawn,
    clearControlInputState:()=>calls.push('clear'),setCameraMode:m=>{ctx.camMode=m;},
    canExitBoatMode:()=>false,stopBoatMode(){calls.push('stop-boat');ctx.boatMode.active=false;},
    preparePlaneMode:()=>false,startPlaneMode:()=>false,startBoatMode:()=>false,
    updateCamera:undefined,updateControlsModeUI:undefined,checkBuildingCollision:undefined,
    getNearbyBuildings:undefined,ensureCuratedPlayerCar:undefined});
  if(travel.restoreSurfaceTravelPose)ctx.restoreSurfaceTravelPose=travel.restoreSurfaceTravelPose;
  ctx.Walk={state,CFG:{eyeHeight:1.7},...createWalkingRuntimeHelpers({CFG:{eyeHeight:1.7},camera:ctx.camera,car,carMesh,scene,state,
    finiteOr:(v,f)=>Number.isFinite(v)?v:f,getSafeDriveY:()=>1.2,getWalkGroundY:()=>0,createCharacterMesh:()=>characterMesh,
    syncCarFromWalker:()=>Object.assign(car,{x:state.walker.x,y:1.2,z:state.walker.z,angle:state.walker.angle}),
    syncWalkerFromCar:()=>Object.assign(state.walker,{x:car.x,y:1.7,z:car.z,angle:car.angle,yaw:car.angle})})};
  initWorldSpawning({buildingContainingPoint:()=>null,findNearestRoad:()=>null,isInsideWaterArea:()=>false,isVehicleRoad:()=>false,traversableFeaturesForMode:()=>[]});
  initWorldNavigation({applySpawnTarget,tryAutoEnterBoatAt});
  if(travel.travelToWorldPoint)ctx.travelToWorldPoint=travel.travelToWorldPoint;
  t.after(()=>{initWorldSpawning(deps);for(const k of Object.keys(ctx))if(Object.getOwnPropertyDescriptor(ctx,k).configurable)delete ctx[k];for(const [k,d]of Object.entries(saved))if(d.configurable)Object.defineProperty(ctx,k,d);for(const [k,d]of Object.entries(globals))d?Object.defineProperty(globalThis,k,d):delete globalThis[k];});
  return calls;
}
function water(depth=10) {
  ctx.waterAreas=[normalizeWaterBody({shape:'area',type:'water',water:'lake',pts:[{x:-300,z:-300},{x:300,z:-300},{x:300,z:300},{x:-300,z:300}],area:360000,surfaceY:0,depthEvidence:{truthType:'measured',depthMeters:depth,sourceId:'controlled-test'}})];
}

const travelTo=(x=80,z=90,options={})=>teleportToLocation(x,z,{source:'map_test',preferBoatIfWater:true,...options});
const ground=()=>({car:{...ctx.car},walker:{...ctx.Walk.state.walker}});
test('map flight moves the active aircraft through preparation and preserves parked ground actors',t=>{
 const calls=setup(t);ctx.Walk.state.mode='drive';ctx.planeMode={active:true,x:0,y:80,z:0,yaw:.5,pitch:.1,speed:36,throttle:.6,transportCatalogId:'personal-prop'};const before=ground();
 ctx.preparePlaneMode=options=>{calls.push('prepare');assert.equal(options.transportCatalogId,'personal-prop');return {};};
 ctx.startPlaneMode=options=>{Object.assign(ctx.planeMode,options);return true;};
 assert.equal(travelTo()?.mode,'plane');assert.deepEqual([ctx.planeMode.x,ctx.planeMode.y,ctx.planeMode.z],[80,80,90]);assert.equal(ctx.planeMode.speed,36);assert.equal(ctx.planeMode.throttle,.6);assert.deepEqual(ground(),before);assert.deepEqual(calls,['prepare']);
});
test('failed or obsolete map aircraft preparation cannot publish a target',t=>{
 setup(t);ctx.planeMode={active:true,x:0,y:80,z:0,yaw:0,pitch:0};const before=ground(),plane={...ctx.planeMode};ctx.preparePlaneMode=()=>{ctx._worldLoadSequence++;return {};};ctx.startPlaneMode=()=>assert.fail('obsolete aircraft');
 assert.equal(travelTo(),null);assert.deepEqual(ground(),before);assert.deepEqual(ctx.planeMode,plane);
});
test('map drone relocation retains flight ownership and clears the target roof',t=>{
 setup(t);ctx.droneMode=true;ctx.Walk.state.mode='drive';ctx.drone={x:0,y:20,z:0,yaw:.4,pitch:-.2};ctx.buildings=[{minX:60,maxX:100,minZ:70,maxZ:110,baseY:0,height:90}];const before=ground();
 assert.equal(travelTo()?.mode,'drone');assert.equal(ctx.droneMode,true);assert.equal(ctx.drone.x,80);assert.equal(ctx.drone.z,90);assert.equal(ctx.drone.y,98);assert.equal(ctx.drone.pitch,-.2);assert.deepEqual(ground(),before);
});
test('map vessel relocation uses the active hull and refuses land without moving proxies',t=>{
 setup(t);water();ctx.boatMode.active=true;ctx.startBoatMode=()=>true;assert.equal(travelTo()?.mode,'boat');assert.equal(ctx.boat.x,80);assert.equal(ctx.boat.z,90);
 const before=ground(),boat={...ctx.boat};assert.equal(travelTo(800,900),null);assert.deepEqual(ground(),before);assert.deepEqual(ctx.boat,boat);assert.equal(ctx.boatMode.active,true);
});
test('map water preference enters through vessel preparation and refuses shallow water',t=>{
 const calls=setup(t);water(.1);const before=ground();assert.equal(travelTo(),null);assert.deepEqual(ground(),before);assert.equal(ctx.boatMode.active,false);
 water();ctx.prepareBoatMode=options=>{calls.push('prepare-boat');assert.ok(options.candidate);return {};};ctx.startBoatMode=()=>{ctx.boatMode.active=true;return true;};assert.equal(travelTo()?.mode,'boat');assert.deepEqual(calls,['prepare-boat','clear']);
});
test('map ground arrival resolves target support instead of carrying a departing roof height',t=>{
 setup(t);ctx.Walk.state.walker.y=101.7;ctx.buildings=[{minX:60,maxX:100,minZ:70,maxZ:110,baseY:0,height:30}];initWorldSpawning({buildingContainingPoint:(x,z)=>x>=60&&x<=100&&z>=70&&z<=110?ctx.buildings[0]:null});ctx.checkBuildingCollision=createBuildingCollisionQuery(ctx);
 const result=travelTo();assert.ok(result);assert.notDeepEqual([ctx.Walk.state.walker.x,ctx.Walk.state.walker.z],[80,90]);assert.equal(ctx.Walk.state.walker.y,1.7);
});
test('map ground admission cannot use an emergency fallback inside a completely blocked district',t=>{
 setup(t);const before=ground(),building={minX:-2000,maxX:2000,minZ:-2000,maxZ:2000,baseY:0,height:30};ctx.buildings=[building];ctx.checkBuildingCollision=createBuildingCollisionQuery(ctx);initWorldSpawning({buildingContainingPoint:()=>building});assert.equal(travelTo(),null);assert.deepEqual(ground(),before);
});
test('map requests cannot move contained interiors, dedicated environments or a loading world',t=>{
 setup(t);const before=ground();for(const patch of [{activeShipInterior:true},{spaceFlight:{active:true}},{oceanMode:{active:true}},{activeInterior:{floorPlan:{authored:true}}},{worldLoading:true}]){
  Object.assign(ctx,{activeShipInterior:false,spaceFlight:{active:false},oceanMode:{active:false},activeInterior:null,worldLoading:false},patch);assert.equal(travelTo(),null);assert.deepEqual(ground(),before);
 }
});
test('map requests cannot move a vessel deck passenger or a swimmer',t=>{
 setup(t);water();ctx.boatMode.active=true;ctx.boatDeck.active=true;let before=ground();assert.equal(travelTo(),null);assert.deepEqual(ground(),before);ctx.boatDeck.active=false;ctx.boatSwimming.active=true;assert.equal(travelTo(),null);assert.deepEqual(ground(),before);
});
test('map target inspection cannot cross a world replacement boundary',t=>{
 setup(t);const before=ground();ctx.inspectBoatCandidate=()=>{ctx._worldLoadSequence++;return null;};assert.equal(travelTo(),null);assert.deepEqual(ground(),before);
});
test('map callers cannot force a vessel exit or fabricate geographic water',t=>{
 setup(t);const before=ground();ctx.boatMode.active=true;assert.equal(travelTo(800,900,{force:true,allowSyntheticWater:true}),null);assert.deepEqual(ground(),before);
});
test('map arrival retains bridge support and accepted road heading',t=>{
 setup(t);const road={sourceFeatureId:'map:bridge',width:12,pts:[{x:-100,z:0},{x:100,z:0}],structureSemantics:{terrainMode:'elevated',structureKind:'bridge'}};ctx.roads=[road];ctx.SurfaceQuery.walkAt=ctx.SurfaceQuery.driveAt=()=>({position:{y:22},feature:road});initWorldSpawning({findNearestRoad:(x,z)=>({road,dist:0,y:22,pt:{x,z},segIndex:0}),isVehicleRoad:()=>true,sampleFeatureSurfaceY:()=>22});
 const result=travelTo(10,0);assert.ok(result);assert.equal(ctx.Walk.state.walker.y,23.7);assert.equal(ctx.car.road,road);assert.equal(result.angle,ctx.Walk.state.walker.angle);
});
test('malformed map coordinates cannot mutate any actor',t=>{
 setup(t);const before=ground();for(const [x,z]of [[NaN,0],[0,Infinity],[null,0],['80',90]]){assert.equal(travelTo(x,z),null);assert.deepEqual(ground(),before);}
});
test('map walking arrival above mapped water retains a bridge rather than entering a vessel',t=>{
 setup(t);water();const road={sourceFeatureId:'bridge-over-water',width:12,pts:[{x:-100,z:0},{x:100,z:0}],structureSemantics:{terrainMode:'elevated',structureKind:'bridge'}};ctx.SurfaceQuery.walkAt=()=>({position:{y:22},feature:road});initWorldSpawning({findNearestRoad:(x,z)=>({road,dist:0,y:22,pt:{x,z},segIndex:0}),isVehicleRoad:()=>true,sampleFeatureSurfaceY:()=>22});
 const result=travelTo(10,0);assert.equal(result?.mode,'walk');assert.equal(ctx.Walk.state.walker.y,23.7);assert.equal(ctx.boatMode.active,false);
});
test('map ocean fallback requires the existing qualified surface domain',t=>{
 setup(t);const before=ground();assert.equal(travelTo(80,90,{allowSyntheticWater:true})?.mode,'walk');assert.equal(ctx.boatMode.active,false);
 ctx.worldLoadRuntimeState={surfaceDomain:{kind:'ocean',subtype:'open_ocean'}};ctx.prepareBoatMode=options=>{assert.equal(options.candidate.synthetic,true);return {};};ctx.startBoatMode=()=>{ctx.boatMode.active=true;return true;};assert.equal(travelTo()?.mode,'boat');
});
test('map destination exits an ordinary mapped interior through its owner',t=>{
 const calls=setup(t);ctx.activeInterior={outsideState:{x:-40,y:1.7,z:60}};ctx.clearActiveInterior=()=>{calls.push('exit');ctx.activeInterior=null;};assert.equal(travelTo()?.mode,'walk');assert.equal(ctx.activeInterior,null);assert.deepEqual(calls,['exit']);assert.equal(ctx.Walk.state.walker.x,80);
});
test('mapped water admission does not mistake an estimated lake bed for an elevated land surface',t=>{
 setup(t);water();ctx.SurfaceQuery.walkAt=()=>({kind:'terrain',position:{y:-25}});ctx.prepareBoatMode=()=>({});ctx.startBoatMode=()=>{ctx.boatMode.active=true;return true;};assert.equal(travelTo()?.mode,'boat');
});
