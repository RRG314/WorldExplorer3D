import {captureEnvironmentSession} from '../session-coordinator.js?v=2';
import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';
import {resolveControlState} from './control-state.js';
import {personalVehicleById,personalVehicleIdentity,normalizeVehicleGarage} from './vehicle-garage-rules.js';
import {commitExplorerVehicleAction} from '../../../js/player-state-api.js?v=1';
import {getCurrentUser} from '../../../js/auth-ui.js?v=56';

// Commands/projected view only: the existing wallet/player record owns the
// collection, urban transport owns the live car, and the model cache owns GLBs.
export function createPersonalVehicleRuntime(options) {
  const {context:c,state}=options,scope=createLifecycleScope('personal-vehicles:'+state.worldIdentity);
  let serial=0,pending=null,checkpointElapsed=0,lastCondition=null,starterHydrated=false;
  let uid=String(getCurrentUser()?.uid||'');
  const current=()=>scope.isActive()&&options.isCurrent()&&String(getCurrentUser()?.uid||'')===uid;
  const snapshot=()=>String(getCurrentUser()?.uid||'')!==uid?normalizeVehicleGarage():uid?state.vehicleUpgradeStore.garageSnapshot():state.commerce.vehicleGarage();
  const homes=()=>c.getExplorerPropertySnapshot?.()?.homes?.filter(h=>h.owned||(!uid&&h.shared!==true))||[];
  async function change(command) {
    if(!current()&&!(command.action==='park'&&scope.isActive()&&String(getCurrentUser()?.uid||'')===uid))return {ok:false,reason:'world_changed'};
    if(uid&&state.vehicleUpgradeStore.garageLoaded===false)return {ok:false,reason:'garage_loading'};
    const request={...command,expectedRevision:snapshot().revision,requestId:command.requestId||`garage:${crypto.randomUUID()}`};
    if(!uid)return state.commerce.changeVehicleGarage(request,id=>homes().some(h=>(h.worldPropertyId||h.id)===id));
    const result=await commitExplorerVehicleAction({...request,expectedUserId:uid});
    if(current()&&result?.ok)state.vehicleUpgradeStore.hydrateGarage(result.garage);
    return current()?result:{ok:false,reason:'world_changed'};
  }
  async function checkpoint(force=false) {
    const car=state.activeVehicle||(c.car.personalVehicleId?c.car:null);
    if(!scope.isActive()||String(getCurrentUser()?.uid||'')!==uid||!car?.personalVehicleId)return;
    const condition=Math.max(0,Math.min(1,Number((current()?c.car.condition:car.condition)??1)));
    if(car.personalVehicleId==='bmw_e34')state.defaultCarCondition=condition;
    const saved=snapshot().vehicles[car.personalVehicleId];
    if(!saved||condition>=saved.condition||(!force&&condition>.05&&saved.condition-condition<.02)||lastCondition===`${car.personalVehicleId}:${condition}`)return;
    lastCondition=`${car.personalVehicleId}:${condition}`;
    try{const result=await change({action:'park',vehicleId:car.personalVehicleId,condition});if(!result.ok)lastCondition=null;}
    catch{lastCondition=null;}
  }
  async function selectAndDrive(id) {
    if(pending)return {ok:false,reason:'vehicle_preparing'};
    if(uid&&state.vehicleUpgradeStore.garageLoaded===false)return {ok:false,reason:'garage_loading'};
    const definition=personalVehicleById(id),record=snapshot().vehicles[id],control=resolveControlState(c);
    if(!definition||!record)return {ok:false,reason:'vehicle_not_owned'};
    if(control.frame!=='surface'||!['walk','drive'].includes(control.locomotion)||!['ground','driver'].includes(control.occupancy)||c.onMoon||c.onMars||c.worldLoading)
      return {ok:false,reason:'leave_current_vehicle_or_interior'};
    if(state.transition||Math.abs(Number(c.car.speed||0))>4)return {ok:false,reason:'stop_before_switching'};
    if(state.activeVehicle?.personalVehicleId===id)return {ok:true,vehicleId:id};
    const actorAtDeparture=c.activeTransportActor?.();
    if(!actorAtDeparture?.position)return {ok:false,reason:'no_safe_road'};
    const departure={locomotion:actorAtDeparture.locomotion,position:{...actorAtDeparture.position}},departureVehicle=state.activeVehicle;
    const session=captureEnvironmentSession(),run=++serial,request=new AbortController();
    const cancel=()=>request.abort();session.signal.addEventListener('abort',cancel,{once:true});
    pending=request;const valid=()=>{
      const actor=c.activeTransportActor?.();
      return current()&&session.isCurrent()&&serial===run&&!request.signal.aborted&&
        actor?.locomotion===departure?.locomotion&&state.activeVehicle===departureVehicle&&
        Math.abs(Number(c.car.speed||0))<=4&&Math.hypot((actor?.position?.x??NaN)-departure.position.x,(actor?.position?.z??NaN)-departure.position.z)<.75;
    };
    let prepared=null,claimed=false,adopted=false;
    try{
      const reference=c.activeTransportActor?.()?.position||c.car;
      let spawn=c.resolveSafeWorldSpawn?.(reference.x,reference.z,{mode:'drive',angle:c.car.angle,
        feetY:reference.y-1.2,preferRoad:true,maxRoadDistance:35,maxGroundRadius:18,requireSafeCandidate:true,
        source:'personal_vehicle_selection'});
      if(!spawn?.valid)return {ok:false,reason:'no_safe_road'};
      if(!definition.defaultVisual){
        prepared=await options.prepare(definition,record,spawn,{signal:request.signal,isCurrent:valid});
        if(!prepared||!valid())return {ok:false,reason:'vehicle_model_unavailable'};
        const claim=await state.roomAuthorityRuntime.claimPreparedVehicle(prepared);
        if(!claim?.accepted)return {ok:false,reason:claim?.reason||'room_vehicle_unavailable'};
        claimed=true;
        if(Number.isFinite(claim.state?.condition))prepared.condition=claim.state.condition;
        if(claim.state?.pose){
          options.applyPublishedPose(prepared,claim.state.pose);
          spawn={...spawn,x:claim.state.pose.x,z:claim.state.pose.z,carY:claim.state.pose.y,angle:claim.state.pose.yaw};
        }
      }
      if(!valid())return {ok:false,reason:'world_changed'};
      const saved=await change({action:'select',vehicleId:id});
      if(!saved.ok)return saved;
      if(!valid())return {ok:false,reason:'world_changed'};
      // All awaited work is complete before the synchronous presentation/control
      // handoff. A model error leaves the previous controller and mesh intact.
      options.releaseCurrent();
      if(c.setTravelMode?.('drive',{source:'personal_vehicle_selection'})!=='drive')return {ok:false,reason:'travel_denied'};
      if(prepared){options.mount(prepared);state.roomAuthorityRuntime.adoptPreparedVehicle(prepared);adopted=true;}
      else options.restoreDefault(spawn,record);
      c.applyResolvedWorldSpawn?.(spawn,{mode:'drive',syncCar:true,syncWalker:false});
      c.updateControlsModeUI?.();
      return {ok:true,vehicleId:id,assetId:definition.assetId};
    }catch(error){return {ok:false,reason:error?.name==='AbortError'?'world_changed':error.message||'vehicle_unavailable'};}
    finally{
      session.signal.removeEventListener('abort',cancel);pending=null;
      if(prepared&&!adopted){if(claimed)state.roomAuthorityRuntime.releasePreparedVehicle(prepared);options.dispose(prepared);}
    }
  }
  scope.defer(()=>{serial++;pending?.abort();},'prepared-vehicle');
  return Object.freeze({snapshot,homes,change,selectAndDrive,checkpoint,
    rebindOwner(nextUid){serial++;pending?.abort();uid=String(nextUid||'');lastCondition=null;starterHydrated=false;},
    cancelSelection(){serial++;pending?.abort();},
    update(dt){
      if(!starterHydrated&&current()&&!state.activeVehicle&&(!uid||state.vehicleUpgradeStore.garageLoaded!==false)){
        const saved=snapshot().vehicles.bmw_e34;
        c.car.condition=saved.condition;c.car.personalVehicleId='bmw_e34';state.defaultCarCondition=saved.condition;starterHydrated=true;
      }
      checkpointElapsed+=dt;if(checkpointElapsed>=5){checkpointElapsed=0;void checkpoint();}
    },
    dispose(){void checkpoint();scope.dispose('world-retired');},
    identity:personalVehicleIdentity});
}
