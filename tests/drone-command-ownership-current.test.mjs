import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import * as travel from '../app/js/travel-mode.js';
import {resolveTransportActor} from '../app/js/transport/actor-contract.js?v=6';
import {resolveControlState} from '../app/js/transport/control-state.js';
import {updateDrone} from '../app/js/physics/drone-flight.js';
import {initShareUi} from '../app/js/ui/share-links.js';
import {startActivity, stopActivity, getRuntimeSnapshot} from '../app/js/activity-discovery/runtime.js?v=9';
import {resumeEarthWorldSession} from '../app/js/earth-session.js';
import {commitEnvironment} from '../app/js/session-coordinator.js?v=2';

function setup(t) {
  const saved = Object.getOwnPropertyDescriptors(ctx);
  const globals = Object.fromEntries(['document','window','requestAnimationFrame'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis,k)]));
  globalThis.document = {getElementById:()=>null, querySelectorAll:()=>[]};
  globalThis.window = {location:{search:'', href:'http://localhost/'}};
  globalThis.requestAnimationFrame = fn => queueMicrotask(fn);
  commitEnvironment('EARTH');
  const calls = [];
  Object.assign(ctx, {
    car:{x:1,y:1.2,z:2,angle:.1}, carMesh:{visible:false},
    drone:{x:9,y:20,z:8,yaw:0,pitch:-.3,roll:0,speed:12}, droneMode:false,
    boatMode:{active:false}, planeMode:{active:false}, oceanMode:{active:false}, spaceFlight:{active:false},
    activeShipInterior:false, activeInterior:null, worldLoading:false, gameStarted:true,
    onMoon:false, onMars:false, activePlanetaryBodyId:null, activeSolidWorldSurface:null,
    terrainEnabled:true, buildings:[], getNearbyBuildings:undefined,
    SurfaceQuery:{walkAt:()=>({position:{y:0}}),terrainAt:()=>({position:{y:0}})},
    terrainMeshHeightAt:()=>0,
    camera:new THREE.PerspectiveCamera(), setCameraMode(){},
    clearControlInputState:()=>calls.push('clear'),
    setTravelMode:travel.setTravelMode,
    activeTransportActor:()=>resolveTransportActor(ctx),
    Walk:{state:{mode:'walk',walker:{x:30,y:1.7,z:40,yaw:.4,angle:.4}, characterMesh:{visible:true}},
      getMapRefPosition:()=>ctx.car,
      setModeDrive(){calls.push('retire-walk');this.state.mode='drive';ctx.car.x=999;},
      setModeWalk(){this.state.mode='walk';}},
    stopBoatMode(){calls.push('retire-boat');ctx.boatMode.active=false;},
    canExitBoatMode:()=>false,
    stopPlaneMode(){calls.push('retire-plane');ctx.planeMode.active=false;return {x:50,y:90,z:60,yaw:.7,pitch:.1};},
    resolveSafeWorldSpawn:(x,z,o)=>({valid:true,x,z,angle:o.angle,carY:1.2,walkY:1.7}),
    applyResolvedWorldSpawn(){}, clearNavigation(){}, createNavigationRoute:undefined,
    registerGameplayPlugin:undefined, startGameplayPlugin:undefined, getGameplayRegistrySnapshot:undefined,
    updateCamera:undefined, updateControlsModeUI:undefined
  });
  if (travel.activateDroneAtWorldPose) ctx.activateDroneAtWorldPose = travel.activateDroneAtWorldPose;
  t.after(() => {
    stopActivity();
    for (const k of Object.keys(ctx)) if (Object.getOwnPropertyDescriptor(ctx,k).configurable) delete ctx[k];
    for (const [k,d] of Object.entries(saved)) if (d.configurable) Object.defineProperty(ctx,k,d);
    for (const [k,d] of Object.entries(globals)) d ? Object.defineProperty(globalThis,k,d) : delete globalThis[k];
  });
  return calls;
}

function activate(pose, options) {
  assert.equal(typeof travel.activateDroneAtWorldPose, 'function', 'travel owner must expose the drone command');
  return travel.activateDroneAtWorldPose(pose, options);
}
const pose = {x:120,y:80,z:140,yaw:.6,pitch:-.2,roll:.1};
const share = () => initShareUi({bindTouchFriendlyPress(){},closeAllFloatMenus(){},getTitleLaunchMode:()=> 'earth'});

test('explicit drone activation prepares at the requested position before retiring the walker', t => {
  const calls=setup(t);
  ctx.SurfaceQuery.walkAt=(x,z)=>{assert.deepEqual([x,z],[120,140]);calls.push('prepare');return {position:{y:0}};};
  assert.equal(activate(pose),true);
  assert.deepEqual(calls,['prepare','clear','retire-walk']);
  assert.deepEqual([ctx.drone.x,ctx.drone.y,ctx.drone.z,ctx.drone.yaw,ctx.drone.pitch,ctx.drone.roll],[120,80,140,.6,-.2,.1]);
  assert.equal(resolveControlState(ctx).camera,'drone');
  assert.equal(ctx.camera.rotation.order,'YXZ');
  assert.equal(ctx.carMesh.visible,false);
});

test('requested altitude keeps the existing roof clearance floor and higher saved flight', t => {
  setup(t);ctx.buildings=[{minX:119,maxX:121,minZ:139,maxZ:141,maxY:70}];
  assert.equal(activate({...pose,y:2}),true);assert.equal(ctx.drone.y,78);
  assert.equal(activate({...pose,y:110}),true);assert.equal(ctx.drone.y,110);
});

test('invalid explicit poses cannot mutate an already active drone or report success', t => {
  const calls=setup(t);ctx.droneMode=true;ctx.Walk.state.mode='drive';const before={...ctx.drone};
  for (const p of [null,{}, {...pose,x:NaN},{...pose,z:Infinity},{...pose,y:NaN},{...pose,yaw:null},{...pose,pitch:Infinity},{...pose,roll:'1'}]) {
    assert.equal(activate(p),false);assert.deepEqual(ctx.drone,before);
  }
  assert.deepEqual(calls,[]);
});

test('failed drone preparation preserves the current controller, camera and input', t => {
  const calls=setup(t), before={...ctx.drone}, camera=ctx.camera.rotation.toArray();
  ctx.SurfaceQuery.walkAt=()=>{throw Error('surface unavailable');};
  assert.equal(activate(pose),false);
  assert.equal(ctx.Walk.state.mode,'walk');assert.deepEqual(ctx.drone,before);
  assert.deepEqual(ctx.camera.rotation.toArray(),camera);assert.deepEqual(calls,[]);
});

test('a world replacement during drone preparation cannot retire or publish into the replacement', t => {
  const calls=setup(t),before={...ctx.drone};
  ctx.SurfaceQuery.walkAt=()=>{ctx._worldLoadSequence=(ctx._worldLoadSequence||0)+1;return {position:{y:0}};};
  assert.equal(activate(pose),false);assert.deepEqual(ctx.drone,before);
  assert.equal(ctx.Walk.state.mode,'walk');assert.deepEqual(calls,[]);
});

test('explicit drone command respects blocked vessel exits even if a caller supplies force', t => {
  const calls=setup(t);ctx.boatMode.active=true;const before={...ctx.drone};
  ctx.SurfaceQuery.walkAt=()=>{throw Error('must not prepare before admission');};
  assert.equal(activate(pose,{force:true}),false);
  assert.equal(ctx.boatMode.active,true);assert.deepEqual(ctx.drone,before);assert.deepEqual(calls,[]);
});

test('dedicated environments and a loading world reject explicit drone placement', t => {
  const calls=setup(t),before={...ctx.drone};
  for (const key of ['oceanMode','spaceFlight']) {
    ctx[key].active=true;assert.equal(activate(pose),false);ctx[key].active=false;
  }
  ctx.activeShipInterior=true;assert.equal(activate(pose),false);ctx.activeShipInterior=false;
  ctx.worldLoading=true;assert.equal(activate(pose),false);
  assert.deepEqual(ctx.drone,before);assert.deepEqual(calls,[]);
});

test('ordinary plane-to-drone handoff preserves the departing aircraft altitude', t => {
  const calls=setup(t);ctx.Walk.state.mode='drive';ctx.planeMode={active:true,x:50,y:90,z:60,yaw:.7,pitch:.1};
  ctx.activeTransportActor=undefined;
  assert.equal(travel.setTravelMode('drone'),'drone');
  assert.deepEqual([ctx.drone.x,ctx.drone.y,ctx.drone.z,ctx.drone.yaw],[50,90,60,.7]);
  assert.equal(ctx.drone.pitch,.1);
  assert.deepEqual(calls,['clear','retire-plane']);
});

test('ordinary interior departure prepares from its exterior and clears through the interior owner', t => {
  const calls=setup(t);ctx.activeInterior={outsideState:{x:70,y:1.7,z:80,yaw:.8}};
  ctx.clearActiveInterior=options=>{assert.equal(options.restorePlayer,true);calls.push('exit-interior');ctx.activeInterior=null;Object.assign(ctx.Walk.state.walker,{x:70,z:80});};
  assert.equal(travel.setTravelMode('drone'),'drone');
  assert.deepEqual([ctx.drone.x,ctx.drone.z],[70,80]);assert.ok(calls.indexOf('exit-interior')<calls.indexOf('retire-walk'));
});

test('shared drone pose uses owner clearance and supports missing altitude and mode-only links', t => {
  setup(t);const ui=share();ctx.buildings=[{minX:119,maxX:121,minZ:139,maxZ:141,maxY:70}];
  ctx.pendingExperienceState={travelMode:'drone',refX:120,refY:2,refZ:140,yaw:.6,pitch:-.2};ui.applySharedRuntimeState();
  assert.deepEqual([ctx.drone.x,ctx.drone.y,ctx.drone.z],[120,78,140]);assert.equal(ctx.pendingExperienceState,null);
  ctx.buildings=[];ctx.pendingExperienceState={travelMode:'drone',refX:10,refZ:20};ui.applySharedRuntimeState();
  assert.deepEqual([ctx.drone.x,ctx.drone.y,ctx.drone.z],[10,45,20]);
  ctx.pendingExperienceState={travelMode:'drone',refX:800};ui.applySharedRuntimeState();
  assert.deepEqual([ctx.drone.x,ctx.drone.z],[10,20],'incomplete share cannot replace the published arrival');
});

test('shared drone rejection preserves an offshore vessel and the inactive drone', t => {
  setup(t);ctx.boatMode.active=true;const before={...ctx.drone};
  ctx.pendingExperienceState={travelMode:'drone',refX:120,refY:80,refZ:140};share().applySharedRuntimeState();
  assert.equal(ctx.boatMode.active,true);assert.deepEqual(ctx.drone,before);
  ctx.pendingExperienceState={travelMode:'drone'};share().applySharedRuntimeState();
  assert.equal(ctx.boatMode.active,true);assert.deepEqual(ctx.drone,before);
});

const activity = id => ({id,title:id,traversalMode:'drone',requiresNearbyStart:false,
  anchors:[{id:'a',typeId:'start',x:120,y:0,baseY:10,z:140,yaw:.6},{id:'b',typeId:'finish',x:220,y:0,z:240}]});
test('drone activity uses the command, safe height and real physics after activation', t => {
  setup(t);ctx.buildings=[{minX:119,maxX:121,minZ:139,maxZ:141,maxY:70}];
  assert.equal(startActivity(activity('drone-safe-start')),true);assert.equal(ctx.drone.y,78);
  assert.equal(getRuntimeSnapshot().active,true);ctx.readControlActions=()=>({move:1});const z=ctx.drone.z;
  updateDrone(1/60);assert.ok(ctx.drone.z<z);assert.equal(resolveTransportActor(ctx).mode,'drone');
});

test('rejected drone activity cannot start or write an inactive drone', t => {
  setup(t);ctx.boatMode.active=true;const before={...ctx.drone};
  assert.equal(startActivity(activity('drone-denied-start')),false);
  assert.equal(getRuntimeSnapshot().active,false);assert.deepEqual(ctx.drone,before);assert.equal(ctx.boatMode.active,true);
});

function earthReady() {
  const publication={sequence:41,requestId:'drone-command-test'};
  Object.assign(ctx,{_worldLoadSequence:41,initialEarthWorldReady:true,worldPublication:publication,
    worldLoadRuntimeState:{sequence:41,publication,status:'ready',geometryReady:true,gameplayRuntimesReady:true,session:{state:'published',requestId:publication.requestId}},
    isLoadedLocationSelectionCurrent:()=>true,restoreLoadedLocationSelection:()=> 'baltimore',
    normalizeLocationSelection:()=> 'baltimore',setPlanetaryVehicle:async()=>{},setPlanetaryCharacter:async()=>{},
    showLoad(){},hideLoad(){},prepareFirstWorldRender(){},markLocationSelectionLoaded(){},
    earthSessionState:{pose:{mode:'drone',x:120,z:140,angle:.6,droneY:80,dronePitch:-.2,droneRoll:.1}}});
}
test('Earth resume restores valid saved drone pose through the command', async t => {
  setup(t);earthReady();
  assert.equal((await resumeEarthWorldSession({transitionDurationMs:0})).resumed,true);
  assert.deepEqual([ctx.drone.x,ctx.drone.y,ctx.drone.z,ctx.drone.yaw,ctx.drone.pitch,ctx.drone.roll],[120,80,140,.6,-.2,.1]);
  assert.equal(resolveControlState(ctx).camera,'drone');
});

test('superseded Earth resume cannot publish a saved drone pose or clear a newer cover', async t => {
  setup(t);earthReady();const before={...ctx.drone};let release,hides=0;
  ctx.setPlanetaryVehicle=()=>new Promise(resolve=>release=resolve);ctx.hideLoad=()=>hides++;
  const pending=resumeEarthWorldSession({transitionDurationMs:0});commitEnvironment('OCEAN');release();
  assert.deepEqual(await pending,{aborted:true,resumed:false});assert.deepEqual(ctx.drone,before);assert.equal(hides,0);
  commitEnvironment('EARTH');
});
