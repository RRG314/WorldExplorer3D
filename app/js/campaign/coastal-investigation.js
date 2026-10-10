// Personal gameplay evidence. Sonar samples authored geometry, not live sonar
// or a scientific identification. The Journal remains the only save authority.
import {validateOceanVoyage} from '../ocean/voyage-store.js';
export const COASTAL_INVESTIGATION=Object.freeze({id:'coastal-investigation-v1',contacts:Object.freeze(['habitat','rock','case']),rangeMeters:80,diveRangeMeters:6});
export const investigationId=part=>`${COASTAL_INVESTIGATION.id}:${part}`;
const parts=['brief','contact:habitat','contact:rock','contact:case','chart','selection','view:1','view:2','return',...Array.from({length:6},(_,i)=>`partial:${i}`),'report'];
export const investigationEventIds=parts.map(investigationId);
const followupPart=part=>/^followup:(habitat|rock|case):\d{1,12}$/.test(part);
const point=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const key=p=>COASTAL_INVESTIGATION.contacts.includes(p);
const validTarget=t=>t&&key(t.id)&&point(t)&&Number.isFinite(t.radius)&&t.radius>0&&t.radius<=12;
export const INVESTIGATION_CONCLUSIONS=Object.freeze({habitat:'A living reef habitat on rock',rock:'A natural rock outcrop',case:'A modern research equipment case',wreck:'A historic shipwreck',unknown:'Evidence is inconclusive'});
export function investigationState(events=[]){
 const rows=events.filter(e=>e.sourceSystem==='coastal-investigation'&&e.activityId===COASTAL_INVESTIGATION.id&&e.metadata?.truthType==='authored'&&e.occurredAt>0&&parts.some(p=>investigationId(p)===e.eventId));
 const get=p=>rows.find(e=>e.eventId===investigationId(p));
 const brief=get('brief'),voyage=validateOceanVoyage(brief?.metadata?.voyage);
 const empty={phase:'available',started:false,chart:false,diver:false,completed:false,contacts:[],views:[],selected:null,accepted:[]};
 if(!brief)return empty;
 if(!voyage||!point(brief.localPosition)||brief.eventType!=='campaign-progress')return {...empty,phase:'unavailable'};
 const same=e=>{const saved=validateOceanVoyage(e?.metadata?.voyage);return !!e&&point(e.localPosition)&&e.occurredAt>=brief.occurredAt&&e.metadata.voyageId===voyage.id&&e.metadata.shipId===voyage.ship.transportEntityId&&e.metadata.subId===voyage.subId&&saved?.id===voyage.id&&saved?.ship.transportEntityId===voyage.ship.transportEntityId&&saved?.subId===voyage.subId;};
 const accepted=['brief'],contacts=[];
 for(const id of COASTAL_INVESTIGATION.contacts){const e=get(`contact:${id}`);if(same(e)&&e.eventType==='campaign-progress'&&validTarget(e.metadata.target)&&e.metadata.target.id===id&&e.metadata.sensor==='geometry-sonar'&&point(e.localPosition)&&Number.isFinite(e.metadata.distanceMeters)&&e.metadata.distanceMeters>=0&&e.metadata.distanceMeters<=COASTAL_INVESTIGATION.rangeMeters){contacts.push(e);accepted.push(`contact:${id}`);}}
 const chartEvent=get('chart'),chart=contacts.length===3&&same(chartEvent)&&chartEvent.eventType==='campaign-completed'&&contacts.every(e=>e.occurredAt<=chartEvent.occurredAt);
 if(chart)accepted.push('chart');
 const selection=get('selection'),selected=chart&&same(selection)&&selection.eventType==='campaign-progress'&&key(selection.metadata.targetId)&&selection.occurredAt>=chartEvent.occurredAt?selection.metadata.targetId:null;
 if(selected)accepted.push('selection');
 const views=[];
 for(const part of ['view:1','view:2']){const e=get(part);if(selected&&same(e)&&e.eventType==='campaign-progress'&&e.metadata.targetId===selected&&e.metadata.sensor==='diver-observation'&&e.metadata.subId===voyage.subId&&point(e.localPosition)&&point(e.metadata.studyPosition)&&Number.isFinite(e.metadata.distanceMeters)&&e.metadata.distanceMeters>=0&&e.metadata.distanceMeters<=6&&e.occurredAt>=(views.at(-1)?.occurredAt||selection.occurredAt)){
  if(part==='view:2'&&(!views.length||Math.hypot(e.metadata.studyPosition.x-views[0].metadata.studyPosition.x,e.metadata.studyPosition.z-views[0].metadata.studyPosition.z)<3))break;
  views.push(e);accepted.push(part);
 }else break;}
 const returnEvent=get('return'),diver=views.length===2&&same(returnEvent)&&returnEvent.eventType==='campaign-completed'&&returnEvent.metadata.returnedNormally===true&&returnEvent.occurredAt>=views[1].occurredAt;
 if(diver)accepted.push('return');
 const report=get('report'),completed=diver&&same(report)&&report.eventType==='campaign-completed'&&report.occurredAt>=returnEvent.occurredAt&&report.metadata.conclusion===selected;
 if(completed)accepted.push('report');
 for(let i=0;i<6;i++){const e=get(`partial:${i}`);if(same(e)&&e.eventType==='campaign-progress'&&e.metadata.evidenceCount===i&&i<=contacts.length+views.length&&e.metadata.conclusion==='unknown')accepted.push(`partial:${i}`);}
 const latest=rows.filter(e=>accepted.some(p=>e.eventId===investigationId(p))).sort((a,b)=>b.occurredAt-a.occurredAt)[0];
 const resume=validateOceanVoyage(latest?.metadata.voyage);
 return {phase:completed?'complete':diver?'report':views.length===2?'return':selected?'dive':chart?'selection':contacts.length===3?'chart':'sonar',started:true,brief,chart,diver,completed,contacts,views,selected,accepted,voyage,resumeVoyage:resume?.id===voyage.id&&resume.ship.transportEntityId===voyage.ship.transportEntityId&&resume.subId===voyage.subId?resume:voyage,report:completed?report:null};
}
export function investigationRecord(part,{voyage,position,now=Date.now(),metadata={},detail=''}){
 const saved=validateOceanVoyage(voyage);
 if((!parts.includes(part)&&!followupPart(part))||!saved||!point(position)||!Number.isFinite(now)||now<=0)throw Error('Invalid investigation record');
 const titles={brief:'Read the Seabed · investigation plan',chart:'Read the Seabed · annotated chart',selection:'Outside the Hull · chosen contact','view:1':'Outside the Hull · first observation','view:2':'Outside the Hull · second viewpoint',return:'Outside the Hull · Diver badge',report:'What the Coast Revealed · Coastal Explorer'};
 return {eventId:investigationId(part),eventType:['chart','return','report'].includes(part)?'campaign-completed':'campaign-progress',sourceSystem:'coastal-investigation',sourceId:investigationId(part),activityId:COASTAL_INVESTIGATION.id,pathId:'field',name:titles[part]||(part.startsWith('contact:')?'Seabed contact recorded':part.startsWith('followup:')?'Coastal watch · follow-up observation':'Coastal investigation · partial report'),detail,occurredAt:now,environment:part==='report'||part.startsWith('partial:')?'EARTH':'OCEAN',regionLabel:'Coral Shelf authored study',locationSnapshot:{...saved.site,name:'Coral Shelf authored investigation'},localPosition:{x:position.x,y:position.y,z:position.z},projections:{journal:true,profile:false,place:false,missionProgress:false},progress:{points:0,reason:'personal-coastal-investigation'},metadata:{...metadata,truthType:'authored',voyageId:saved.id,shipId:saved.ship.transportEntityId,subId:saved.subId,voyage:saved}};
}
export function validateInvestigationBackup(events){
 const rows=events.filter(e=>investigationEventIds.includes(e.eventId)||e.sourceSystem==='coastal-investigation');if(!rows.length)return;
 const base=rows.filter(e=>investigationEventIds.includes(e.eventId)),s=investigationState(base),followups=rows.filter(e=>!base.includes(e));
 if(!s.started||s.accepted.length!==base.length||base.some(e=>!s.accepted.some(p=>investigationId(p)===e.eventId)))throw Error('Invalid investigation evidence');
 for(const e of followups){const part=e.eventId.slice(COASTAL_INVESTIGATION.id.length+1),saved=validateOceanVoyage(e.metadata?.voyage);
  if(!s.completed||!e.eventId.startsWith(COASTAL_INVESTIGATION.id+':')||!followupPart(part)||e.sourceSystem!=='coastal-investigation'||e.activityId!==COASTAL_INVESTIGATION.id||e.eventType!=='campaign-progress'||e.metadata?.truthType!=='authored'||e.metadata.sensor!=='diver-observation'||e.metadata.targetId!==part.split(':')[1]||!point(e.localPosition)||!point(e.metadata.studyPosition)||!saved||e.metadata.voyageId!==s.voyage.id||saved.id!==s.voyage.id||saved.ship.transportEntityId!==s.voyage.ship.transportEntityId||saved.subId!==s.voyage.subId||!Number.isFinite(e.metadata.distanceMeters)||e.metadata.distanceMeters<0||e.metadata.distanceMeters>6||e.occurredAt<s.report.occurredAt)throw Error('Invalid coastal follow-up');
 }
}
export function investigationBadges(events){const s=investigationState(events);return [s.diver?{id:'coastal-diver',label:'Diver',detail:'Documented two viewpoints and returned to the same submarine. Survey reserve: 60 extra seconds of game air.',earnedAt:events.find(e=>e.eventId===investigationId('return')).occurredAt}:null,s.completed?{id:'coastal-explorer',label:'Coastal Explorer',detail:'Compared a three-contact chart with direct observations and filed a supported report.',earnedAt:s.report.occurredAt}:null].filter(Boolean);}
export function contactAdmission({actor,target,units=1,range=80,diver=false,paused=false,ready=false,lineClear=()=>true}){
 const no=reason=>({allowed:false,reason});
 if(paused||!ready)return no('Return to active exploration and let the survey objects finish loading.');
 if(!point(actor?.position)||!validTarget(target)||![actor.yaw,units,range].every(Number.isFinite)||units<=0||range<=0)return no('Contact position is unavailable.');
 const dx=target.x-actor.position.x,dy=target.y-actor.position.y,dz=target.z-actor.position.z,distance=Math.hypot(dx,dy,dz)*units;
 if(distance>range)return {allowed:false,distance,reason:`Approach within ${range} m of the contact.`};
 if(!Number.isFinite(actor.speed??0)||!Number.isFinite(actor.verticalSpeed??actor.vy??0))return no('Movement state is unavailable.');
 if(Math.abs(actor.speed||0)>.6||Math.abs(actor.verticalSpeed??actor.vy??0)>.6)return {allowed:false,distance,reason:'Release movement controls and hold your position.'};
 const horizontal=Math.hypot(dx,dz),dot=horizontal>.1?(dx*Math.sin(actor.yaw)+dz*Math.cos(actor.yaw))/horizontal:1;
 if(dot<Math.cos((diver?65:55)*Math.PI/180))return {allowed:false,distance,reason:'Turn toward the contact before recording.'};
 if(!lineClear(actor.position,target))return {allowed:false,distance,reason:'The seabed or another object blocks this view. Approach from above or the side.'};
 return {allowed:true,distance,reason:diver?'Clear view. Record what you can see.':'Return in the sonar cone. Ready to chart.'};
}
export function contactLineClear(plan,sample,from,target){
 if(!point(from)||!validTarget(target)||typeof sample!=='function')return false;
 const d=Math.hypot(target.x-from.x,target.y-from.y,target.z-from.z),steps=Math.max(1,Math.ceil(d/1.5));
 for(let i=1;i<steps;i++){const t=i/steps,p={x:from.x+(target.x-from.x)*t,y:from.y+(target.y-from.y)*t,z:from.z+(target.z-from.z)*t};
  if(Math.hypot(p.x-target.x,p.y-target.y,p.z-target.z)<=target.radius+.5)break;
  const bottom=sample(p.x,p.z);if(!Number.isFinite(bottom)||p.y<bottom+.1)return false;
  for(const r of plan?.rocks||[])if(((p.x-r.x)/r.rx)**2+((p.y-r.y)/r.ry)**2+((p.z-r.z)/r.rz)**2<1)return false;
 }
 return true;
}
