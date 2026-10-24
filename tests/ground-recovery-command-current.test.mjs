import test from 'node:test';
import {reprojectActorOutsideLandmarks} from '../app/js/world/landmark-detail.js';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import * as travel from '../app/js/travel-mode.js';
import {bindSurfaceRecoveryControls} from '../app/js/ui/recovery-controls.js';
import {initWorldSpawning,resolveSafeWorldSpawn,applyResolvedWorldSpawn,resolveRoadSpawn,spawnOnRoad} from '../app/js/world/spawn.js';
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
    activeTransportActor:()=>resolveTransportActor(ctx),resolveSafeWorldSpawn,applyResolvedWorldSpawn,resolveRoadSpawn,
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
  t.after(()=>{initWorldSpawning(deps);for(const k of Object.keys(ctx))if(Object.getOwnPropertyDescriptor(ctx,k).configurable)delete ctx[k];for(const [k,d]of Object.entries(saved))if(d.configurable)Object.defineProperty(ctx,k,d);for(const [k,d]of Object.entries(globals))d?Object.defineProperty(globalThis,k,d):delete globalThis[k];});
  return calls;
}
const recover=options=>{assert.equal(typeof travel.recoverSurfaceTravel,'function');return travel.recoverSurfaceTravel(options);};
const ground=()=>({car:{...ctx.car},walker:{...ctx.Walk.state.walker}});
const accepted={valid:true,x:80,z:90,angle:.7,carY:23.2,walkY:23.7,road:{sourceFeatureId:'accepted:bridge'},onRoad:true};
test('recovery stages a safe arrival before retiring flight and publishes after its departure writes',t=>{
 const calls=setup(t);ctx.planeMode={active:true,x:500,y:100,z:500,yaw:.4,pitch:0};const before=ground();ctx.resolveRoadSpawn=options=>{assert.deepEqual(ground(),before);assert.equal(options.mode,'walk');assert.equal(options.requireSafeCandidate,true);calls.push('resolve');return accepted;};ctx.stopPlaneMode=()=>{calls.push('retire');ctx.planeMode.active=false;ctx.car.x=-999;return {};};
 assert.equal(recover(),true);assert.equal(ctx.Walk.state.mode,'walk');assert.equal(ctx.car.x,80);assert.equal(ctx.car.y,23.2);assert.equal(ctx.Walk.state.walker.y,23.7);assert.equal(ctx.car.road,accepted.road);assert.equal(ctx.carMesh.position.y,23.2);assert.ok(calls.indexOf('resolve')<calls.indexOf('retire'));
});
test('refused, malformed or thrown recovery preparation preserves controller and input',t=>{
 const calls=setup(t);ctx.droneMode=true;ctx.Walk.state.mode='drive';const before=ground(),drone={...ctx.drone};for(const resolve of [()=>null,()=>({...accepted,walkY:NaN}),()=>({valid:false}),()=>{throw Error('unavailable');}]){ctx.resolveRoadSpawn=resolve;assert.equal(recover(),false);assert.deepEqual(ground(),before);assert.equal(ctx.droneMode,true);assert.deepEqual(ctx.drone,drone);}assert.deepEqual(calls,[]);
});
test('world replacement during road recovery cannot publish or release controls',t=>{
 const calls=setup(t),before=ground();ctx.resolveRoadSpawn=()=>{ctx._worldLoadSequence++;return accepted;};assert.equal(recover(),false);assert.deepEqual(ground(),before);assert.deepEqual(calls,[]);
});
test('recovery cannot force a vessel exit or release an interior before admission',t=>{
 const calls=setup(t),before=ground();ctx.boatMode.active=true;ctx.resolveRoadSpawn=()=>assert.fail('blocked exit must precede staging');assert.equal(recover({force:true}),false);assert.deepEqual(ground(),before);assert.deepEqual(calls,[]);ctx.boatMode.active=false;const room={outsideState:{x:-40,y:1.7,z:60}};ctx.activeInterior=room;ctx.clearActiveInterior=()=>assert.fail('refused recovery must preserve interior');ctx.resolveRoadSpawn=()=>({valid:false});assert.equal(recover(),false);assert.equal(ctx.activeInterior,room);
});
test('recovery preserves walking or driving ownership and publishes accepted contact and heading',t=>{
 setup(t);for(const mode of ['walk','drive']){ctx.Walk.state.mode=mode;ctx.resolveRoadSpawn=options=>{assert.equal(options.mode,mode);assert.equal(options.random,true);return accepted;};assert.equal(recover({random:true}),true);assert.equal(ctx.Walk.state.mode,mode);assert.equal(ctx.car.road,accepted.road);assert.equal(ctx.car.angle,.7);assert.equal(ctx.Walk.state.walker.angle,.7);}
});
test('dedicated worlds and contained interiors cannot validate a geographic road recovery',t=>{
 setup(t);const before=ground();ctx.resolveRoadSpawn=()=>assert.fail('isolated world');for(const patch of [{oceanMode:{active:true}},{spaceFlight:{active:true}},{activeShipInterior:true},{activePlanetaryBodyId:'moon'},{activeInterior:{floorPlan:{authored:true}}},{worldLoading:true}]){Object.assign(ctx,{oceanMode:{active:false},spaceFlight:{active:false},activeShipInterior:false,activePlanetaryBodyId:null,activeInterior:null,worldLoading:false},patch);assert.equal(recover(),false);assert.deepEqual(ground(),before);}
});
test('ordinary mapped interior recovery stages before normal owner cleanup',t=>{
 const calls=setup(t);ctx.activeInterior={outsideState:{x:-40,y:1.7,z:60}};ctx.resolveRoadSpawn=()=>{calls.push('resolve');return accepted;};ctx.clearActiveInterior=()=>{calls.push('exit');ctx.activeInterior=null;};assert.equal(recover(),true);assert.deepEqual(calls,['resolve','exit']);assert.equal(ctx.Walk.state.walker.x,80);
});
test('road spawn resolution is side-effect free and the publication wrapper remains compatible',t=>{
 setup(t);const before=ground();assert.equal(resolveRoadSpawn({mode:'walk',requireSafeCandidate:true}).valid,true);assert.deepEqual(ground(),before);const result=spawnOnRoad();assert.equal(result.valid,true);assert.equal(ctx.car.x,result.x);assert.equal(ctx.Walk.state.walker.x,result.x);
});
test('recovery refuses the emergency fallback when every real spawn candidate is blocked',t=>{
 setup(t);const before=ground(),building={minX:-2000,maxX:2000,minZ:-2000,maxZ:2000,baseY:0,height:30};ctx.buildings=[building];ctx.checkBuildingCollision=createBuildingCollisionQuery(ctx);initWorldSpawning({buildingContainingPoint:()=>building});assert.equal(recover(),false);assert.deepEqual(ground(),before);
});
test('both recovery UI controls send intent and close their menu without writing actors',t=>{
 setup(t);const callbacks={},requests=[];globalThis.document={getElementById:id=>({addEventListener:(event,fn)=>callbacks[id]=fn})};let closes=0;bindSurfaceRecoveryControls({recoverSurfaceTravel:o=>requests.push(o)},()=>closes++);callbacks.fRespawn();callbacks.fRespawnRand();assert.deepEqual(requests,[{random:false,source:'safe_ground_recovery'},{random:true,source:'random_ground_recovery'}]);assert.equal(closes,2);
});
test('landmark clearance reports an applied safe arrival and cannot move an airborne or refused actor',t=>{
 setup(t);const bounds={minX:-10,maxX:10,minZ:-10,maxZ:10,baseY:0,height:30};ctx.buildings=[bounds];Object.assign(ctx.Walk.state.walker,{x:0,y:1.7,z:0});ctx.checkBuildingCollision=createBuildingCollisionQuery(ctx);initWorldSpawning({buildingContainingPoint:(x,z)=>x>=-10&&x<=10&&z>=-10&&z<=10?bounds:null});const meshes=[{userData:{footprint:[{x:-10,z:-10},{x:10,z:-10},{x:10,z:10},{x:-10,z:10}]}}];assert.equal(reprojectActorOutsideLandmarks(meshes),true);assert.ok(Math.abs(ctx.Walk.state.walker.x)>10||Math.abs(ctx.Walk.state.walker.z)>10);
 ctx.planeMode.active=true;const before=ground();assert.equal(reprojectActorOutsideLandmarks(meshes),false);assert.deepEqual(ground(),before);ctx.planeMode.active=false;Object.assign(ctx.Walk.state.walker,{x:0,y:1.7,z:0});const blocked=ground();ctx.resolveSafeWorldSpawn=()=>({valid:false});assert.equal(reprojectActorOutsideLandmarks(meshes),false);assert.deepEqual(ground(),blocked);
});
test('malformed recovery coordinates are rejected before staging',t=>{
 setup(t);const before=ground();ctx.resolveRoadSpawn=()=>assert.fail('invalid destination');for(const options of [null,{x:NaN},{z:Infinity},{x:'80'},{x:null}]){assert.equal(recover(options),false);assert.deepEqual(ground(),before);}
});
