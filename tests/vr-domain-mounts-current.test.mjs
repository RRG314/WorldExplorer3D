import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parse} from '@babel/parser';
import {vrMountEligibility,applyVrGameMount} from '../app/js/vr/game-mount.js';
import {configureSpaceRuntimeDependencies,updateSpaceFlightPhysics} from '../app/js/space/runtime.js';
import {ctx} from '../app/js/shared-context.js?v=55';
import {updateControlInputFrame} from '../app/js/controls/input-frame.js';
import {acceptedSimulationDelta} from '../app/js/runtime/simulation-clock.js';
import {presentationFrameVisible,capturePresentation} from '../app/js/runtime/renderer-owners.js';
const sandbox=vm.createContext({console});vm.runInContext(await readFile(new URL('../app/vendor/three/build/three.min.js',import.meta.url),'utf8'),sandbox);const T=sandbox.THREE;
function spacecraft(id='pathfinder-pod'){
  const rocket=new T.Group();rocket.position.set(10,20,30);rocket.scale.setScalar(id==='pathfinder-pod'?.62:1.45);rocket.userData.spaceCraftId=id;
  return {WORLD_UNITS_PER_METER:1/1.11,spaceFlight:{active:true,mode:'flying',rocket}};
}
test('typed Ocean and both spacecraft mounts borrow poses without moving actors or changing navigation scale',()=>{
  const ocean={WORLD_UNITS_PER_METER:1/1.11,oceanMode:{active:true,submarine:{position:new T.Vector3(4,-20,8),yaw:.4,mesh:new T.Group()}}};
  const diver={active:true,presentationBody:new T.Group(),navigationActor:()=>({position:{x:8,y:-3,z:9},yaw:.8})};
  for(const world of [ocean,{...ocean,oceanMode:{...ocean.oceanMode,diver}},spacecraft(),spacecraft('solis-reach')]){
    const before=vrMountEligibility(world),position={...before.pose},camera=new T.PerspectiveCamera();assert.equal(before.eligible,true);
    const mounted=applyVrGameMount(T,world,camera);assert.equal(mounted.body,before.body);assert.deepEqual(vrMountEligibility(world).pose,position);
    assert.ok([camera.position.x,camera.position.y,camera.position.z,...camera.quaternion.toArray()].every(Number.isFinite));
    if(world.spaceFlight){assert.equal(mounted.worldUnitsPerMeter,world.spaceFlight.rocket.scale.x);const direction=camera.getWorldDirection(new T.Vector3());assert.ok(direction.distanceTo(new T.Vector3(0,1,0))<1e-10);}
    else assert.equal(mounted.worldUnitsPerMeter,1/1.11);
  }
});
test('VR admission retains launch, landing, overview, remote-control and invalid scale restrictions',()=>{
  for(const change of [w=>w.spaceFlight.mode='launching',w=>w.spaceFlight.mode='landing',w=>w.spaceFlight.overviewMode='inner',w=>w.spaceFlight.rocket.userData.spaceCraftId='unknown',w=>w.spaceFlight.rocket.scale.y=2,w=>w.spaceFlight.rocket.position.x=NaN]){
    const world=spacecraft();change(world);assert.equal(vrMountEligibility(world).eligible,false);assert.throws(()=>applyVrGameMount(T,world,new T.PerspectiveCamera()));
  }
  assert.equal(vrMountEligibility({droneMode:true}).eligible,false);
  assert.equal(vrMountEligibility({oceanMode:{active:true,submarine:{position:{x:0,y:-2,z:0}}}}).eligible,false);
});
test('camera restoration belongs to the captured domain and cannot touch a replacement renderer',()=>{
  let restorations=0;const view={active:true,renderer:{},camera:{},scene:{},restorePresentationCamera:()=>{restorations++;return true;}};
  const world={gameStarted:true,oceanMode:view},captured=capturePresentation(world);assert.equal(captured.restoreCamera(),true);assert.equal(restorations,1);
  view.renderer={};assert.equal(captured.restoreCamera(),false);assert.equal(restorations,1);
  world.oceanMode.active=false;world.spaceFlight={...view,active:true};assert.equal(captured.restoreCamera(),false);assert.equal(restorations,1);
});
test('actual spacecraft steering depends on its seat, not a rotating headset camera',()=>{
  const keys=['spaceFlight','vrPresentation','readControlActions','updateRenderedSpaceJourney','pirateInterceptionRuntime','getAllSpaceBodies','resolveCharacterCapability'];
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(ctx,key)]));
  configureSpaceRuntimeDependencies({THREE:T});
  try{
    let result;
    for(const headYaw of [0,Math.PI*.5,-Math.PI*.7]){
      const rocket=new T.Group(),camera=new T.PerspectiveCamera();camera.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),headYaw);
      ctx.spaceFlight={active:true,mode:'flying',rocket,camera,keys:{},_frameScale:1};ctx.vrPresentation={headTracking:true};ctx.pirateInterceptionRuntime=null;ctx.resolveCharacterCapability=undefined;
      ctx.readControlActions=()=>({turn:.5,move:-.4});ctx.getAllSpaceBodies=()=>[];ctx.updateRenderedSpaceJourney=()=>true;
      updateSpaceFlightPhysics();const rotation=rocket.quaternion.toArray();if(result)assert.deepEqual(rotation,result);else result=rotation;
    }
    assert.notDeepEqual(result,[0,0,0,1]);
  }finally{for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(ctx,key,descriptor);else delete ctx[key];}}
});
test('the actual dedicated paused-frame functions present head and exit controls without locomotion',async()=>{
  for(const [file,name,domain] of [['space/runtime.js','stepSpaceFlight','spaceFlight'],['ocean.js','stepOceanMode','oceanMode']]){
    const source=await readFile(new URL('../app/js/'+file,import.meta.url),'utf8'),ast=parse(source,{sourceType:'module'}),fn=ast.program.body.map(n=>n.declaration||n).find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.ok(fn);
    const events=[],mode={active:true,submarine:{position:{x:0,y:-20,z:0},speed:0},waterSurface:{update(){}},renderer:{render:()=>events.push('flat')},scene:{},camera:{}};
    const appCtx={gameStarted:true,paused:true,[domain]:mode,vrPresentation:{active:true,beforeInput:()=>events.push('input'),updateCamera:()=>events.push('head'),render:()=>events.push('stereo')}};
    const bindings={appCtx,oceanMode:mode,acceptedSimulationDelta,performance:{now:()=>1000},presentationFrameVisible,updateControlInputFrame,updateSubmarine:dt=>events.push(['physics',dt]),updateOceanStream(){},updateOceanHud(){},updateFishLife(){}};
    vm.runInNewContext(source.slice(fn.start,fn.end)+`;${name}(${domain==='spaceFlight'?'{} ,':''}1000);`,bindings);
    assert.deepEqual(events.filter(e=>typeof e==='string'),['input','head','stereo'],file);
    for(const event of events.filter(Array.isArray))assert.equal(event[1],0,'Paused Ocean simulation receives zero dt');
    assert.equal(mode.animationId,undefined,'A frame step cannot create a second callback');
  }
});
