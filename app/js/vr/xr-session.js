import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';
import {capturePresentation} from '../runtime/renderer-owners.js';
import {applyVrGameMount,vrMountEligibility} from './game-mount.js';
import {createVrGazeControls} from './gaze-controls.js';
import {createXrWorldViews} from './xr-world-views.js';
import {createXrActionInput,mergeXrActions} from './xr-input.js';
import {roadRideMustPause,roadRideMessage} from './road-ride.js';

// Use the current renderer's ArrayCamera and framebuffer interfaces directly.
// r128's WebXRManager assumes metre-sized parallel eyes and can finish async
// setup after native session end. This adapter checks each cancellation boundary
// and supplies compositor timestamps to the existing kernel's exclusive lease.
export function createTrackedVrSession({ctx,THREE,captureSession,ride=null,target=window,onExit=()=>{},createControls=createVrGazeControls}){
  if(ctx.vrPresentation?.active)throw new Error('A VR view is already open.');
  if(!ctx.gameStarted||ctx.worldLoading||ctx.titleLaunchPending||ctx.arSessionActive||ctx.fishingGame?.open||ctx.blockBuildMode)throw new Error('Close the current activity and finish loading a world before entering VR.');
  if(ctx.getLiveGpsSnapshot?.().active)throw new Error('Stop live GPS movement before entering a seated VR view.');
  const admission=vrMountEligibility(ctx);if(!admission.eligible)throw new Error(admission.reason);
  let presentation=capturePresentation(ctx);const renderer=presentation.renderer,gl=renderer?.getContext();
  if(presentation.owner!=='main'||renderer?.xr?.isPresenting||typeof renderer?.state?.bindXRFramebuffer!=='function'||typeof ctx.acquireRuntimeFrameSource!=='function')throw new Error('The current renderer cannot enter tracked VR.');
  const units=ctx.WORLD_UNITS_PER_METER;if(!Number.isFinite(units)||units<=0)throw new Error('The current world has no physical VR scale.');
  const world=captureSession(),scope=createLifecycleScope('vr-tracked-session');
  scope.defer(()=>ride?.dispose());
  const mount=new THREE.PerspectiveCamera(),arrayCamera=new THREE.ArrayCamera(),mountMatrix=new THREE.Matrix4(),correction=new THREE.Matrix4(),translation=new THREE.Matrix4(),raw=new THREE.Matrix4(),headMatrix=new THREE.Matrix4();
  const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3(),euler=new THREE.Euler(0,0,0,'YXZ'),rayOrigin=new THREE.Vector3(),rayDirection=new THREE.Vector3();
  const previousViewport=new THREE.Vector4(),previousScissor=new THREE.Vector4();
  const views=createXrWorldViews({THREE,worldUnitsPerMeter:units}),input=createXrActionInput();
  const oldEnabled=renderer.xr.enabled;let body=admission.control.mode==='plane'?ctx.planeMode.mesh:null;const oldVisible=body?.visible;
  const mountBody=()=>admission.control.mode==='drive'?ctx.carMesh:admission.control.mode==='walk'?ctx.Walk?.state?.walker:ctx.planeMode;
  let originalBody=mountBody();
  let phase='prepared',session=null,layer=null,reference=null,lease=null,pose=null,calibrated=false,tracking=false,userPaused=true,reason='',nativeEnded=false,startPromise=null,resumeFlat=false,frameHandle=null,runFrame=null;
  let finishClosed;const closed=new Promise(resolve=>finishClosed=resolve);
  let compatibilityPending=false,finishPending=false;
  const current=()=>{
    const next=vrMountEligibility(ctx),panel=ctx.screenLayout?.getPanelLayer?.();
    return phase!=='ending'&&phase!=='closed'&&ctx.gameStarted&&!nativeEnded&&world.isCurrent()&&presentation.isCurrent()&&!ctx.worldLoading&&!ctx.titleLaunchPending&&!ctx.arSessionActive&&!ctx.getLiveGpsSnapshot?.().active&&!ctx.showLargeMap&&!ctx.fishingGame?.open&&!ctx.blockBuildMode&&
      (phase!=='presenting'||panel===undefined||panel==='vr')&&
      next.eligible&&next.control.mode===admission.control.mode&&next.control.occupancy===admission.control.occupancy&&next.control.frame===admission.control.frame&&mountBody()===originalBody;
  };
  function pause(){userPaused=true;input.reset();controls.reset();ctx.setPauseReason?.('vr-user',true);ctx.clearControlInputState?.('vr-tracked-pause');}
  function recenter(){calibrated=false;tracking=false;pause();}
  function cancelFrame(){if(frameHandle!==null){session?.cancelAnimationFrame(frameHandle);frameHandle=null;}}
  function finish(){
    if(phase==='closed')return;
    if(compatibilityPending){finishPending=true;return;}
    phase='closed';scope.dispose(reason||'session-ended');
    if(ctx.vrPresentation===api)ctx.vrPresentation=null;
    renderer.xr.enabled=oldEnabled;
    lease?.release(reason||'session-ended');lease=null;
    ctx.setPauseReason?.('vr-user',false);ctx.setPauseReason?.('vr-tracking',false);ctx.clearControlInputState?.('vr-tracked-exit');ctx.screenLayout?.setPanelLayer?.('vr',false);
    if(body)body.visible=oldVisible;
    presentation=body=originalBody=null;
    pose=layer=reference=session=null;
    if(resumeFlat)ctx.renderLoop?.();
    finishClosed(true);onExit(reason||'session-ended');
  }
  async function endNative(){
    if(!session||nativeEnded){finish();return;}
    try{await session.end();finish();}
    catch{if(nativeEnded)finish();else ctx.showToast?.('Use your headset’s system menu to exit VR.');}
  }
  function stop(nextReason='user-exit'){
    if(phase==='closed'||phase==='ending')return closed;
    reason=nextReason;const wasRequesting=phase==='requesting';phase='ending';tracking=false;input.reset();cancelFrame();
    ctx.setPauseReason?.('vr-tracking',true);ctx.clearControlInputState?.('vr-tracked-ending');
    // A late permission grant is ended when the request settles. It never
    // touches the renderer or adopts a replacement environment.
    if(!wasRequesting)void endNative();
    return closed;
  }
  let controls;
  try{controls=createControls({THREE,scene:presentation.scene,worldUnitsPerMeter:units,onAction:action=>{
    if(action==='exit'){stop();return;}
    if(action==='recenter'){recenter();return;}
    if(action==='toggle'){
      if(!tracking)return;if(userPaused&&roadRideMustPause(ride))ride.takeManual();userPaused=!userPaused;input.reset();ctx.setPauseReason?.('vr-user',userPaused);ctx.clearControlInputState?.('vr-tracked-toggle');
      if(!userPaused&&ctx.hasPauseReason?.('manual_pause')){ctx.setPauseReason('manual_pause',false);target.document.getElementById('pauseScreen')?.classList.remove('show');}
    }
  }});}catch(error){scope.dispose('preparation-failed');throw error;}
  scope.defer(()=>controls.dispose());scope.defer(cancelFrame);
  function updateMount(){
    applyVrGameMount(THREE,ctx,mount);mount.updateMatrixWorld(true);raw.fromArray(pose.transform.matrix);
    if(!calibrated){
      raw.decompose(position,quaternion,scale);euler.setFromQuaternion(quaternion,'YXZ');
      correction.makeRotationY(-euler.y).multiply(translation.makeTranslation(-position.x*units,-position.y*units,-position.z*units));calibrated=true;
    }
    mountMatrix.multiplyMatrices(mount.matrixWorld,correction);
    raw.elements[12]*=units;raw.elements[13]*=units;raw.elements[14]*=units;
    headMatrix.multiplyMatrices(mountMatrix,raw);headMatrix.decompose(presentation.camera.position,presentation.camera.quaternion,scale);presentation.camera.updateMatrixWorld(true);
  }
  function select(event){
    if(!tracking||phase!=='presenting')return;
    const source=event.inputSource;
    if(source?.targetRayMode==='gaze'){if(controls.select())input.reset();return;}
    const ray=source?.targetRaySpace&&event.frame?.getPose(source.targetRaySpace,reference);
    if(!ray)return;raw.fromArray(ray.transform.matrix);raw.elements[12]*=units;raw.elements[13]*=units;raw.elements[14]*=units;raw.premultiply(mountMatrix);
    raw.decompose(rayOrigin,quaternion,scale);rayDirection.set(0,0,-1).applyQuaternion(quaternion);
    if(controls.selectRay(rayOrigin,rayDirection))input.reset();
  }
  function frame(timestamp,nativeFrame){
    frameHandle=null;if(phase!=='presenting')return;
    if(!current()){stop('world-or-mode-changed');return;}
    try{
      pose=nativeFrame.getViewerPose(reference);runFrame(timestamp,{xrFrame:nativeFrame});
      if(phase==='presenting')frameHandle=session.requestAnimationFrame(frame);
    }catch{stop('tracking-error');}
  }
  const api={
    get active(){return phase!=='closed';},kind:'tracked',headTracking:true,stop,
    guard(){if(!current()){stop('world-or-mode-changed');return false;}return true;},
    readActions(mode,hardware){
      if(!tracking||userPaused||phase!=='presenting')return null;
      const device=input.read(mode),manual=mergeXrActions({...hardware},device);
      return ride?.readActions(mode,manual)||device;
    },
    beforeInput(frame){
      if(!api.guard())return;
      const previous=tracking;tracking=!!pose&&session?.visibilityState==='visible';
      if(previous&&!tracking)pause();ctx.setPauseReason?.('vr-tracking',!tracking);
      input.update(session?.inputSources,tracking&&!userPaused&&!ctx.paused);
      ride?.step(frame,tracking&&!userPaused&&!ctx.paused);
      if(!userPaused&&roadRideMustPause(ride))pause();
      if((!tracking||userPaused)&&frame?.flags)frame.flags.simulationBlocked=true;
    },
    updateCamera(frame){
      if(!api.guard())return false;if(!tracking)return true;
      updateMount();if(body)body.visible=false;
      controls.update({mountPosition:mount.position,mountQuaternion:mount.quaternion,camera:presentation.camera,timestamp:frame.timestamp,paused:ctx.paused,tracking,message:roadRideMessage(ride,ctx.paused)});return true;
    },
    render(){
      if(!api.guard()||!tracking)return;
      if(pose.views.length<1||pose.views.length>2)throw new Error('Unsupported headset view layout.');
      while(arrayCamera.cameras.length<pose.views.length){const eye=new THREE.PerspectiveCamera();eye.viewport=new THREE.Vector4();arrayCamera.cameras.push(eye);}
      arrayCamera.cameras.length=pose.views.length;arrayCamera.layers.mask=presentation.camera.layers.mask;
      pose.views.forEach((view,index)=>{
        const rect=layer.getViewport(view),eye=arrayCamera.cameras[index];
        if(!rect||rect.width<=0||rect.height<=0)throw new Error('Headset viewport unavailable.');
        eye.viewport.set(rect.x,rect.y,rect.width,rect.height);eye.layers.mask=presentation.camera.layers.mask;
      });
      views.update({arrayCamera,pose,mountMatrix});
      const previousTarget=renderer.getRenderTarget(),scissorTest=renderer.getScissorTest();renderer.getViewport(previousViewport);renderer.getScissor(previousScissor);
      try{
        // XR framebuffer is valid only inside its native animation callback.
        // Shadow/render-target passes restoring null must return to this layer.
        renderer.state.bindXRFramebuffer(layer.framebuffer);renderer.setRenderTarget(null);renderer.setScissorTest(false);renderer.render(presentation.scene,arrayCamera);
      }finally{
        renderer.state.bindXRFramebuffer(null);renderer.setRenderTarget(previousTarget);renderer.setViewport(previousViewport);renderer.setScissor(previousScissor);renderer.setScissorTest(scissorTest);
      }
    },
    start(){
      if(startPromise)return startPromise;if(phase!=='prepared')return Promise.resolve(false);
      if(!target.isSecureContext||!target.navigator?.xr?.requestSession||!target.XRWebGLLayer){stop('unsupported');return Promise.resolve(false);}
      phase='requesting';let request;
      // This invocation remains in the real user's Enter VR gesture.
      try{request=target.navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local']});}
      catch(error){phase='prepared';stop('permission-denied');return Promise.reject(error);}
      startPromise=(async()=>{
        try{
          session=await request;
          if(!current()){phase='ending';await endNative();return false;}
          scope.listen(session,'end',()=>{nativeEnded=true;reason||='session-ended';phase='ending';tracking=false;cancelFrame();finish();});
          phase='binding';resumeFlat=ctx.getRuntimeKernelSnapshot?.().running===true;
          lease=ctx.acquireRuntimeFrameSource({owner:'webxr-vr',resumeOnRelease:false,isCurrent:()=>phase!=='closed',start:run=>{runFrame=run;},stop:cancelFrame,onExit:why=>{if(phase!=='ending'&&phase!=='closed')stop(why);}});
          ctx.vrPresentation=api;renderer.xr.enabled=false;
          ctx.setPauseReason?.('vr-user',true);ctx.setPauseReason?.('vr-tracking',true);ctx.clearControlInputState?.('vr-tracked-enter');
          if(gl.getContextAttributes()?.xrCompatible!==true){
            compatibilityPending=true;
            try{await gl.makeXRCompatible();}finally{compatibilityPending=false;if(finishPending)finish();}
          }
          if(!current()){await stop('obsolete');return false;}
          const quality=String(ctx.renderQualityLevel||'').toLowerCase(),framebufferScaleFactor=quality==='high'?1:quality==='low'?.7:.85;
          layer=new target.XRWebGLLayer(session,gl,{alpha:false,depth:true,stencil:false,antialias:gl.getContextAttributes()?.antialias===true,framebufferScaleFactor});
          session.updateRenderState({baseLayer:layer,depthNear:.05,depthFar:Math.max(1,presentation.camera.far/units)});
          reference=await session.requestReferenceSpace('local');
          if(!current()){await stop('obsolete');return false;}
          scope.listen(reference,'reset',recenter);
          scope.listen(session,'visibilitychange',()=>{if(session.visibilityState!=='visible'){tracking=false;pause();ctx.setPauseReason?.('vr-tracking',true);}});
          scope.listen(session,'select',select);scope.listen(session,'inputsourceschange',()=>input.reset());
          ctx.screenLayout?.setPanelLayer?.('vr',true);phase='presenting';frameHandle=session.requestAnimationFrame(frame);return true;
        }catch(error){
          if(!session&&(phase==='ending'||phase==='closed')){finish();return false;}
          if(phase==='requesting')phase='prepared';
          if(phase!=='ending'&&phase!=='closed')stop('start-failed');
          await closed;throw error;
        }
      })();return startPromise;
    },
    snapshot:()=>({active:phase!=='closed',started:phase==='presenting',kind:'tracked',phase,tracking,userPaused,calibrated,input:input.snapshot(),gaze:controls.snapshot?.(),ride:ride?.snapshot()||null,reason,
      eyeSeparationWorld:arrayCamera.cameras.length===2?arrayCamera.cameras[0].position.distanceTo(arrayCamera.cameras[1].position):null})
  };
  scope.listen(world.signal,'abort',()=>stop('environment-changed'));
  scope.listen(target,'pagehide',()=>stop('page-hidden'));
  scope.listen(target,'keydown',event=>{if(event.code==='Escape')stop('escape');},{capture:true});
  scope.listen(target,'blur',()=>{if(phase==='presenting')pause();});
  return Object.freeze(api);
}
