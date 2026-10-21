import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import * as travel from '../app/js/travel-mode.js';
import {createWalkingFrameCommands} from '../app/js/walking/frame-commands.js';
import {createPlanetarySurfaceAuthority,APOLLO11_SURFACE_REGION,OLYMPUS_MONS_SURFACE_REGION,CALORIS_PLANITIA_SURFACE_REGION} from '../app/js/planetary/runtime/surface-authority.js';
import {setActivePlanetaryObstacles,clearActivePlanetaryObstacles} from '../app/js/planetary/runtime/obstacle-authority.js?v=1';
import {commitEnvironment} from '../app/js/session-coordinator.js?v=2';
import {createWorldLoadRequest} from '../app/js/earth-core/world-load-request.js';
import {createWalkingGeometryHelpers} from '../app/js/walking/geometry.js';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parse} from '@babel/parser';
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
  commitEnvironment('EARTH');
  const calls=[],car={x:-40,y:1.2,z:60,angle:.1},scene=new THREE.Scene(),carMesh=new THREE.Object3D(),characterMesh=new THREE.Object3D();
  const state={mode:'walk',view:'third',walker:{x:-40,y:1.7,z:60,angle:.2,yaw:.2},characterMesh};
  Object.assign(ctx,{car,scene,carMesh,camera:new THREE.PerspectiveCamera(),camMode:0,
    boat:{x:10,y:0,z:20,angle:.1},boatMode:{active:false,transportCatalogId:'marina-runabout'},boatDeck:{active:false,release(){}},boatSwimming:{active:false,cancel(){}},
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
  Object.assign(ctx.Walk,createWalkingFrameCommands({context:ctx,state,car,carMesh,eyeHeight:1.7,pointInPolygon:createWalkingGeometryHelpers().pointInPolygonSafe}));
  t.after(()=>{clearActivePlanetaryObstacles();initWorldSpawning(deps);for(const k of Object.keys(ctx))if(Object.getOwnPropertyDescriptor(ctx,k).configurable)delete ctx[k];for(const [k,d]of Object.entries(saved))if(d.configurable)Object.defineProperty(ctx,k,d);for(const [k,d]of Object.entries(globals))d?Object.defineProperty(globalThis,k,d):delete globalThis[k];});
  return calls;
}
const ship=()=>({environmentKind:'expedition-ship',floorBaseY:0,ceilingY:3.6,usableFootprint:[{x:-30,z:-30},{x:30,z:-30},{x:30,z:30},{x:-30,z:30}]});
const bodies=()=>({car:{...ctx.car},walker:{...ctx.Walk.state.walker},drone:{...ctx.drone}});
async function accepted(body){const authority=createPlanetarySurfaceAuthority();await authority.prepare(body.regionId,async()=>({sampleHeight:()=>7,readyAssetIds:body.assets.map(a=>a.id)}));authority.activate(body.regionId);ctx.planetarySurfaceAuthority=authority;return authority;}
test('planetary arrivals sample the accepted body and publish both ground actors after drone retirement',async t=>{
 setup(t);await accepted(APOLLO11_SURFACE_REGION);ctx.onMoon=true;ctx.droneMode=true;ctx.Walk.state.mode='drive';ctx.resolveSafeWorldSpawn=()=>assert.fail('Earth query during planetary arrival');assert.equal(travel.initializePlanetaryArrival('moon',{x:200,z:-950,angle:.4}),true);assert.equal(ctx.droneMode,false);assert.equal(ctx.car.x,200);assert.equal(ctx.Walk.state.walker.x,200);assert.equal(ctx.car.y-1.2,ctx.Walk.state.walker.y-1.7);assert.equal(ctx.car.road,null);assert.equal(ctx.drone.y,ctx.car.y-1.2+10);
});
test('planetary arrivals reject missing/wrong-body surfaces, malformed targets and actual obstacles without retirement',async t=>{
 const calls=setup(t);ctx.onMoon=true;let before=bodies();assert.equal(travel.initializePlanetaryArrival('moon',{x:200,z:-950}),false);assert.deepEqual(bodies(),before);await accepted(OLYMPUS_MONS_SURFACE_REGION);assert.equal(travel.initializePlanetaryArrival('moon',{x:200,z:-950}),false);assert.deepEqual(bodies(),before);await accepted(APOLLO11_SURFACE_REGION);setActivePlanetaryObstacles('moon',[{id:'hull',x:200,z:-950,radius:10}]);assert.equal(travel.initializePlanetaryArrival('moon',{x:200,z:-950}),false);assert.deepEqual(bodies(),before);assert.equal(travel.initializePlanetaryArrival('moon',{x:NaN,z:0}),false);assert.deepEqual(calls,[]);
});
test('Mars and another accepted solid body retain frame-specific walk/drive and altitude rules',async t=>{
 setup(t);for(const [body,mode]of [[OLYMPUS_MONS_SURFACE_REGION,'drive'],[CALORIS_PLANITIA_SURFACE_REGION,'walk']]){await accepted(body);ctx.onMars=body.bodyId==='mars';ctx.onMoon=false;ctx.activePlanetaryBodyId=body.bodyId;assert.equal(travel.initializePlanetaryArrival(body.bodyId,{x:body.renderPlacement.x,z:body.renderPlacement.z},{mode}),true);assert.equal(ctx.Walk.state.mode,mode);assert.equal(ctx.car.y-1.2,ctx.Walk.state.walker.y-1.7);}
});
test('world actor reset accepts only the active immutable load request in the loading Earth frame',t=>{
 setup(t);const request=createWorldLoadRequest({key:'custom',lat:39,lon:-76},2),before=bodies();assert.equal(travel.initializeWorldLoadActors(request),false);assert.deepEqual(bodies(),before);ctx.worldLoading=true;ctx._worldLoadSequence=2;assert.equal(travel.initializeWorldLoadActors(request),true);assert.equal(ctx.car.x,0);assert.equal(ctx.Walk.state.walker.z,0);Object.assign(ctx.car,{x:90,z:90});ctx._worldLoadSequence=3;assert.equal(travel.initializeWorldLoadActors(request),false);assert.equal(ctx.car.x,90);
});
test('ship walking entry enforces its authored frame and restores controller state through the walking owner',t=>{
 setup(t);const saved=ctx.Walk.captureFrameState(),before=bodies();assert.equal(ctx.Walk.enterShipFrame(ship(),{x:0,y:1.74,z:21.8}),false);assert.deepEqual(bodies(),before);const interior=ship();ctx.activeInterior=interior;ctx.activeShipInterior=true;assert.equal(ctx.Walk.enterShipFrame(interior,{x:0,y:1.74,z:21.8}),true);assert.equal(ctx.Walk.state.view,'first');assert.equal(ctx.Walk.state.characterMesh.visible,false);assert.equal(ctx.Walk.restoreFrameState(saved),false);ctx.activeShipInterior=false;ctx.activeInterior=null;assert.equal(ctx.Walk.restoreFrameState(saved),true);assert.equal(ctx.Walk.state.walker.x,before.walker.x);assert.equal(ctx.Walk.state.view,saved.view);
});
test('refused ship spawn preserves the prior controller and replacement invalidates its return snapshot',t=>{
 setup(t);const saved=ctx.Walk.captureFrameState(),before=bodies(),interior=ship();ctx.activeInterior=interior;ctx.activeShipInterior=true;ctx.checkBuildingCollision=()=>({collision:true});assert.equal(ctx.Walk.enterShipFrame(interior,{x:0,y:1.74,z:21.8}),false);assert.deepEqual(bodies(),before);ctx.activeInterior=null;ctx.activeShipInterior=false;ctx._worldLoadSequence++;ctx.car.x=444;assert.equal(ctx.Walk.restoreFrameState(saved),false);assert.equal(ctx.car.x,444);
});
test('ship return cannot cross an environment departure and return or a replacement walking controller',t=>{
 setup(t);const saved=ctx.Walk.captureFrameState();commitEnvironment('OCEAN');commitEnvironment('EARTH');assert.equal(ctx.Walk.restoreFrameState(saved),false);const foreign={...ctx.Walk.captureFrameState(),state:{}};assert.equal(ctx.Walk.restoreFrameState(foreign),false);
});
test('late ship scene disposal retires only its own resources, preserving replacement colliders and presentation',async()=>{
 const source=await readFile(new URL('../app/js/expedition/ship-interior.js',import.meta.url),'utf8');const ast=parse(source,{sourceType:'module'});const node=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='exitSolisReachInterior');const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();root.add(new THREE.Mesh(geometry,material));let releases=0;geometry.addEventListener('dispose',()=>releases++);const replacement={key:'new'},colliders=[{id:'new'}],background={id:'new'},context={activeInterior:replacement,activeShipInterior:false,dynamicBuildingColliders:colliders,camera:{},renderer:{},scene:{background},replaceWorldCollection:()=>assert.fail('old collider write'),Walk:{restoreFrameState:()=>assert.fail('old pose write')}};
 const session={interior:{key:'old'},frameLease:{isCurrent:()=>false},sceneState:{root,crewMeshes:[]},dynamicBuildingColliders:[],earthLightVisibility:{},bodyHadShipInteriorClass:true};const document={getElementById:()=>null};vm.runInNewContext('let activeSession=session;'+source.slice(node.start,node.end)+';exitSolisReachInterior();',{appCtx:context,session,document,globalThis:{}});assert.equal(releases,1);assert.equal(context.activeInterior,replacement);assert.equal(context.dynamicBuildingColliders,colliders);assert.equal(context.scene.background,background);
});
