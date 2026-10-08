import {ctx} from '../shared-context.js?v=55';
// Journal acceptance owns completion. The small device cache is a projection,
// and the pending record keeps the same event identity across retries/reloads.
const HISTORY='worldExplorer3D.activityCompletions.v1';
const PENDING='worldExplorer3D.activityPendingCompletions.v1';
export function createActivityCompletionStore({storage=()=>globalThis.localStorage,recordEvent,lookupEvents,now=Date.now,context=()=>({})}={}){
 let history=null,pending=null;const inFlight=new Map(),verified=new Set();
 const read=key=>{try{const p=JSON.parse(storage()?.getItem(key)||'{}');return p&&typeof p==='object'&&!Array.isArray(p)?Object.assign(Object.create(null),p):Object.create(null)}catch{return {}}};
 const load=()=>{history ||= read(HISTORY);pending ||= read(PENDING)};
 const write=(key,value)=>{try{if(!storage())return false;storage().setItem(key,JSON.stringify(value));return true}catch{return false}};
 const get=id=>{load();return history[id]?{...history[id]}:null};
 const status=id=>{load();const p=pending[id];return p?{status:inFlight.has(id)?'saving':p.accepted?'cache-retry':'retry',durable:p.durable===true}:get(id)?.journalSavedAt&&verified.has(id)?{status:'saved'}:{status:'unverified'}};
 async function retry(id){
  load();if(inFlight.has(id))return inFlight.get(id);const p=pending[id];if(!p)return status(id).status==='saved';
  const operation=(async()=>{
   try{
    const result=await recordEvent(p.event);
    if(result?.recorded!==true&&!(result?.reason==='already-recorded'&&result?.event?.eventId===p.event.eventId))return false;
    history[id]={...p.completion,journalSavedAt:now(),journalEventId:p.event.eventId};verified.add(id);
    if(!write(HISTORY,history)){p.accepted=true;write(PENDING,pending);return true;}
    delete pending[id];write(PENDING,pending);return true;
   }catch{return false}finally{inFlight.delete(id)}
  })();inFlight.set(id,operation);return operation;
 }
 function complete(activity,durationMs,pose,options={}){
  load();const id=String(activity.id||'').trim().toLowerCase().slice(0,120);if(!id||['__proto__','constructor','prototype'].includes(id))return Promise.resolve(false);
  if(pending[id])return retry(id);
  if(Object.keys(pending).length>=20)return Promise.resolve(false);
  const previous=get(id)||{},count=Math.max(0,Number(previous.count)||0)+1,first=count===1,duration=Math.max(0,Number(durationMs)||0);
  const completion={count,lastCompletedAt:now(),bestTimeMs:previous.bestTimeMs>0?Math.min(previous.bestTimeMs,duration):duration};
  const event={...context(),occurredAt:now(),eventId:`event:activity-completed:${id}:${count}`,eventType:options.outcome==='failed'?'activity-ended':'activity-completed',sourceSystem:'games-and-activities',sourceId:id,pathId:'activity',name:String(activity.title||activity.name||'Activity complete').slice(0,120),detail:String(options.detail || (first?'First completion.':`Completed again in ${Math.max(1,Math.round(duration/1000))} seconds.`)).slice(0,500),activityId:id,localPosition:pose,metadata:{shared:activity.sourceType==='room_activity',outcome:options.outcome||'completed',...options.metadata},firstCompletion:first&&options.outcome!=='failed',points:first&&options.outcome!=='failed'?(options.pointsFirst??2):0,progressReason:first?'first-activity-completion':'activity-replay'};
  pending[id]={event,completion,durable:true};if(!write(PENDING,pending))pending[id].durable=false;
  return retry(id);
 }
 async function verify(id){
  load();const row=history[id];if(!row?.journalEventId || typeof lookupEvents!=='function')return false;
  try{const events=await lookupEvents([row.journalEventId]);if(events?.some(e=>e.eventId===row.journalEventId)){verified.add(id);return true;}verified.delete(id);return false;}catch{verified.delete(id);return false;}
 }
 return {get,status,complete,retry,verify,canStart(id){load();return !pending[id]&&Object.keys(pending).length<20}};
}
export function activityCompletionMessage(completion,status){
 if(status.status==='saving')return 'Activity complete. Saving to your Journal…';
 if(status.status==='cache-retry')return 'Saved in your Journal. Local history needs retry.';
 if(status.status==='retry')return status.durable?'Activity complete. Journal save needs retry.':'Activity complete. Not saved—keep this tab open and retry.';
 if(completion?.count)return `Completed ${completion.count} time${completion.count===1?'':'s'}${completion.bestTimeMs?` • best ${(completion.bestTimeMs/1000).toFixed(1)}s`:''} • ${status.status==='saved'?'saved in your Journal':'local history; Journal not verified'}`;
 return 'Finish the route to add this activity to your Journal and Games path.';
}

export const activityCompletions=createActivityCompletionStore({recordEvent:event=>ctx.recordExplorerEvent?.(event),lookupEvents:ids=>ctx.getExplorerEventsById?.(ids),context:()=>{
 const identity=ctx.livingWorldPublication?.worldIdentity;
 return {environment:ctx.getEnv?.()||'EARTH',locationSnapshot:{...(identity?.location||ctx.LOC||{})},...(identity?.id?{regionId:identity.id,worldIdentity:identity.id}:{}),regionLabel:String(identity?.location?.name||ctx.LOC?.name||'Current location')};
}});
