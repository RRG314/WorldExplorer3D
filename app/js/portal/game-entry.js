import {PORTAL_CATALOG} from './catalog.js';
import {portalDeviceProfile,portalOffer,resolvePortalGameIntent} from './game-intent.js';
import {evaluatePortalWorldReadiness,portalLocationsMatch} from '../earth-core/portal-destination-policy.js';
import {portalOwnerScope} from './trail-model.js';
import {resolveControlState} from '../transport/control-state.js';
import {captureEnvironmentSession} from '../session-coordinator.js?v=2';
import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';

// Owns one launch intent, not a loader, clock, actor or persistent state store.
// Title launch and the existing surface arrival owner retain those authorities.
export function createPortalGameEntry(ctx,{search=globalThis.location?.search,catalog=PORTAL_CATALOG,
  deviceProfile=portalDeviceProfile(),now=Date.now,captureSession=captureEnvironmentSession,
  visible=()=>globalThis.document?.hidden!==true,recordVisit,onNotice=message=>ctx.showToast?.(message)}={}){
  const scope=createLifecycleScope('portal-game-entry');
  const intent=resolvePortalGameIntent(search,catalog,{now:now(),deviceProfile});
  let generation=0,unregister=null,pendingScope=null,disposed=false;
  const reset=()=>{generation++;unregister?.();unregister=null;pendingScope?.dispose('entry retired');pendingScope=null;};
  scope.defer(reset);
  function selectionMatches(){
    const selected=ctx.resolveLocationSelection?.(),origin=intent?.place?.destination.origin;
    return portalLocationsMatch(selected,origin);
  }
  function begin(launchMode){
    reset();
    if(disposed||!intent?.decision.eligible||launchMode!=='earth'||ctx.gameMode!=='free'||!selectionMatches())return null;
    const current=portalOffer(intent.place,catalog,{now:now(),deviceProfile});
    if(!current.decision.eligible)return null;
    return Object.freeze({generation,ownerUid:ctx.getAccountUserId?.()||null,
      selection:ctx.getLocationSelectionSignature?.(),qualification:current.qualification});
  }
  function arm(ticket,loadResult){
    if(!ticket||disposed||unregister||ticket.generation!==generation||!selectionMatches()||
      (ctx.getAccountUserId?.()||null)!==ticket.ownerUid)return false;
    const {destination}=intent.place,context={now:now(),deviceProfile,renderContractVersion:ticket.qualification.renderContractVersion,contentVersion:destination.contentVersion};
    if(!evaluatePortalWorldReadiness(ctx,loadResult,destination,ticket.qualification,context).eligible)return false;
    // The loaded world may legitimately be water or an interior. Do not force
    // that actor into a generic ground pose to satisfy a Portal destination.
    const control=resolveControlState(ctx);
    if(control.frame!=='surface'||!['walk','drive'].includes(control.locomotion)||ctx.activeInterior||ctx.sharedMarine?.active)return false;
    const point=ctx.geoToWorld?.(destination.arrival.lat,destination.arrival.lon);
    if(!point||![point.x,point.z].every(Number.isFinite)||
      ctx.restoreSurfaceTravelPose?.(destination.arrival.mode,{x:point.x,z:point.z},{source:'portal_arrival',emitTutorial:false})!==true)return false;
    const body=destination.arrival.mode==='walk'?ctx.Walk?.state?.walker:ctx.car;
    const units=Number(ctx.WORLD_UNITS_PER_METER)||1/1.11;
    const near=()=>body&&Number.isFinite(body.y)&&Math.hypot(body.x-point.x,body.z-point.z)<=16*units;
    if(!near())return false;
    const session=captureSession(),publication=ctx.worldPublication,version=generation;
    pendingScope=createLifecycleScope('portal-awaiting-presentation');
    if(session.signal)pendingScope.listen(session.signal,'abort',reset,{once:true});
    const isCurrent=()=>!disposed&&version===generation&&session.isCurrent()&&ctx.worldPublication===publication&&
      !ctx.worldLoading&&ctx.gameStarted&&!ctx.gameEnded&&ctx.gameMode==='free'&&
      (ctx.getAccountUserId?.()||null)===ticket.ownerUid&&selectionMatches()&&
      ticket.selection===ctx.getLocationSelectionSignature?.()&&resolveControlState(ctx).locomotion===destination.arrival.mode&&
      resolveControlState(ctx).frame==='surface'&&!ctx.activeInterior&&
      (destination.arrival.mode==='walk'?ctx.Walk?.state?.walker:ctx.car)===body;
    unregister=ctx.registerRuntimeSystem({id:'portal.admitted-presentation',owner:'portal',phase:'render',priority:100,critical:false,
      update(frame){
        if(!isCurrent()){reset();return;}
        if(frame.flags.mainWorldPresented!==publication||!visible()||ctx.titleLaunchPending||!near())return;
        const offer=portalOffer(intent.place,catalog,{now:now(),deviceProfile,evidenceId:ticket.qualification.evidenceId});
        if(!offer.decision.eligible){reset();return;}
        reset();
        const claim={operationId:crypto.randomUUID(),kind:'visit',destinationId:destination.id,createdAt:now(),
          destinationRevision:destination.revision,contentVersion:destination.contentVersion,
          qualificationId:ticket.qualification.evidenceId,deviceProfile,worldRequestId:publication.requestId,arrivalMode:destination.arrival.mode};
        // Persist under the initiating owner even if an account changes while
        // IndexedDB commits. Synchronization independently pins that owner.
        void Promise.resolve().then(()=>recordVisit(portalOwnerScope(ticket.ownerUid),claim)).then(()=>{
          if(!disposed)onNotice('3D visit saved to your Exploration Trail.');
        }).catch(()=>{if(!disposed)onNotice('The world is open, but your Trail visit could not be saved.');});
      }});
    return true;
  }
  return Object.freeze({intent,begin,arm,cancel:reset,dispose(){if(disposed)return;disposed=true;scope.dispose('portal entry closed');}});
}
