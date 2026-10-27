import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createTrackedVrSession} from '../app/js/vr/xr-session.js';
import {createRuntimeKernel} from '../app/js/runtime/kernel.js';
import {createRuntimeFrameSource} from '../app/js/runtime/frame-source.js';
import {getLifecycleRegistrySnapshot} from '../app/js/runtime/lifecycle-scope.js?v=2';
import {updateControlInputFrame} from '../app/js/controls/input-frame.js';
import {presentationFrameVisible} from '../app/js/runtime/renderer-owners.js';
const sandbox=vm.createContext({console});vm.runInContext(await readFile(new URL('../app/vendor/three/build/three.min.js',import.meta.url),'utf8'),sandbox);const T=sandbox.THREE,units=1/1.11;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function pose(x=0){const projection=new T.Matrix4().makePerspective(-.05,.05,.05,-.05,.05,100).toArray();return {transform:{matrix:new T.Matrix4().makeTranslation(x,1.6,0).toArray()},views:[-1,1].map(eye=>({eye,transform:{matrix:new T.Matrix4().makeTranslation(x+eye*.032,1.6,0).toArray()},projectionMatrix:projection}))};}
function fixture({permission,compatibility,reference,delayedEnd=false,layerFailure=false,ride=null,configure=()=>{}}={}){
  const target=new EventTarget(),abort=new AbortController(),native=new EventTarget(),ref=new EventTarget(),reasons=new Set(),events=[],frames=new Map();let next=0,flat=null,current=true,layerCount=0,draws=0,gaze,runEnd;
  target.document={hidden:false,getElementById:()=>null};target.isSecureContext=true;target.innerWidth=1280;target.innerHeight=720;
  native.visibilityState='visible';native.inputSources=[];native.renderState={};native.requestReferenceSpace=()=>reference?.promise||Promise.resolve(ref);
  native.updateRenderState=value=>Object.assign(native.renderState,value);native.requestAnimationFrame=callback=>{const id=++next;frames.set(id,callback);return id;};native.cancelAnimationFrame=id=>frames.delete(id);
  native.end=()=>{events.push('native-end-request');if(delayedEnd)return new Promise(resolve=>runEnd=()=>{end();resolve();});end();return Promise.resolve();};
  function end(){frames.clear();native.dispatchEvent(new Event('end'));}
  target.navigator={xr:{requestSession:()=>{events.push('request-session');return permission?.promise||Promise.resolve(native);}}};
  target.XRWebGLLayer=class{constructor(){layerCount++;if(layerFailure)throw Error('layer failed');this.framebuffer={native:true};}getViewport(view){return {x:view.eye<0?0:500,y:0,width:500,height:500};}};
  let bound=null,renderTarget=null,scissorTest=true;const viewport=new T.Vector4(0,0,1280,720),scissor=viewport.clone();
  const renderer={xr:{enabled:false,isPresenting:false},getContext:()=>({getContextAttributes:()=>({xrCompatible:!compatibility,antialias:false}),makeXRCompatible:()=>compatibility.promise}),
    state:{bindXRFramebuffer:framebuffer=>{bound=framebuffer;}},getRenderTarget:()=>renderTarget,setRenderTarget:value=>renderTarget=value,
    getViewport:out=>out.copy(viewport),setViewport:value=>viewport.copy(value),getScissor:out=>out.copy(scissor),setScissor:value=>scissor.copy(value),getScissorTest:()=>scissorTest,setScissorTest:value=>scissorTest=value,
    render:(_scene,camera)=>{assert.equal(bound?.native,true);assert.equal(camera.isArrayCamera,true);draws++;}};
  const ctx={gameStarted:true,scene:new T.Scene(),camera:new T.PerspectiveCamera(60,1,.1,100*units),renderer,WORLD_UNITS_PER_METER:units,carMesh:new T.Object3D(),car:{x:0,y:0,z:0,angle:0,speed:0},
    setPauseReason:(key,active)=>active?reasons.add(key):reasons.delete(key),hasPauseReason:key=>reasons.has(key),clearControlInputState:()=>{},screenLayout:{setPanelLayer:()=>{}}};
  Object.defineProperty(ctx,'paused',{get:()=>reasons.size>0});
  const kernel=createRuntimeKernel({getContext:()=>({appCtx:ctx}),isSimulationPaused:frame=>ctx.paused||!presentationFrameVisible(ctx,frame),requestFrame:callback=>{assert.equal(flat,null);flat=callback;return 1;},cancelFrame:()=>flat=null});
  const errors=[],source=createRuntimeFrameSource(kernel,{onError:row=>errors.push(row)});
  kernel.registerSystem({id:'input',phase:'input',update:frame=>updateControlInputFrame(ctx,frame)});
  kernel.registerSystem({id:'simulation',phase:'simulation',update:frame=>{if(!frame.flags.simulationBlocked)events.push(['simulation',frame.dt]);}});
  kernel.registerSystem({id:'camera',phase:'camera',update:frame=>ctx.vrPresentation?.updateCamera(frame)});
  kernel.registerSystem({id:'render',phase:'render',update:()=>ctx.vrPresentation?.render()});
  ctx.acquireRuntimeFrameSource=options=>source.acquire(options);ctx.getRuntimeKernelSnapshot=()=>kernel.snapshot();ctx.renderLoop=()=>source.start();source.start();
  configure(ctx,kernel);
  const session=createTrackedVrSession({ctx,THREE:T,target,ride,captureSession:()=>({signal:abort.signal,isCurrent:()=>current}),
    createControls:options=>{gaze=options.onAction;return {update(){},reset(){},select:()=>true,selectRay:()=>true,dispose:()=>events.push('controls-disposed')};}});
  return {ctx,target,native,ref,session,source,events,errors,reasons,abort,end,gaze:action=>gaze(action),flat:()=>!!flat,layers:()=>layerCount,draws:()=>draws,bound:()=>bound,
    setCurrent:value=>current=value,resolveEnd:()=>runEnd(),send:(value=pose(),time=0)=>{const [id,callback]=frames.entries().next().value;frames.delete(id);const frame={getViewerPose:()=>value};callback(time,frame);return frame;},
    cleanup:async()=>{await session.stop();source.dispose();}};
}
test('real kernel receives only compositor frames, physical views stay scaled and cleanup restores flat ownership',async()=>{
  const baseline=getLifecycleRegistrySnapshot().resourceCount,f=fixture(),before=JSON.stringify(f.ctx.car);
  const starting=f.session.start();assert.deepEqual(f.events,['request-session']);assert.equal(await starting,true);assert.equal(f.flat(),false);
  f.send();assert.equal(f.draws(),1);assert.equal(f.bound(),null);assert.equal(f.session.snapshot().userPaused,true);assert.equal(JSON.stringify(f.ctx.car),before);
  const first=f.ctx.camera.position.clone();f.send(pose(.1),20);assert.ok(Math.abs(f.ctx.camera.position.distanceTo(first)-.1*units)<1e-10);
  assert.ok(Math.abs(f.session.snapshot().eyeSeparationWorld-.064*units)<1e-10);f.gaze('toggle');f.send(pose(.1),40);assert.equal(f.session.snapshot().userPaused,false);
  await f.session.stop();assert.equal(f.flat(),true);assert.equal(f.ctx.vrPresentation,null);assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);f.source.dispose();
});
test('tracked Ocean and spacecraft borrow their dedicated driver and restore it only after native end',async()=>{
  for(const domain of ['ocean','space']){
    let running=true,starts=0,frames=0;
    const f=fixture({delayedEnd:true,configure:(ctx,kernel)=>{
      const driver={start(){running=true;starts++;},stop(){running=false;},snapshot:()=>({running}),runFrame:(timestamp,frame)=>{frames++;kernel.runFrame(timestamp,frame);}};
      const view={active:true,renderer:ctx.renderer,scene:new T.Scene(),camera:new T.PerspectiveCamera(60,1,.05,100),captureFrameDriver:()=>driver};
      if(domain==='ocean'){ctx.oceanMode={...view,submarine:{position:new T.Vector3(0,-20,0),yaw:0,mesh:new T.Group()}};}
      else{const rocket=new T.Group();rocket.scale.setScalar(.62);rocket.userData.spaceCraftId='pathfinder-pod';ctx.spaceFlight={...view,rocket,mode:'flying'};}
    }});
    await f.session.start();assert.equal(running,false);assert.equal(f.flat(),false);f.send();assert.equal(frames,1);assert.equal(f.draws(),1);
    assert.ok(Math.abs(f.session.snapshot().eyeSeparationWorld-.064*(domain==='space'?.62:units))<1e-10);
    const ending=f.session.stop();assert.equal(running,false);assert.equal(starts,0);f.resolveEnd();await ending;assert.equal(running,true);assert.equal(starts,1);assert.equal(f.flat(),true);f.source.dispose();
  }
});
test('only the executing visible compositor frame can use input while the HTML document is hidden',async()=>{
  const saved=Object.getOwnPropertyDescriptor(globalThis,'document'),f=fixture();
  try{
    globalThis.document={hidden:true};await f.session.start();const nativeFrame=f.send();assert.equal(f.session.snapshot().tracking,true);assert.equal(f.draws(),1);
    assert.equal(f.session.isFrameVisible({source:'webxr-vr',xrFrame:nativeFrame}),false,'A retained native frame is obsolete outside its callback');
    assert.equal(updateControlInputFrame(f.ctx,{source:'window'}),false);assert.equal(updateControlInputFrame(f.ctx,{source:'webxr-vr',xrFrame:{}}),false);
    f.gaze('toggle');f.send(pose(),20);assert.ok(f.events.some(event=>Array.isArray(event)&&event[0]==='simulation'&&event[1]>0));
    f.native.visibilityState='visible-blurred';f.native.dispatchEvent(new Event('visibilitychange'));f.send(pose(),40);assert.equal(f.session.snapshot().userPaused,true);
  }finally{await f.cleanup();if(saved)Object.defineProperty(globalThis,'document',saved);else delete globalThis.document;}
});
test('missing pose and blurred visibility block movement and require deliberate restart after tracking returns',async()=>{
  const f=fixture();await f.session.start();f.send();f.gaze('toggle');f.send(pose(),20);
  f.send(null,40);assert.equal(f.session.snapshot().tracking,false);assert.equal(f.session.snapshot().userPaused,true);
  f.send(pose(),60);assert.equal(f.session.snapshot().userPaused,true);f.gaze('toggle');
  f.native.visibilityState='visible-blurred';f.native.dispatchEvent(new Event('visibilitychange'));f.send(pose(),80);assert.equal(f.session.snapshot().userPaused,true);
  await f.cleanup();
});
test('cancelled permission and obsolete grants do not touch the renderer or take frames',async()=>{
  const grant=deferred(),f=fixture({permission:grant}),start=f.session.start();const ended=f.session.stop('cancelled');grant.resolve(f.native);
  assert.equal(await start,false);await ended;assert.equal(f.layers(),0);assert.equal(f.flat(),true);assert.equal(f.ctx.vrPresentation,undefined);f.source.dispose();
  const rejected=deferred(),cancelled=fixture({permission:rejected}),pending=cancelled.session.start(),closing=cancelled.session.stop('cancelled');rejected.reject(Error('permission closed'));
  assert.equal(await pending,false);await closing;assert.equal(cancelled.flat(),true);assert.equal(cancelled.layers(),0);cancelled.source.dispose();
});
test('native end during pending context compatibility drains the operation before resuming flat play',async()=>{
  const compatibility=deferred(),f=fixture({compatibility}),start=f.session.start();await Promise.resolve();assert.equal(f.flat(),false);
  f.end();assert.equal(f.flat(),false);compatibility.resolve();assert.equal(await start,false);assert.equal(f.layers(),0);assert.equal(f.flat(),true);f.source.dispose();
});
test('native end during reference-space request cannot publish or schedule a late view',async()=>{
  const reference=deferred(),f=fixture({reference}),start=f.session.start();await Promise.resolve();assert.equal(f.layers(),1);f.end();reference.resolve(f.ref);
  assert.equal(await start,false);assert.equal(f.flat(),true);assert.equal(f.session.snapshot().phase,'closed');f.source.dispose();
});
test('mode/world replacement revokes callbacks and waits for actual native end',async()=>{
  const f=fixture({delayedEnd:true});await f.session.start();f.send();f.setCurrent(false);f.send(pose(),20);
  assert.equal(f.session.snapshot().phase,'ending');assert.equal(f.flat(),false);assert.equal(f.source.snapshot().active,true);f.resolveEnd();await f.session.stop();assert.equal(f.flat(),true);f.source.dispose();
});
test('permission rejection and layer failure settle their owned setup and restore the existing loop',async()=>{
  const permission=deferred(),denied=fixture({permission}),start=denied.session.start();permission.reject(Error('denied'));await assert.rejects(start,/denied/);assert.equal(denied.flat(),true);denied.source.dispose();
  const failed=fixture({layerFailure:true});await assert.rejects(failed.session.start(),/layer failed/);assert.equal(failed.flat(),true);assert.equal(failed.ctx.vrPresentation,null);failed.source.dispose();
});
test('a completed road ride stops simulation before presentation and can resume as manual driving',async()=>{
  let status='ready';const ride={step:(_frame,enabled)=>{if(enabled&&status==='ready')status='complete';},snapshot:()=>({status,name:'Street',progress:0}),readActions:()=>null,takeManual:()=>status='manual',dispose(){}};
  const f=fixture({ride});await f.session.start();f.send();f.gaze('toggle');f.send(pose(),20);assert.equal(f.session.snapshot().userPaused,true);assert.equal(f.events.some(event=>Array.isArray(event)&&event[0]==='simulation'),false);
  f.gaze('toggle');f.send(pose(),40);assert.equal(status,'manual');assert.equal(f.session.snapshot().userPaused,false);assert.ok(f.events.some(event=>Array.isArray(event)&&event[0]==='simulation'&&event[1]>0));await f.cleanup();
});
test('ordinary map, Backpack and activity admission end tracked VR before adopting another UI layer',async()=>{
  for(const change of [ctx=>ctx.showLargeMap=true,ctx=>ctx.fishingGame={open:true},ctx=>ctx.blockBuildMode=true,ctx=>ctx.gameStarted=false,ctx=>ctx.screenLayout.getPanelLayer=()=> 'backpack']){
    const f=fixture();await f.session.start();change(f.ctx);f.send();await f.session.stop();assert.equal(f.ctx.vrPresentation,null);assert.equal(f.flat(),true);f.source.dispose();
  }
});
