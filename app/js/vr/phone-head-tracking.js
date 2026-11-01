import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';
const radians=value=>value*Math.PI/180;

// Rotation-only phone view. Device orientation is converted to camera axes;
// neither GPS nor these events write an actor or provide positional tracking.
export function createPhoneHeadTracking({THREE,target=window,isCurrent=()=>true,now=()=>performance.now(),onState=()=>{}}){
  const scope=createLifecycleScope('vr-phone-head-tracking');
  const basis=new THREE.Quaternion(-Math.SQRT1_2,0,0,Math.SQRT1_2),screenRotation=new THREE.Quaternion(),axis=new THREE.Vector3(0,0,1),euler=new THREE.Euler();
  const sample=new THREE.Quaternion();let neutral=null,at=null,enabled=false,disposed=false,revision=0,status='off',removeSensor=null;
  function state(next){if(status===next)return;status=next;onState(snapshot());}
  function snapshot(){return {enabled,status,tracking:'orientation-only',calibrated:!!neutral};}
  function recenter(){neutral=null;at=null;if(enabled)state('waiting');}
  function receive(event){
    if(!enabled||disposed||!isCurrent()||target.document?.hidden)return;
    if(![event.alpha,event.beta,event.gamma].every(Number.isFinite))return;
    const angle=Number(target.screen?.orientation?.angle??target.orientation)||0;
    euler.set(radians(event.beta),radians(event.alpha),-radians(event.gamma),'YXZ');
    sample.setFromEuler(euler).multiply(basis).multiply(screenRotation.setFromAxisAngle(axis,-radians(angle))).normalize();
    if(!neutral)neutral=sample.clone().invert();at=now();state('active');
  }
  function disable(){revision++;enabled=false;removeSensor?.();removeSensor=null;neutral=null;at=null;state('off');}
  async function enable(){
    if(disposed)return false;if(enabled)return true;
    const token=++revision;
    if(!target.isSecureContext||!target.DeviceOrientationEvent){state('unsupported');return false;}
    try{
      // Keep this call in the user's button gesture for Safari permission.
      const permission=target.DeviceOrientationEvent.requestPermission?.();
      const result=permission?await permission:'granted';
      if(disposed||token!==revision||!isCurrent())return false;
      if(result!=='granted'){state('denied');return false;}
      enabled=true;recenter();removeSensor=scope.listen(target,'deviceorientation',receive);return true;
    }catch{if(!disposed&&token===revision)state('denied');return false;}
  }
  scope.listen(target.screen?.orientation||target,target.screen?.orientation?'change':'orientationchange',recenter);
  scope.listen(target.document,'visibilitychange',()=>{at=null;if(enabled)state(target.document.hidden?'suspended':'waiting');});
  return Object.freeze({enable,disable,recenter,snapshot,
    read(quaternion){
      if(!enabled||disposed||!isCurrent()||target.document?.hidden)return false;
      if(at===null||!neutral)return false;
      if(now()-at>1500||now()<at){state('stale');return false;}
      quaternion.copy(neutral).multiply(sample).normalize();return true;
    },
    dispose(){if(disposed)return;disable();disposed=true;scope.dispose('phone head tracking ended');}
  });
}
