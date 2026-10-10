import {marineStudyOffset} from '../ocean/habitat-plan.js';
import {COASTAL_INVESTIGATION,INVESTIGATION_CONCLUSIONS,investigationState,investigationRecord,investigationEventIds,contactAdmission,contactLineClear} from './coastal-investigation.js';
export function createCoastalInvestigation(ctx,{store,coastal,atLab,now=Date.now}){
 let records=[],state=investigationState(),ready=false,busy=false,failure=false,message='',generation=0,selected='habitat',conclusion='unknown',pendingReturn=null;
 const mode=()=>ctx.oceanMode,voyage=()=>ctx.oceanVoyage?.current;
 const same=()=>state.started&&voyage()?.id===state.voyage.id&&voyage()?.ship.transportEntityId===state.voyage.ship.transportEntityId&&voyage()?.subId===state.voyage.subId;
 const active=()=>!ctx.paused&&!ctx.sharedMarine?.active;
 const loaded=()=>mode()?.active&&mode().habitat?.group.userData.habitat.assetState==='ready';
 const actor=()=>mode()?.diver?.active?mode().diver.navigationActor():mode()?.submarine;
 const target=()=>mode()?.habitat?.plan.contacts?.find(t=>t.id===(state.completed?selected:state.selected||selected));
 const studyPosition=p=>{const off=marineStudyOffset(mode()?.launchSite||voyage()?.site,ctx.SCALE);return {x:p.x-off.x,y:p.y,z:p.z-off.z};};
 const units=()=>ctx.METERS_PER_WORLD_UNIT||1;
 const targets=()=>mode()?.habitat?.plan.contacts||[];
 async function refresh(){const token=++generation;try{const values=await store().getEventsById(investigationEventIds);if(token===generation){records=values;state=investigationState(values);ready=true;}return true;}catch{if(token===generation){ready=false;failure=true;message='The investigation Journal could not be read. Retry; saved evidence is kept.';}return false;}}
 function admission(diver=false){return contactAdmission({actor:actor(),target:target(),units:units(),range:diver?6:COASTAL_INVESTIGATION.rangeMeters,diver,paused:!active(),ready:ready&&loaded()&&same()&&!!mode().diver?.active===diver,lineClear:(from,to)=>contactLineClear(mode().habitat.plan,mode().habitat.sampleSeabedHeight,from,to)});}
 function choiceAllowed(id){const t=targets().find(t=>t.id===id);return !!t&&-t.y*units()<=42&&-t.y*units()>=2;}
 function gate(action){
  if(!ready||!active())return false;
  if(action==='begin')return state.phase==='available'&&coastal().completed&&loaded()&&!mode().diver?.active&&targets().length===3&&targets().some(t=>choiceAllowed(t.id))&&voyage()?.id===coastal().plan?.metadata.voyageId;
  if(!same())return false;
  if(action==='followup')return state.completed&&admission(true).allowed;
  if(action==='ping')return state.phase==='sonar'&&admission().allowed;
  if(action==='chart')return state.phase==='chart'&&loaded()&&!mode().diver?.active;
  if(action==='select')return state.phase==='selection'&&loaded()&&!mode().diver?.active&&choiceAllowed(selected);
  if(action==='observe')return state.phase==='dive'&&admission(true).allowed&&(!state.views.length||Math.hypot(studyPosition(actor().position).x-state.views[0].metadata.studyPosition.x,studyPosition(actor().position).z-state.views[0].metadata.studyPosition.z)>=3);
  if(action==='return')return state.phase==='return'&&loaded()&&pendingReturn?.voyageId===voyage().id&&pendingReturn.at>=state.views.at(-1).occurredAt&&!mode().diver?.active;
  if(action==='partial')return !state.completed&&atLab()&&ctx.boatMode?.moored===true;
  if(action==='report')return state.phase==='report'&&atLab()&&ctx.boatMode?.moored===true&&conclusion===state.selected;
  return false;
 }
 async function save(part,detail,metadata={}){
  if(mode()?.active)ctx.oceanVoyage?.checkpoint?.();else ctx.oceanVoyage?.surfaceCheckpoint?.();
  const value=investigationRecord(part,{voyage:voyage(),position:part==='return'&&pendingReturn?pendingReturn.position:mode()?.active?actor()?.position:{x:ctx.boat.x,y:ctx.boat.y||0,z:ctx.boat.z},now:Math.max(now(),...records.map(e=>e.occurredAt)),detail,metadata});
  const result=await store().recordExplorerEvent(value);
  if(!result.recorded&&result.reason!=='already-recorded')throw Error('Journal refused record');
  if(result.event?.sourceSystem!=='coastal-investigation'||result.event.activityId!==value.activityId)throw Error('Conflicting record');
  if(!await refresh())throw Error('Save confirmation unavailable');
  message=store().type==='IndexedDbDiscoveryProfileStore'?'Saved to this device’s Journal.':'Session only · export your Journal before leaving.';
  return true;
 }
 async function act(action){
  if(busy)return false;busy=true;failure=false;message='';
  try{
   if(action==='retry')return await refresh();
   if(!await refresh())return false;
   if(action==='resume'){const saved=state.resumeVoyage||coastal().resumeVoyage;const resumed=!!(saved&&active()&&await ctx.oceanVoyage?.resume(saved));if(!resumed){failure=true;message='The investigation voyage could not be restored. Its saved records are kept.';}return resumed;}
   if(!gate(action)){failure=true;message=action==='report'?'That conclusion is not supported by your observations. Compare the two views with the contact shape.':action==='observe'&&state.views.length?'Move at least 3 m around the target for a second viewpoint, then stop and face it.':'Follow the current step aboard your saved research voyage.';return false;}
   if(action==='begin')return await save('brief','Chart three geometry-sonar returns, inspect one from two viewpoints, then compare findings at the lab. Keep air and the return route in view. Authored game study; sonar shape alone cannot identify a target.');
   if(action==='ping'){
    const t=target(),a=admission();
    const result=await save(`contact:${t.id}`,`${t.code}: ${t.returnShape}. Geometry sonar · ${Math.round(a.distance)} m. Identity remains uncertain until directly observed.`,{sensor:'geometry-sonar',target:{id:t.id,x:t.x,y:t.y,z:t.z,radius:t.radius,returnShape:t.returnShape},distanceMeters:a.distance});
    selected=COASTAL_INVESTIGATION.contacts.find(id=>!state.contacts.some(e=>e.metadata.target.id===id))||selected;return result;
   }
   if(action==='chart')return await save('chart','Three contacts saved to the local chart. Contact annotations are now shown on the seabed map. Survey scuba is available on this outing: game depth rating 42 m, 300 seconds of air.',{upgradeId:'coastal-contact-annotations'});
   if(action==='select')return await save('selection',`Dive ${target().code}: ${target().returnShape}. Park at 1–16 m SIM depth. Take two views and board the same submarine. Assisted recovery keeps the evidence but does not earn the return badge.`,{targetId:selected});
   if(action==='followup'){const t=target(),a=admission(true);return await save(`followup:${t.id}:${Math.floor(now()/3600000)}`,`${t.code}: ${t.evidence} Follow-up game observation; no measured ecological change is claimed.`,{sensor:'diver-observation',studyPosition:studyPosition(actor().position),targetId:t.id,distanceMeters:a.distance});}
   if(action==='observe'){const t=target(),a=admission(true);return await save(`view:${state.views.length+1}`,`${t.code}: ${t.evidence} Direct game observation from ${Math.round(a.distance)} m.`,{sensor:'diver-observation',studyPosition:studyPosition(actor().position),targetId:t.id,distanceMeters:a.distance});}
   if(action==='return')return await save('return','Two observations retained after boarding the same submarine without recovery assistance. Diver badge earned; a survey reserve adds 60 seconds of game air on the next dive.',{returnedNormally:true,upgradeId:'survey-air-reserve'});
   if(action==='partial')return await save(`partial:${state.contacts.length+state.views.length}`,`Partial report: ${state.contacts.length}/3 sonar returns, ${state.views.length}/2 direct views. Identity remains unconfirmed. Redeploy from this vessel to continue.`,{evidenceCount:state.contacts.length+state.views.length,conclusion:'unknown'});
   if(action==='report')return await save('report',`${INVESTIGATION_CONCLUSIONS[conclusion]}. Compared 3 sonar returns and 2 direct views. Other contacts remain unconfirmed. Coastal Explorer earned. Authored game study, not a real-world scientific finding.`,{conclusion,followup:conclusion==='habitat'?'Compare colony structure without collecting.':conclusion==='rock'?'Compare the exposed surfaces of nearby outcrops.':'Document the case in place; do not treat modern equipment as a historic artifact.'});
   return false;
  }catch{failure=true;message='The step could not be saved. Retry; your existing evidence has not been removed.';return false;}finally{busy=false;if(action!=='return'&&state.phase==='return'&&pendingReturn?.at>=state.views.at(-1).occurredAt&&!mode()?.diver?.active)queueMicrotask(()=>void act('return'));}
 }
 function snapshot(){
  const s=state,t=target(),a=admission(s.phase==='dive'||s.completed);let action=null,label='',instruction='';
  if(!ready){action='retry';label='Retry Journal';instruction='Loading your investigation…';}
  else if(s.phase==='unavailable')instruction='This record cannot be read safely. Keep the backup; free exploration remains available.';
  else if(s.phase==='available'&&voyage()?.id!==coastal().plan?.metadata.voyageId){action='resume';label='Return to coastal vessel';instruction='Begin this investigation aboard your Coastal Departure voyage.';}
  else if(s.phase==='available'){action='begin';label='Begin seabed investigation';instruction='Read the Seabed · chart three returns, choose one to dive and compare your findings at the lab.';}
  else if(!same()){action='resume';label='Return to investigation vessel';instruction='Your investigation belongs to a saved voyage. Resume its vessel and submarine to continue.';}
  else if(!mode()?.active&&!s.completed){action=s.diver?'report':'partial';label=s.diver?'File coastal report':'Save partial report';instruction=s.diver?'Compare the sonar shapes with your two direct observations. Select the conclusion supported by the evidence.':'Your evidence is kept. Review a partial report at the wet lab, or redeploy the submarine to continue.';}
  else if(s.phase==='sonar'){action='ping';label='Record sonar return';instruction=`${s.contacts.length}/3 charted · search the ${selected==='habitat'?'western':selected==='rock'?'central':'eastern'} study sector. ${a.reason}`;}
  else if(s.phase==='chart'){action='chart';label='Save annotated chart';instruction='Three returns recorded. Save the chart to mark contacts on the map and prepare survey scuba.';}
  else if(s.phase==='selection'){action='select';label='Choose dive target';instruction='Select a charted contact for a closer look. The return shape is a clue, not an identification.';}
  else if(s.phase==='dive'){action='observe';label=`Record viewpoint ${s.views.length+1}/2`;instruction=mode()?.diver?.active?`${s.views.length}/2 views saved. ${s.views.length?'Move around the contact for a different view. ':''}${a.reason}`:'Park at 1–16 m simulated depth in clear water. Leave the submarine, approach the selected contact, then return here. Survey scuba equips automatically.';}
  else if(s.phase==='return'&&pendingReturn){action='return';label='Retry return record';instruction='You boarded your submarine. Confirm the return record before continuing.';}
  else if(s.phase==='return')instruction='Both views are saved. Swim back within 8 m of the parked submarine and use Board submarine. Recovery keeps the views; return unaided on another dive to earn Diver.';
  else if(s.phase==='report')instruction='Diver badge earned. Recover to the vessel, walk to the wet lab and compare your findings.';
  else {action=mode()?.active?'followup':null;label='Record coastal watch';instruction=mode()?.active?`Coastal watch · choose a contact and dive for a follow-up observation. One record per contact per hour; no extra reward. ${a.reason}`:'Coastal Explorer · report saved. Display it at your home desk. Redeploy for Coastal watch: revisit any charted contact for a direct observation.';}
  if(mode()?.active&&mode().habitat?.group.userData.habitat.assetState==='unavailable'){action=null;instruction='Survey objects could not load. Recover to the vessel, then redeploy to retry. Your saved evidence is kept.';}
  else if(mode()?.active&&s.phase==='available'&&loaded()&&(targets().length!==3||!targets().some(t=>choiceAllowed(t.id)))){action=null;instruction='This scene has no supported shallow investigation target. Recover to the vessel and return to the Coral Shelf station.';}
  const p=actor()?.position,bearing=t&&p?((180-Math.atan2(t.x-p.x,t.z-p.z)*180/Math.PI)%360+360)%360:null;
  const guidance=t&&mode()?.active&&['sonar','selection','dive','complete'].includes(s.phase)?`${s.chart?t.code:'Study sector'} · ${Math.round(Math.hypot(t.x-p.x,t.z-p.z)*units())} m · ${Math.round(bearing)}° · SIM depth ${Math.round(-t.y*units())} m`:'';
  return {...s,ready,busy,failure,message,instruction,guidance,action,label,allowed:action==='retry'||action==='resume'&&active()||gate(action),visible:!ctx.sharedMarine?.active&&!!voyage()&&(s.started||coastal().completed)&&!!(mode()?.active||ctx.boatDeck?.active),selected:state.completed?selected:state.selected||selected,canChoose:['sonar','selection','complete'].includes(s.phase)&&!!mode()?.active,choices:targets().map(t=>({id:t.id,label:`${t.code} · ${s.chart||s.contacts.some(e=>e.metadata.target.id===t.id)?t.returnShape:'Uncharted sector'}`,allowed:s.phase!=='selection'||choiceAllowed(t.id)})),conclusion,canConclude:s.phase==='report'&&!mode()?.active,conclusions:INVESTIGATION_CONCLUSIONS,evidence:[...s.contacts,...s.views].map(e=>e.detail),annotations:s.chart?targets().filter(t=>s.contacts.some(e=>e.metadata.target.id===t.id)).map(t=>({id:t.id,code:t.code,x:t.x,y:t.y,z:t.z,selected:s.selected===t.id,label:s.selected===t.id&&s.views.length?t.conclusion:t.returnShape})):[],storage:store().type==='IndexedDbDiscoveryProfileStore'?'device':'session'};
 }
 return {refresh,act,snapshot,onBoard(){const diver=mode()?.diver;if(ready&&same()&&active()&&['dive','return'].includes(state.phase)&&diver?.active&&diver.snapshot().returnTarget==='submarine'&&diver.snapshot().distanceToSubMeters<=8){pendingReturn={voyageId:voyage().id,position:{...diver.navigationActor().position},at:Math.max(now(),...records.map(e=>e.occurredAt))};if(!busy&&state.phase==='return')queueMicrotask(()=>void act('return'));}},select:id=>{if(COASTAL_INVESTIGATION.contacts.includes(id))selected=id;},conclude:id=>{if(Object.hasOwn(INVESTIGATION_CONCLUSIONS,id))conclusion=id;},diveEquipment:()=>same()&&state.chart?{airCapacity:state.diver?360:300,maximumDiveMeters:42}:null};
}
