import test from 'node:test';
import {resolveBoatEntryReference} from '../app/js/boat-mode/entry-reference.js';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import * as travel from '../app/js/travel-mode.js';
import {resumeEarthWorldSession,captureEarthWorldSession} from '../app/js/earth-session.js';
import {commitEnvironment} from '../app/js/session-coordinator.js?v=2';
import {initWorldSpawning,resolveSafeWorldSpawn,applyResolvedWorldSpawn} from '../app/js/world/spawn.js';
import {createWalkingRuntimeHelpers} from '../app/js/walking/runtime.js';
import {resolveTransportActor} from '../app/js/transport/actor-contract.js?v=6';
import {enterBoatAtWorldPoint,inspectBoatCandidate,prepareBoatMode} from '../app/js/boat-mode.js';
import {normalizeWaterBody} from '../app/js/world/water-body-contract.js?v=4';
import {createBuildingCollisionQuery} from '../app/js/physics/building-collision.js';

function setup(t) {
  const saved=Object.getOwnPropertyDescriptors(ctx),deps={...initWorldSpawning()};
  const globals=Object.fromEntries(['document','window','requestAnimationFrame'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  globalThis.document={getElementById:()=>null,querySelectorAll:()=>[]};globalThis.window={location:{search:''}};
  globalThis.requestAnimationFrame=fn=>queueMicrotask(fn);commitEnvironment('EARTH');
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
  if(travel.restoreEarthTravelSession)ctx.restoreEarthTravelSession=travel.restoreEarthTravelSession;
  t.after(()=>{initWorldSpawning(deps);for(const k of Object.keys(ctx))if(Object.getOwnPropertyDescriptor(ctx,k).configurable)delete ctx[k];for(const [k,d]of Object.entries(saved))if(d.configurable)Object.defineProperty(ctx,k,d);for(const [k,d]of Object.entries(globals))d?Object.defineProperty(globalThis,k,d):delete globalThis[k];});
  const publication={sequence:41,requestId:'earth-command-test'};
  Object.assign(ctx,{_worldLoadSequence:41,initialEarthWorldReady:true,worldPublication:publication,
    worldLoadRuntimeState:{sequence:41,publication,status:'ready',geometryReady:true,gameplayRuntimesReady:true,session:{state:'published',requestId:publication.requestId}},
    isLoadedLocationSelectionCurrent:()=>true,restoreLoadedLocationSelection:()=> 'baltimore',normalizeLocationSelection:()=> 'baltimore',
    setPlanetaryVehicle:async()=>{},setPlanetaryCharacter:async()=>{},showLoad(){},hideLoad(){calls.push('hide');},
    prepareFirstWorldRender(){calls.push('render');},markLocationSelectionLoaded(){calls.push('stamp');}});
  return calls;
}
function water(depth=10) {
  ctx.waterAreas=[normalizeWaterBody({shape:'area',type:'water',water:'lake',pts:[{x:-300,z:-300},{x:300,z:-300},{x:300,z:300},{x:-300,z:300}],area:360000,surfaceY:0,depthEvidence:{truthType:'measured',depthMeters:depth,sourceId:'controlled-test'}})];
}

const ground=()=>({car:{...ctx.car},walker:{...ctx.Walk.state.walker}});
const resume=pose=>{ctx.earthSessionState={pose};return resumeEarthWorldSession({transitionDurationMs:0});};
test('failed Earth aircraft preparation cannot prewrite ground actors or stamp success',async t=>{
 const calls=setup(t),before=ground();ctx.preparePlaneMode=()=>false;
 await assert.rejects(resume({mode:'plane',x:80,z:90,angle:.6,planeY:100}),/travel.*restor|restor.*travel/i);assert.deepEqual(ground(),before);assert.equal(calls.includes('stamp'),false);assert.equal(ctx.earthResumeDiagnostics.phase,'failed');assert.equal(ctx.earthResumePending,false);
});
test('Earth aircraft restoration prepares before retirement and preserves saved flight identity',async t=>{
 const calls=setup(t),before=ground();ctx.preparePlaneMode=options=>{assert.deepEqual(ground(),before);assert.equal(options.allowDuringEarthResume,true);assert.equal(options.transportCatalogId,'personal-prop');calls.push('prepare');return {};};ctx.startPlaneMode=options=>{Object.assign(ctx.planeMode,options,{active:true});return true;};
 assert.equal((await resume({mode:'plane',x:80,z:90,angle:.6,planeY:100,planePitch:.1,planeRoll:.2,planeSpeed:40,planeThrottle:.7,planeAirborne:true,planeCatalogId:'personal-prop',planeEntityId:'saved-flight'})).resumed,true);assert.equal(ctx.planeMode.x,80);assert.equal(ctx.planeMode.y,100);assert.equal(ctx.planeMode.speed,40);assert.equal(ctx.planeMode.throttle,.7);assert.equal(ctx.planeMode.transportEntityId,'saved-flight');assert.ok(calls.indexOf('prepare')<calls.indexOf('clear'));
});
test('refused Earth vessel restoration cannot publish a ground pose or claim success',async t=>{
 const calls=setup(t),before=ground();water(.1);ctx.prepareBoatMode=()=>false;
 await assert.rejects(resume({mode:'boat',x:80,z:90,angle:.6}),/travel.*restor|restor.*travel/i);assert.deepEqual(ground(),before);assert.equal(calls.includes('stamp'),false);
});
test('Earth vessel restoration stages the saved hull and entity through maritime admission',async t=>{
 setup(t);water();const before=ground();ctx.prepareBoatMode=options=>{assert.deepEqual(ground(),before);assert.ok(options.candidate);assert.equal(options.transportCatalogId,'ocean-research-vessel');assert.equal(options.transportEntityId,'saved-ship');return {};};ctx.startBoatMode=options=>{ctx.boatMode.active=true;Object.assign(ctx.boat,{x:options.spawnX,y:0,z:options.spawnZ,angle:options.yaw});return true;};
 assert.equal((await resume({mode:'boat',x:80,z:90,angle:.6,boatCatalogId:'ocean-research-vessel',boatEntityId:'saved-ship',boatCondition:.8})).resumed,true);assert.equal(ctx.boat.x,80);assert.equal(ctx.boat.angle,.6);
});
test('Earth resume rejects a world replaced during ground resolution before any pose publication',async t=>{
 const calls=setup(t),before=ground();ctx.resolveSafeWorldSpawn=()=>{ctx._worldLoadSequence++;return {valid:true,x:80,z:90,walkY:1.7,carY:1.2,angle:.6};};
 assert.deepEqual(await resume({mode:'walk',x:80,z:90,angle:.6}),{aborted:true,resumed:false});assert.deepEqual(ground(),before);assert.equal(calls.includes('stamp'),false);assert.equal(calls.includes('hide'),false);
});
test('Earth resume cannot force an offshore exit or move parked actors inside a dedicated frame',async t=>{
 setup(t);ctx.boatMode.active=true;const before=ground();await assert.rejects(resume({mode:'walk',x:80,z:90}),/travel.*restor|restor.*travel/i);assert.deepEqual(ground(),before);assert.equal(ctx.boatMode.active,true);
 ctx.boatMode.active=false;ctx.activeShipInterior=true;await assert.rejects(resume({mode:'drive',x:80,z:90}),/travel.*restor|restor.*travel/i);assert.deepEqual(ground(),before);
});
test('Earth session capture retains ground height and the accepted road identity',t=>{
 setup(t);ctx.Walk.state.walker.y=23.7;ctx.car.road={sourceFeatureId:'saved:bridge'};captureEarthWorldSession();assert.equal(ctx.earthSessionState.pose.y,23.7);assert.equal(ctx.earthSessionState.pose.roadId,'saved:bridge');
});
test('Earth vessel capture reads helm heading and identity instead of a parked car',t=>{
 setup(t);ctx.boatMode={active:true,transportCatalogId:'ocean-research-vessel',transportEntityId:'saved-ship',condition:.8};ctx.boat={x:80,y:0,z:90,angle:1.1};captureEarthWorldSession();const p=ctx.earthSessionState.pose;assert.equal(p.angle,1.1);assert.equal(p.boatCatalogId,'ocean-research-vessel');assert.equal(p.boatEntityId,'saved-ship');assert.equal(p.boatCondition,.8);
});
test('Earth walking return preserves a verified rooftop saved pose',async t=>{
 setup(t);const roof={minX:60,maxX:100,minZ:70,maxZ:110,baseY:0,height:30};ctx.buildings=[roof];initWorldSpawning({buildingContainingPoint:(x,z)=>x>60&&x<100&&z>70&&z<110?roof:null});
 assert.equal((await resume({mode:'walk',x:80,y:31.7,z:90,angle:.6})).resumed,true);assert.equal(ctx.Walk.state.walker.y,31.7);assert.equal(ctx.Walk.state.walker.x,80);
});
test('failed Earth drone preparation cannot prewrite ground actors or claim a successful resume',async t=>{
 const calls=setup(t),before=ground();ctx.SurfaceQuery.walkAt=()=>{throw Error('missing surface');};await assert.rejects(resume({mode:'drone',x:80,z:90,droneY:100}),/travel.*restor|restor.*travel/i);assert.deepEqual(ground(),before);assert.equal(calls.includes('stamp'),false);
});
test('invalid saved Earth coordinates are refused without poisoning or moving actors',async t=>{
 setup(t);const before=ground();await assert.rejects(resume({mode:'walk',x:NaN,z:90}),/travel.*restor|restor.*travel/i);assert.deepEqual(ground(),before);
});
test('Earth return from a drone publishes bridge pose after ground-controller retirement',async t=>{
 setup(t);ctx.droneMode=true;ctx.Walk.state.mode='drive';ctx.drone={x:300,y:100,z:300,yaw:0,pitch:-.2};const road={sourceFeatureId:'saved:bridge',width:12,pts:[{x:-100,z:0},{x:100,z:0}],structureSemantics:{terrainMode:'elevated',structureKind:'bridge'}};ctx.roads=[road];ctx.SurfaceQuery.walkAt=ctx.SurfaceQuery.driveAt=()=>({position:{y:22}});initWorldSpawning({findNearestRoad:(x,z)=>({road,dist:0,y:22,pt:{x,z},segIndex:0}),isVehicleRoad:()=>true,sampleFeatureSurfaceY:()=>22});
 assert.equal((await resume({mode:'walk',x:10,y:23.7,z:0,angle:.6,roadId:'saved:bridge'})).resumed,true);assert.equal(ctx.droneMode,false);assert.equal(ctx.Walk.state.walker.x,10);assert.equal(ctx.Walk.state.walker.y,23.7);assert.equal(ctx.car.road,road);assert.equal(ctx.Walk.state.characterMesh.position.y,22);
});
test('Earth travel restoration is unavailable outside a pending Earth session',t=>{
 setup(t);assert.equal(typeof travel.restoreEarthTravelSession,'function');ctx.earthResumePending=false;const before=ground();assert.equal(travel.restoreEarthTravelSession({mode:'walk',x:80,z:90}),false);assert.deepEqual(ground(),before);ctx.earthResumePending=true;ctx.getEnv=()=> 'OCEAN';assert.equal(travel.restoreEarthTravelSession({mode:'walk',x:80,z:90}),false);assert.deepEqual(ground(),before);
});
test('legacy Earth ground sessions without a saved height keep safe-arrival compatibility',async t=>{
 setup(t);assert.equal((await resume({mode:'walk',x:80,z:90,angle:.6})).resumed,true);assert.equal(ctx.Walk.state.walker.x,80);assert.equal(ctx.Walk.state.walker.y,1.7);
});
test('Earth ocean resume retains qualified bounded water while ordinary land cannot fabricate it',async t=>{
 setup(t);await assert.rejects(resume({mode:'boat',x:80,z:90}),/travel.*restor|restor.*travel/i);ctx.worldLoadRuntimeState.surfaceDomain={kind:'ocean',subtype:'open_ocean'};ctx.prepareBoatMode=options=>{assert.equal(options.candidate.synthetic,true);return {};};ctx.startBoatMode=()=>{ctx.boatMode.active=true;return true;};assert.equal((await resume({mode:'boat',x:80,z:90})).resumed,true);
});
test('a saved-vessel arrival reference requires the current published Earth session and keeps ordinary airborne boarding refused',t=>{
 setup(t);ctx.earthResumePending=true;const session={isCurrent:()=>true},origin=ctx.LOC,options={spawnX:80,spawnZ:90,yaw:.6,candidate:{surfaceY:0},earthSessionArrival:{session,publication:ctx.worldPublication,...origin}};
 assert.equal(resolveBoatEntryReference(null,{},origin,ctx),null);assert.deepEqual(resolveBoatEntryReference(null,options,origin,ctx),{x:80,y:0,z:90,angle:.6,mode:'walk',structureTerrainMode:'at_grade'});
 for(const patch of [{publication:{}},{session:{isCurrent:()=>false}},{lat:0}])assert.equal(resolveBoatEntryReference(null,{...options,earthSessionArrival:{...options.earthSessionArrival,...patch}},origin,ctx),null);
 ctx.earthResumePending=false;assert.equal(resolveBoatEntryReference(null,options,origin,ctx),null);ctx.earthResumePending=true;ctx.worldPublication={};assert.equal(resolveBoatEntryReference(null,options,origin,ctx),null);
});
test('Earth saved-vessel reference still runs actual depth and obstacle admission before retiring an airborne controller',async t=>{
 const calls=setup(t);ctx.prepareBoatMode=prepareBoatMode;ctx.droneMode=true;ctx.Walk.state.mode='drive';ctx.drone={x:0,y:100,z:0,yaw:0,pitch:-.2};const before=ground(),drone={...ctx.drone};water(.1);
 await assert.rejects(resume({mode:'boat',x:80,z:90,boatCatalogId:'marina-runabout'}),/travel.*restor/i);assert.deepEqual(ground(),before);assert.deepEqual(ctx.drone,drone);assert.equal(ctx.droneMode,true);
 water();ctx.checkBuildingCollision=()=>({collision:true});await assert.rejects(resume({mode:'boat',x:80,z:90,boatCatalogId:'marina-runabout'}),/travel.*restor/i);assert.deepEqual(ground(),before);assert.equal(calls.includes('stamp'),false);
});
