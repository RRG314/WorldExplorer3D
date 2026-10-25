import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';
import {capturePresentation} from '../runtime/renderer-owners.js';
import {createPhoneStereo} from './phone-stereo.js';
import {createPhoneHeadTracking} from './phone-head-tracking.js';
import {createVrGazeControls} from './gaze-controls.js';
import {applyVrGameMount,vrMountEligibility} from './game-mount.js';
import {roadRideMustPause,roadRideMessage} from './road-ride.js';

export function createPhoneVrSession({ctx,THREE,optics,captureSession,ride=null,target=window,onExit=()=>{},createStereo=createPhoneStereo,createTracking=createPhoneHeadTracking,createControls=createVrGazeControls}){
  if(ctx.vrPresentation?.active)throw new Error('A VR view is already open.');
  if(!ctx.gameStarted||ctx.worldLoading||ctx.titleLaunchPending||ctx.arSessionActive||ctx.fishingGame?.open||ctx.blockBuildMode)throw new Error('Close the current activity and finish loading a world before entering VR.');
  if(ctx.getLiveGpsSnapshot?.().active)throw new Error('Stop live GPS movement before entering a seated VR view.');
  const admission=vrMountEligibility(ctx);if(!admission.eligible)throw new Error(admission.reason);
  let presentation=capturePresentation(ctx);if(presentation.owner!=='main'||!presentation.renderer||!presentation.scene||!presentation.camera)throw new Error('The current renderer cannot enter this phone view.');
  const world=captureSession(),scope=createLifecycleScope('vr-phone-session'),units=ctx.WORLD_UNITS_PER_METER;
  scope.defer(()=>ride?.dispose());
  const mount=new THREE.PerspectiveCamera(),head=new THREE.Quaternion(),mountPosition=new THREE.Vector3(),mountQuaternion=new THREE.Quaternion();
  let active=true,started=false,tracking=false,userPaused=true;
  const oldCamera={up:presentation.camera.up.clone(),near:presentation.camera.near};let body=ctx.planeMode?.active?ctx.planeMode.mesh:null;const oldVisible=body?.visible;
  const viewport={width:target.innerWidth,height:target.innerHeight};
  const mountBody=()=>admission.control.mode==='drive'?ctx.carMesh:admission.control.mode==='walk'?ctx.Walk?.state?.walker:ctx.planeMode;
  let originalBody=mountBody();
  const current=()=>{
    const next=vrMountEligibility(ctx),layer=ctx.screenLayout?.getPanelLayer?.();
    return active&&ctx.gameStarted&&world.isCurrent()&&presentation.isCurrent()&&!ctx.worldLoading&&!ctx.titleLaunchPending&&!ctx.arSessionActive&&!ctx.getLiveGpsSnapshot?.().active&&!ctx.showLargeMap&&!ctx.fishingGame?.open&&!ctx.blockBuildMode&&
      (!started||layer===undefined||layer==='vr')&&
      next.eligible&&next.control.mode===admission.control.mode&&next.control.occupancy===admission.control.occupancy&&next.control.frame===admission.control.frame&&mountBody()===originalBody;
  };
  const stop=(reason='user-exit')=>{
    if(!active)return false;active=false;scope.dispose(reason);
    if(ctx.vrPresentation===api)ctx.vrPresentation=null;
    ctx.setPauseReason?.('vr-tracking',false);ctx.setPauseReason?.('vr-user',false);ctx.clearControlInputState?.('vr-exit');
    ctx.screenLayout?.setPanelLayer?.('vr',false);
    presentation.camera.up.copy(oldCamera.up);presentation.camera.near=oldCamera.near;presentation.camera.updateProjectionMatrix();
    if(body)body.visible=oldVisible;presentation=body=originalBody=null;onExit(reason);return true;
  };
  const tracker=createTracking({THREE,target,isCurrent:current});scope.defer(()=>tracker.dispose());
  let stereo,controls;
  try{
    stereo=createStereo({THREE,renderer:presentation.renderer,optics,worldUnitsPerMeter:units});scope.defer(()=>stereo.dispose());
    controls=createControls({THREE,scene:presentation.scene,worldUnitsPerMeter:units,onAction:action=>{
      if(action==='exit'){stop();return;}
      if(action==='recenter'){tracker.recenter();controls.reset();return;}
      if(action==='toggle'){
        if(userPaused&&roadRideMustPause(ride))ride.takeManual();
        userPaused=!userPaused;ctx.setPauseReason?.('vr-user',userPaused);
        if(!userPaused&&ctx.hasPauseReason?.('manual_pause')){ctx.setPauseReason('manual_pause',false);target.document.getElementById('pauseScreen')?.classList.remove('show');}
        ctx.clearControlInputState?.('vr-toggle');
      }
    }});scope.defer(()=>controls.dispose());
  }catch(error){scope.dispose('preparation-failed');active=false;throw error;}
  const api={
    get active(){return active;},kind:'phone',headTracking:true,stop,
    guard(){if(!current()){stop('world-or-mode-changed');return false;}return true;},
    readActions:(mode,manual)=>ride?.readActions(mode,manual)||null,
    beforeInput(frame){
      if(!api.guard())return;const previous=tracking;tracking=tracker.read(head);ctx.setPauseReason?.('vr-tracking',!tracking);
      if(previous&&!tracking){userPaused=true;ctx.setPauseReason?.('vr-user',true);ctx.clearControlInputState?.('vr-tracking');controls.reset();}
      ride?.step(frame,tracking&&!userPaused&&!ctx.paused);
      if(!userPaused&&roadRideMustPause(ride)){userPaused=true;ctx.setPauseReason?.('vr-user',true);ctx.clearControlInputState?.('vr-ride-stopped');}
      if((!tracking||userPaused)&&frame?.flags)frame.flags.simulationBlocked=true;
    },
    updateCamera(frame){
      if(!api.guard())return false;
      applyVrGameMount(THREE,ctx,mount);mountPosition.copy(mount.position);mountQuaternion.copy(mount.quaternion);
      const camera=presentation.camera;camera.position.copy(mount.position);camera.quaternion.copy(mount.quaternion).multiply(head);camera.updateMatrixWorld(true);
      if(body)body.visible=false;
      controls.update({mountPosition,mountQuaternion,camera,timestamp:frame.timestamp,paused:ctx.paused,tracking,message:roadRideMessage(ride,ctx.paused)});return true;
    },
    render(){if(api.guard())stereo.render(presentation.scene,presentation.camera);},
    async start(){
      if(!active)return false;if(started)return true;
      // Permission invocation is before the first await of this method.
      const allowed=await tracker.enable();
      if(!allowed||!current()){stop(allowed?'obsolete':'motion-unavailable');return false;}
      viewport.width=target.innerWidth;viewport.height=target.innerHeight;
      started=true;ctx.clearControlInputState?.('vr-enter');ctx.vrPresentation=api;ctx.setPauseReason?.('vr-user',true);ctx.setPauseReason?.('vr-tracking',true);ctx.screenLayout?.setPanelLayer?.('vr',true);
      presentation.renderer.domElement.classList.add('vrMainCanvas');scope.defer(()=>presentation.renderer.domElement.classList.remove('vrMainCanvas'));
      return true;
    },
    snapshot:()=>({active,started,tracking,userPaused,kind:'phone',stereo:stereo.snapshot(),sensor:tracker.snapshot(),ride:ride?.snapshot()||null})
  };
  scope.listen(world.signal,'abort',()=>stop('environment-changed'));
  scope.listen(target,'keydown',event=>{if(started&&event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();stop('escape');}},{capture:true});
  scope.listen(target,'resize',()=>{if(started&&(target.innerWidth!==viewport.width||target.innerHeight!==viewport.height))stop('viewport-changed');});
  scope.listen(target.screen?.orientation,'change',()=>{if(started)stop('screen-rotated');});
  scope.listen(target,'pagehide',()=>stop('page-hidden'));
  scope.listen(target,'blur',()=>{if(started){userPaused=true;ctx.setPauseReason?.('vr-user',true);ctx.clearControlInputState?.('vr-focus-lost');}});
  scope.listen(target.document,'pointerdown',event=>{
    if(started&&event.target===presentation.renderer.domElement){event.preventDefault();event.stopImmediatePropagation();controls.select();}
  },{capture:true});
  scope.listen(target.document,'visibilitychange',()=>{if(target.document.hidden){userPaused=true;ctx.setPauseReason?.('vr-user',true);ctx.clearControlInputState?.('vr-hidden');}});
  return Object.freeze(api);
}
