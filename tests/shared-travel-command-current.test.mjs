import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import * as travel from '../app/js/travel-mode.js';
import {initShareUi} from '../app/js/ui/share-links.js';
import {initWorldSpawning,resolveSafeWorldSpawn,applyResolvedWorldSpawn} from '../app/js/world/spawn.js';
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
    _worldLoadSequence:1,roads:[],buildings:[],waterAreas:[],waterways:[],terrainEnabled:true,LOC:{lat:39,lon:-76},METERS_PER_WORLD_UNIT:1,
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
  const ui=initShareUi({bindTouchFriendlyPress(){},closeAllFloatMenus(){},getTitleLaunchMode:()=> 'earth'});
  t.after(()=>{initWorldSpawning(deps);for(const k of Object.keys(ctx))if(Object.getOwnPropertyDescriptor(ctx,k).configurable)delete ctx[k];for(const [k,d]of Object.entries(saved))if(d.configurable)Object.defineProperty(ctx,k,d);for(const [k,d]of Object.entries(globals))d?Object.defineProperty(globalThis,k,d):delete globalThis[k];});
  return {calls,apply:pending=>{ctx.pendingExperienceState=pending;ui.applySharedRuntimeState();}};
}
function restore(mode,pose,options) {
  assert.equal(typeof travel.restoreSurfaceTravelPose,'function');return travel.restoreSurfaceTravelPose(mode,pose,options);
}
const shared=(travelMode,extra={})=>({travelMode,refX:80,refY:1.7,refZ:90,yaw:.6,...extra});
function water(depth=10) {
  ctx.waterAreas=[normalizeWaterBody({shape:'area',type:'water',water:'lake',pts:[{x:-300,z:-300},{x:300,z:-300},{x:300,z:300},{x:-300,z:300}],area:360000,surfaceY:0,depthEvidence:{truthType:'measured',depthMeters:depth,sourceId:'controlled-test'}})];
}

test('shared ground restoration cannot bypass an offshore vessel exit or change its camera',t=>{
  const {apply,calls}=setup(t);ctx.boatMode.active=true;const before={car:{...ctx.car},walker:{...ctx.Walk.state.walker}};
  apply(shared('walking',{camMode:2}));assert.equal(ctx.boatMode.active,true);assert.deepEqual(ctx.car,before.car);assert.deepEqual(ctx.Walk.state.walker,before.walker);assert.equal(ctx.camMode,0);assert.deepEqual(calls,[]);
});
test('refused boat share does not prewrite the inactive vessel',t=>{
  const {apply}=setup(t),before={...ctx.boat};apply(shared('boat',{refY:100}));assert.deepEqual(ctx.boat,before);assert.equal(ctx.Walk.state.mode,'walk');
});
test('active vessel restoration samples its water rather than accepting a shared altitude',t=>{
  const {apply}=setup(t);water();ctx.boatMode.active=true;ctx.startBoatMode=()=>true;
  apply(shared('boat',{refY:100}));assert.equal(ctx.boat.x,80);assert.equal(ctx.boat.z,90);assert.ok(Math.abs(ctx.boat.y)<2);assert.equal(ctx.boat.angle,.6);
});
test('active vessel restoration retains draft and physical obstacle admission',t=>{
  const {apply}=setup(t);water(.1);ctx.boatMode.active=true;ctx.startBoatMode=()=>true;const before={...ctx.boat};
  apply(shared('boat'));assert.deepEqual(ctx.boat,before);
  water();ctx.checkBuildingCollision=()=>({collision:true});apply(shared('boat'));assert.deepEqual(ctx.boat,before);
});
test('walking share exits an interior through its owner before publishing exterior coordinates',t=>{
  const {apply,calls}=setup(t);ctx.activeInterior={outsideState:{x:-40,y:1.7,z:60}};
  ctx.clearActiveInterior=o=>{assert.equal(o.restorePlayer,true);calls.push('exit-interior');ctx.activeInterior=null;};
  apply(shared('walking'));assert.equal(ctx.activeInterior,null);assert.deepEqual([ctx.Walk.state.walker.x,ctx.Walk.state.walker.z],[80,90]);assert.deepEqual(calls,['exit-interior']);
});
test('a mode-only walking share preserves the occupied interior and its arrival',t=>{
  const {apply,calls}=setup(t);const room={outsideState:{x:5,y:1.7,z:6}};ctx.activeInterior=room;
  ctx.clearActiveInterior=()=>{calls.push('exit-interior');ctx.activeInterior=null;};
  apply({travelMode:'walking'});assert.equal(ctx.activeInterior,room);assert.deepEqual(calls,[]);assert.deepEqual([ctx.Walk.state.walker.x,ctx.Walk.state.walker.z],[-40,60]);
});
test('a contained interior cannot admit an exterior share using its isolated collision world',t=>{
  const {apply,calls}=setup(t),room={floorPlan:{authored:true},outsideState:{x:5,y:1.7,z:6}},before={...ctx.Walk.state.walker};ctx.activeInterior=room;
  ctx.clearActiveInterior=()=>{calls.push('exit-interior');ctx.activeInterior=null;};
  apply(shared('walking'));assert.equal(ctx.activeInterior,room);assert.deepEqual(ctx.Walk.state.walker,before);assert.deepEqual(calls,[]);
});
test('a replacement world during ground resolution cannot receive an old shared spawn',t=>{
  const {apply,calls}=setup(t),before={...ctx.car};ctx.resolveSafeWorldSpawn=()=>{ctx._worldLoadSequence++;return {valid:true,x:80,z:90,angle:0,carY:1.2,walkY:1.7};};
  apply(shared('driving'));assert.deepEqual(ctx.car,before);assert.equal(ctx.Walk.state.mode,'walk');assert.deepEqual(calls,[]);
});
test('aircraft preparation is checked against world replacement before releasing the walker',t=>{
  const {apply,calls}=setup(t);ctx.preparePlaneMode=()=>{ctx._worldLoadSequence++;return {};};ctx.startPlaneMode=()=>{ctx.planeMode.active=true;return true;};
  apply(shared('plane',{refY:80}));assert.equal(ctx.planeMode.active,false);assert.equal(ctx.Walk.state.mode,'walk');assert.deepEqual(calls,[]);
});
test('failed aircraft preparation leaves the original actor and camera intact',t=>{
  const {apply,calls}=setup(t);ctx.preparePlaneMode=()=>{throw Error('asset unavailable');};
  assert.doesNotThrow(()=>apply(shared('plane',{camMode:2})));assert.equal(ctx.Walk.state.mode,'walk');assert.equal(ctx.camMode,0);assert.deepEqual(calls,[]);
});
test('bridge shares preserve road identity, exact accepted height and both actor meshes',t=>{
  const {apply}=setup(t);const road={sourceFeatureId:'way:bridge',width:12,pts:[{x:-100,z:0},{x:100,z:0}],structureSemantics:{terrainMode:'elevated',structureKind:'bridge'}};ctx.roads=[road];
  ctx.SurfaceQuery.walkAt=ctx.SurfaceQuery.driveAt=()=>({position:{y:22}});
  initWorldSpawning({findNearestRoad:(x,z,o)=>{if(o.preferredRoad)assert.equal(o.preferredRoad,road);return {road,dist:0,y:22,pt:{x,z},segIndex:0};},isVehicleRoad:()=>true,sampleFeatureSurfaceY:()=>22});
  for(const [mode,y]of [['walking',23.7],['driving',23.2]]){
    apply(shared(mode,{refX:10,refZ:0,refY:y,refRoadId:'way:bridge'}));
    assert.equal(ctx.car.road,road);assert.equal(ctx.car.y,23.2);assert.equal(ctx.Walk.state.walker.y,23.7);
    assert.equal(ctx.carMesh.position.y,23.2);if(mode==='walking')assert.equal(ctx.Walk.state.characterMesh.position.y,22);
  }
});
test('shared walking uses doorway restoration clearance and still rejects an occupied wall',t=>{
  const {apply}=setup(t),box={minX:0,maxX:8,minZ:0,maxZ:8,baseY:0,height:8};
  ctx.checkBuildingCollision=createBuildingCollisionQuery({buildings:[box]});
  initWorldSpawning({buildingContainingPoint:(x,z)=>x>0&&x<8&&z>0&&z<8?box:null});
  apply(shared('walking',{refX:-.5,refZ:4}));assert.equal(ctx.Walk.state.walker.x,-.5);assert.equal(ctx.Walk.state.walker.z,4);
  apply(shared('walking',{refX:4,refZ:4}));assert.notDeepEqual([ctx.Walk.state.walker.x,ctx.Walk.state.walker.z],[4,4]);
});
test('mode-only, incomplete-position and camera-only links preserve the current arrival',t=>{
  const {apply}=setup(t);apply({travelMode:'walking',refX:999,yaw:.7});assert.deepEqual([ctx.Walk.state.walker.x,ctx.Walk.state.walker.z],[-40,60]);assert.equal(ctx.Walk.state.walker.yaw,.7);
  apply({camMode:2});assert.equal(ctx.camMode,2);assert.deepEqual([ctx.Walk.state.walker.x,ctx.Walk.state.walker.z],[-40,60]);
});
test('dedicated-world and unsupported share requests cannot move parked surface actors',t=>{
  const {apply}=setup(t),before={...ctx.car};ctx.spaceFlight.active=true;
  apply(shared('driving'));assert.deepEqual(ctx.car,before);
  apply(shared('rocket'));assert.deepEqual(ctx.car,before);
  ctx.spaceFlight.active=false;ctx.activeShipInterior=true;apply(shared('walking'));assert.deepEqual(ctx.car,before);
});
test('the restoration command rejects partial, malformed and unsupported requests before mutation',t=>{
  const {calls}=setup(t),before={...ctx.car};
  for(const p of [{x:1},{x:NaN,z:1},{x:1,z:1,y:Infinity},{yaw:null}])assert.equal(restore('drive',p),false);
  assert.equal(restore('rocket',{}),false);assert.deepEqual(ctx.car,before);assert.deepEqual(calls,[]);
});
test('world replacement during active vessel clearance cannot publish the old pose',t=>{
  const {apply}=setup(t);water();ctx.boatMode.active=true;ctx.startBoatMode=()=>true;const before={...ctx.boat};
  ctx.checkBuildingCollision=()=>{ctx._worldLoadSequence++;return {collision:false};};apply(shared('boat'));assert.deepEqual(ctx.boat,before);
});
test('failed vessel preparation preserves the walker instead of partially starting a boat',t=>{
  const {apply,calls}=setup(t);water();ctx.prepareBoatMode=()=>{throw Error('vessel asset unavailable');};
  assert.doesNotThrow(()=>apply(shared('boat')));assert.equal(ctx.Walk.state.mode,'walk');assert.equal(ctx.boatMode.active,false);assert.deepEqual(calls,[]);
});
test('an already active aircraft cannot report a refused pose restoration as applied',t=>{
  setup(t);ctx.planeMode.active=true;assert.equal(restore('plane',{x:80,y:40,z:90}),false);assert.equal(ctx.planeMode.active,true);
});
test('ground restoration from a drone publishes the requested target after retirement',t=>{
  const {apply}=setup(t);ctx.droneMode=true;ctx.Walk.state.mode='drive';Object.assign(ctx.drone,{x:-100,y:180,z:-200});
  apply(shared('walking'));assert.equal(ctx.droneMode,false);assert.deepEqual([ctx.Walk.state.walker.x,ctx.Walk.state.walker.y,ctx.Walk.state.walker.z],[80,1.7,90]);
});
test('deck and swimming occupancy cannot be moved by a geographic vessel share',t=>{
  const {apply}=setup(t);water();ctx.boatMode.active=true;const before={...ctx.boat};ctx.boatDeck.active=true;
  apply(shared('boat'));assert.deepEqual(ctx.boat,before);ctx.boatDeck.active=false;ctx.boatSwimming.active=true;
  apply(shared('boat'));assert.deepEqual(ctx.boat,before);
});
