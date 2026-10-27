import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createPhoneVrSession} from '../app/js/vr/phone-session.js';
import {getLifecycleRegistrySnapshot} from '../app/js/runtime/lifecycle-scope.js?v=2';
const sandbox=vm.createContext({console});vm.runInContext(await readFile(new URL('../app/vendor/three/build/three.min.js',import.meta.url),'utf8'),sandbox);const THREE=sandbox.THREE;
function fixture(permission=async()=>true,{ride=null,configure=()=>{}}={}){
  const target=new EventTarget();target.document=new EventTarget();target.document.hidden=false;target.document.getElementById=()=>null;target.screen={orientation:new EventTarget()};target.innerWidth=844;target.innerHeight=390;
  const reasons=new Set(['unrelated-pause']),events=[],controller=new AbortController(),classes=new Set();let current=true,tracking=true,gaze,disposals=0;
  const ctx={gameStarted:true,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),WORLD_UNITS_PER_METER:1/1.11,
    renderer:{domElement:{classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)}}},carMesh:new THREE.Object3D(),car:{x:0,y:1,z:0,angle:0,speed:0},
    setPauseReason:(reason,active)=>active?reasons.add(reason):reasons.delete(reason),hasPauseReason:reason=>reasons.has(reason),clearControlInputState:reason=>events.push(reason),screenLayout:{setPanelLayer:(id,active)=>events.push([id,active])}};
  Object.defineProperty(ctx,'paused',{get:()=>reasons.size>0});
  configure(ctx);
  const session=createPhoneVrSession({ctx,THREE,target,optics:{},ride,captureSession:()=>({signal:controller.signal,isCurrent:()=>current}),
    createStereo:()=>({render:()=>events.push('stereo-render'),dispose:()=>disposals++,snapshot:()=>({active:true})}),
    createTracking:()=>({enable:permission,dispose:()=>disposals++,recenter:()=>events.push('recenter'),snapshot:()=>({status:tracking?'active':'stale'}),read:out=>{out.identity();return tracking;}}),
    createControls:options=>{gaze=options.onAction;return {dispose:()=>disposals++,reset(){},select(){},update:()=>events.push('gaze-update')};}});
  return {session,ctx,target,reasons,events,classes,controller,gaze:action=>gaze(action),setCurrent:value=>current=value,setTracking:value=>tracking=value,disposals:()=>disposals};
}
test('phone VR takes presentation only after permission and starts paused with independent head rotation',async()=>{
  const f=fixture(),before=JSON.stringify(f.ctx.car);assert.equal(f.ctx.vrPresentation,undefined);assert.equal(await f.session.start(),true);assert.equal(await f.session.start(),true);
  assert.equal(f.ctx.vrPresentation,f.session);assert.equal(f.reasons.has('vr-user'),true);f.session.beforeInput();assert.equal(f.reasons.has('vr-tracking'),false);f.session.updateCamera({timestamp:0});f.session.render();
  assert.ok(f.events.includes('stereo-render'));assert.equal(JSON.stringify(f.ctx.car),before);f.gaze('toggle');assert.equal(f.reasons.has('vr-user'),false);f.gaze('recenter');assert.ok(f.events.includes('recenter'));
  f.gaze('exit');assert.equal(f.ctx.vrPresentation,null);assert.equal(f.classes.size,0);assert.equal(f.reasons.has('unrelated-pause'),true);assert.equal(f.disposals(),3);
});
test('Ocean and free-flight spacecraft use their active renderer, scale and stable actor identity',async()=>{
  for(const domain of ['submarine','diver','rocket']){
    const f=fixture(undefined,{configure:ctx=>{
      const renderer=ctx.renderer,scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
      if(domain==='rocket'){
        const rocket=new THREE.Group();rocket.position.set(10,20,30);rocket.scale.setScalar(.62);rocket.userData.spaceCraftId='pathfinder-pod';
        ctx.spaceFlight={active:true,mode:'flying',renderer,scene,camera,rocket};
      }else{
        const diver={active:domain==='diver',presentationBody:new THREE.Group(),navigationActor:()=>({position:{x:1,y:-3,z:2},yaw:.2})};
        ctx.oceanMode={active:true,renderer,scene,camera,diver,submarine:{position:new THREE.Vector3(0,-20,0),yaw:0,mesh:new THREE.Group()}};
      }
    }});
    const source=f.ctx.spaceFlight||f.ctx.oceanMode,body=domain==='rocket'?source.rocket:domain==='diver'?source.diver.presentationBody:source.submarine.mesh;
    await f.session.start();f.session.beforeInput({flags:{}});f.session.updateCamera({timestamp:0});f.session.render();assert.equal(body.visible,false);
    assert.equal(f.session.snapshot().worldUnitsPerMeter,domain==='rocket'?.62:1/1.11);assert.ok(source.camera.position.length()>0);assert.ok(f.events.includes('stereo-render'));
    if(domain==='rocket')source.rocket=new THREE.Group();else if(domain==='diver')source.diver={...source.diver};else source.submarine={...source.submarine};
    assert.equal(f.session.guard(),false);assert.equal(body.visible,true);assert.equal(f.disposals(),3);
  }
});
test('stale tracking pauses gameplay while retaining the presentation until an explicit restart',async()=>{
  const f=fixture();await f.session.start();f.session.beforeInput();f.gaze('toggle');f.setTracking(false);const frame={flags:{}};f.session.beforeInput(frame);assert.equal(f.reasons.has('vr-tracking'),true);assert.equal(f.session.active,true);assert.equal(frame.flags.simulationBlocked,true);
  f.setTracking(true);f.session.beforeInput();assert.equal(f.reasons.has('vr-tracking'),false);assert.equal(f.reasons.has('vr-user'),true);f.gaze('toggle');assert.equal(f.reasons.has('vr-user'),false);f.session.stop();
});
test('world, actor and viewport handoffs retire only this presentation and return resources to baseline',async()=>{
  const baseline=getLifecycleRegistrySnapshot().resourceCount;
  for(const change of [f=>f.setCurrent(false),f=>{f.ctx.Walk={state:{mode:'walk',walker:{x:1,y:1.7,z:1,yaw:0}}};},f=>{f.ctx.carMesh=new THREE.Object3D();}]){
    const f=fixture();await f.session.start();change(f);assert.equal(f.session.guard(),false);assert.equal(f.disposals(),3);assert.equal(f.reasons.has('unrelated-pause'),true);assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);
  }
  const f=fixture();await f.session.start();f.target.innerWidth=390;f.target.dispatchEvent(new Event('resize'));assert.equal(f.session.active,false);assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);
});
test('cancelled permission and environment abort cannot later adopt a prepared renderer',async()=>{
  let grant;const pending=new Promise(resolve=>grant=resolve),f=fixture(()=>pending);const start=f.session.start();f.session.stop('setup-closed');grant(true);assert.equal(await start,false);assert.equal(f.ctx.vrPresentation,undefined);assert.equal(f.disposals(),3);
  const live=fixture();await live.session.start();live.controller.abort();assert.equal(live.session.active,false);assert.equal(live.disposals(),3);
});
test('a completed road ride pauses the same frame and Start deliberately returns to manual control',async()=>{
  let status='ready',disposed=false;const ride={step:(_frame,enabled)=>{if(enabled&&status==='ready')status='complete';},snapshot:()=>({status,name:'Street',progress:status==='complete'?1:0}),readActions:()=>null,takeManual:()=>status='manual',dispose:()=>disposed=true};
  const f=fixture(undefined,{ride});f.reasons.delete('unrelated-pause');await f.session.start();f.session.beforeInput({flags:{}});f.gaze('toggle');const completed={flags:{}};f.session.beforeInput(completed);
  assert.equal(f.session.snapshot().userPaused,true);assert.equal(completed.flags.simulationBlocked,true);f.gaze('toggle');const manual={flags:{}};f.session.beforeInput(manual);assert.equal(status,'manual');assert.equal(f.session.snapshot().userPaused,false);assert.equal(manual.flags.simulationBlocked,undefined);f.session.stop();assert.equal(disposed,true);
});
test('ordinary map, Backpack and activity admission returns phone VR to its normal UI owner',async()=>{
  for(const change of [ctx=>ctx.showLargeMap=true,ctx=>ctx.fishingGame={open:true},ctx=>ctx.blockBuildMode=true,ctx=>ctx.gameStarted=false,ctx=>ctx.screenLayout.getPanelLayer=()=> 'backpack']){
    const f=fixture();await f.session.start();change(f.ctx);assert.equal(f.session.guard(),false);assert.equal(f.ctx.vrPresentation,null);assert.equal(f.disposals(),3);
  }
});
