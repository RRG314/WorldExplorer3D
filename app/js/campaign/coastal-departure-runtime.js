import {fetchBundledCoastalDepth} from '../ocean/bundled-depth.js';
import {COASTAL_SITES,coastalDepartureState,coastalEventIds,coastalRecord,coastalConditions,coastalConditionText,coastalDistance,coastalBearing} from './coastal-departure.js';
import {CORAL_SHELF_SITE} from '../ocean/habitat-plan.js';
import {earthLocalToGeographic} from '../earth-core/location-origin.js?v=1';
import {fetchGebcoDepthEvidence} from '../geospatial/bathymetry-evidence.js?v=1';

export function createCoastalDeparture(ctx,{store,survey,now=Date.now,fetchDepth=fetchGebcoDepthEvidence,fetchFallback=fetchBundledCoastalDepth}){
 let records=[],ready=false,busy=false,message='',failure=false,choices=null,selected='shelf',generation=0;
 const state=()=>coastalDepartureState(records),voyage=()=>ctx.oceanVoyage?.current;
 const position=()=>ctx.oceanMode?.active?ctx.oceanMode.submarine?.position:ctx.boat;
 const geo=()=>ctx.oceanMode?.active?ctx.oceanMode.launchSite:earthLocalToGeographic(ctx.LOC,ctx.SCALE,ctx.boat?.x,ctx.boat?.z);
 const inRegion=()=>coastalDistance(geo(),CORAL_SHELF_SITE)<2000;
 const stopped=()=>Math.hypot(ctx.boat?.speed||0,ctx.boat?.vx||0,ctx.boat?.vz||0)*(ctx.METERS_PER_WORLD_UNIT||1)<.5;
 const at=id=>!!ctx.boatDeck?.active&&ctx.boatDeck.stationDistance?.(id)<=2.4&&ctx.boatMode?.active&&stopped()&&ctx.boatMode.moored===true;
 const same=()=>{const s=state(),v=voyage();return !!s.plan&&v?.id===s.plan.metadata.voyageId&&v.ship.transportEntityId===s.plan.metadata.shipId&&v.subId===s.plan.metadata.subId;};
 async function refresh(){const token=++generation;try{const value=await store().getEventsById(coastalEventIds);if(token===generation){records=value;ready=true;}return true;}catch{if(token===generation){ready=false;failure=true;message='The Journal could not be read. Retry; your saved voyage is unchanged.';}return false;}}
 function gate(action){
  const s=state();if(!ready||ctx.paused||ctx.sharedMarine?.active)return false;
  if(action==='sites'||action==='plan')return s.phase==='available'&&inRegion()&&at('chart')&&!!voyage()&&ctx.boatMode.transportEntityId===voyage().ship.transportEntityId;
  if(!same()||s.phase!==action)return false;
  if(action==='station')return at('chart')&&coastalDistance(geo(),s.site)<=80&&survey().started;
  if(action==='ladder')return at('dive');
  if(action==='cradle')return at('sub')&&ctx.boatMode.mesh?.userData.researchSubmarine?.userData.visualLoaded===true;
  if(action==='launch')return ctx.oceanMode?.active===true&&ctx.oceanMode.submarine?.transportEntityId===s.plan.metadata.subId&&ctx.oceanMode.submarine.mesh?.userData.visualLoaded===true&&!ctx.oceanMode.diver?.active;
  return false;
 }
 async function act(action){
  if(busy)return false;busy=true;message='';failure=false;
  try{
   if(action==='retry')return await refresh();
   if(action==='resume'){
    if(!await refresh()||state().completed||!state().resumeVoyage||ctx.sharedMarine?.active||ctx.paused)return false;
    const restored=await ctx.oceanVoyage?.resume(state().resumeVoyage);
    if(!restored){failure=true;message='The vessel could not be restored. Its saved chapter record is retained.';}
    return !!restored;
   }
   if(!await refresh()||!gate(action)){failure=true;message='Follow the current departure step on your saved vessel.';return false;}
   if(ctx.boatMode?.active)ctx.oceanVoyage?.surfaceCheckpoint?.();
   else if(ctx.oceanMode?.active)ctx.oceanVoyage?.checkpoint?.();
   const currentVoyage=voyage(),id=currentVoyage.id;
   if(action==='sites'){
    const checked=[];
    for(const site of COASTAL_SITES){
     let depth=await fetchDepth(site.lat,site.lon,{timeoutMs:5000}).catch(()=>null);
     // A failed service can use the existing chart. A new shallow/land sample
     // must never be overridden by an older chart.
     if(!depth||(depth.truthType==='unknown'&&!Number.isFinite(depth.elevationMeters)))depth=await fetchFallback(site.lat,site.lon).catch(()=>null);
     checked.push({...site,depth,allowed:depth?.truthType==='modeled'&&Number.isFinite(depth.depthMeters)&&depth.depthMeters>=8});
    }
    if(voyage()?.id!==id||!gate('sites'))return false;
    choices=checked;failure=!choices.some(s=>s.allowed);if(!choices.find(s=>s.id===selected)?.allowed)selected=choices.find(s=>s.allowed)?.id||'shelf';
    message=choices.some(s=>s.allowed)?'Choose a station, review its conditions, then accept the plan.':'Station depth is unavailable. Retry the check or keep exploring freely.';return true;
   }
   const s=state(),choice=choices?.find(site=>site.id===selected);
   if(action==='plan'&&!choice?.allowed){failure=true;message='Check the two stations before accepting a plan.';return false;}
   const value=coastalRecord(action,{site:action==='plan'?choice:s.site,voyage:currentVoyage,conditions:coastalConditions(ctx.activeWaterOpticsEvidence?.wave),depth:choice?.depth,position:{...position()},now:Math.max(now(),...records.map(e=>Number(e.occurredAt)||0))});
   const result=await store().recordExplorerEvent(value);
   if(!result.recorded&&result.reason!=='already-recorded')throw Error('Save rejected');
   if(result.event?.sourceSystem!=='coastal-departure'||result.event.activityId!==value.activityId)throw Error('Conflicting record');
   if(!await refresh())throw Error('Confirmation unavailable');
   message=result.recorded?(store().type==='IndexedDbDiscoveryProfileStore'?'Saved to this device’s Journal.':'Recorded for this session. Export your Journal before leaving.'):'This step was already saved; the saved plan is shown.';return true;
  }catch{failure=true;message='This step could not be confirmed. Retry; no completion has been claimed.';return false;}finally{busy=false;}
 }
 function snapshot(){
  const s=state(),distance=coastalDistance(geo(),s.site),v=voyage();let instruction='',action=null,label='';
  if(!ready){instruction=message||'Loading coastal chapter…';action='retry';label='Retry Journal';}
  else if(s.phase==='unavailable'){instruction='This coastal record cannot be read safely. Keep it in your Journal; free exploration remains available.';}
  else if(s.phase==='available'){
   instruction='Coastal Departure · plan a station, prepare this vessel, then launch its submarine. Optional; free exploration stays available.';
   action=choices?.some(c=>c.allowed)?'plan':'sites';label=action==='plan'?'Accept station plan':'Review coastal stations';
   if(!at('chart'))instruction+=' Walk to the Navigation chart to begin.';
  }else if(!same()&&!s.completed){instruction='This chapter belongs to another research voyage. Resume its vessel and submarine from the saved chapter record.';action='resume';label='Return to chapter vessel';}
  else if(s.phase==='station'){
   instruction=!survey().started?'Take the reef survey briefing at the wet lab, then return to the chart.':distance>80?`Sail to ${s.site.name} · ${Math.round(distance)} m · bearing ${Math.round(coastalBearing(geo(),s.site))}° · ${s.site.lat.toFixed(4)}, ${s.site.lon.toFixed(4)}. Stop, moor and return to the chart.`:'At the survey station. Stop, moor and review conditions at the Navigation chart.';
   action='station';label='Confirm moored station';
  }else if(s.phase==='ladder'){instruction='Find the Dive ladder. Check this return point before preparing the submarine.';action='ladder';label='Check return ladder';}
  else if(s.phase==='cradle'){instruction='Walk to the Submarine cradle and prepare the loaded research submarine.';action='cradle';label='Prepare submarine';}
  else if(s.phase==='launch'){instruction=ctx.oceanMode?.active?'Your submarine is deployed. Save the coastal voyage record, then continue the reef survey.':'Use Deploy submarine at the cradle. Your vessel stays moored at this station.';action='launch';label='Record coastal departure';}
  else instruction='Coastal Departure complete · voyage record saved. Continue the reef survey and return to the wet lab with your findings.';
  return {...s,ready,busy,message,failure,instruction,action,label,allowed:!!action&&(action==='retry'||(action==='resume'&&!ctx.paused&&!ctx.sharedMarine?.active)||gate(action)),visible:!ctx.sharedMarine?.active&&!!v&&(!!s.plan||inRegion()),choices,selected,conditions:coastalConditionText(coastalConditions(ctx.activeWaterOpticsEvidence?.wave)),distance:Number.isFinite(distance)?distance:null,storage:store().type==='IndexedDbDiscoveryProfileStore'?'device':'session'};
 }
 return {refresh,act,snapshot,select:id=>{if(COASTAL_SITES.some(s=>s.id===id))selected=id;}};
}
