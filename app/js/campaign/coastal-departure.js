// Immutable personal chapter evidence lives in the existing Journal. It grants
// no money, equipment or server authority and never locks ordinary Ocean play.
import {validateOceanVoyage} from '../ocean/voyage-store.js';
export const COASTAL_DEPARTURE=Object.freeze({id:'coastal-departure-v1',title:'Coastal Departure',parts:Object.freeze(['plan','station','ladder','cradle','launch'])});
export const COASTAL_SITES=Object.freeze([
 Object.freeze({id:'shelf',name:'Coral Shelf station',lat:-18.2861,lon:147.7,detail:'Start beside the authored reef study. A short approach to its three habitat sites.'}),
 Object.freeze({id:'north',name:'Northern approach',lat:-18.2849,lon:147.7006,detail:'Sail roughly 145 m north-east from the starting station, then approach the same study from the north.'})
]);
export const coastalEventId=part=>`${COASTAL_DEPARTURE.id}:${part}`;
export const coastalEventIds=COASTAL_DEPARTURE.parts.map(coastalEventId);
export const coastalDistance=(a,b)=>a&&b&&[a.lat,a.lon,b.lat,b.lon].every(Number.isFinite)?Math.hypot((a.lat-b.lat)*111000,(a.lon-b.lon)*111000*Math.cos(a.lat*Math.PI/180)):Infinity;
export function coastalBearing(a,b){
 if(!Number.isFinite(coastalDistance(a,b)))return null;
 return (Math.atan2((b.lon-a.lon)*Math.cos(a.lat*Math.PI/180),b.lat-a.lat)*180/Math.PI+360)%360;
}
export function coastalDepartureState(events=[]){
 const rows=events.filter(e=>e.sourceSystem==='coastal-departure'&&e.activityId===COASTAL_DEPARTURE.id&&e.metadata?.truthType==='authored'&&e.occurredAt>0&&e.eventType===(e.eventId===coastalEventId('launch')?'campaign-completed':'campaign-progress'));
 const plan=rows.find(e=>e.eventId===coastalEventId('plan'));
 const site=COASTAL_SITES.find(site=>site.id===plan?.metadata?.siteId);
 if(!plan)return {phase:'available',plan:null,site:null,completed:false};
 const voyage=validateOceanVoyage(plan.metadata.voyage);
 if(!site||plan.metadata.depth?.truthType!=='modeled'||!Number.isFinite(plan.metadata.depth?.depthMeters)||plan.metadata.depth.depthMeters<8||!plan.metadata.depth.sourceId||!plan.metadata.conditions||!voyage||voyage.id!==plan.metadata.voyageId||voyage.ship.transportEntityId!==plan.metadata.shipId||voyage.subId!==plan.metadata.subId)return {phase:'unavailable',plan:null,site:null,completed:false};
 const matches=v=>v&&v.id===voyage.id&&v.ship.transportEntityId===voyage.ship.transportEntityId&&v.subId===voyage.subId;
 const accepted=['plan'];let previous=plan.occurredAt;
 for(const part of COASTAL_DEPARTURE.parts.slice(1)){
  const row=rows.find(e=>e.eventId===coastalEventId(part)&&e.metadata?.voyageId===plan.metadata.voyageId&&e.metadata?.shipId===plan.metadata.shipId&&e.metadata?.subId===plan.metadata.subId&&e.metadata?.siteId===site.id&&e.occurredAt>=previous&&matches(validateOceanVoyage(e.metadata.voyage)));
  if(!row)break;accepted.push(part);previous=row.occurredAt;
 }
 const latest=rows.find(e=>e.eventId===coastalEventId(accepted.at(-1)));
 return {phase:accepted.length===5?'complete':COASTAL_DEPARTURE.parts[accepted.length],plan,site,completed:accepted.length===5,accepted,resumeVoyage:validateOceanVoyage(latest.metadata.voyage)||voyage};
}
export function coastalConditions(wave){
 const valid=(value)=>typeof value==='number'&&Number.isFinite(value);
 const model=wave?.truthType==='modeled'&&valid(wave.waveHeightM),current=wave?.currentEvidence;
 return {wave:model?{heightM:wave.waveHeightM,sourceId:String(wave.sourceId||'unknown').slice(0,120),validAt:String(wave.validAt||'').slice(0,80)}:null,
  current:current?.truthType==='modeled'&&valid(current.currentVelocityKph)?{speedKph:current.currentVelocityKph,directionDeg:valid(current.currentDirectionDeg)?current.currentDirectionDeg:null,sourceId:String(current.sourceId||'unknown').slice(0,120),validAt:String(current.validAt||'').slice(0,80)}:null,
  visibility:'Game water visibility; no measured underwater visibility is available.'};
}
export function coastalConditionText(value){
 const wave=value?.wave,current=value?.current;
 return `${wave?`Regional wave model ${wave.heightM.toFixed(1)} m · ${wave.sourceId} · ${wave.validAt||'valid time unavailable'}.`:'Regional wave height unavailable.'} ${current?`Regional current model ${current.speedKph.toFixed(1)} km/h${current.directionDeg==null?'':` toward ${Math.round(current.directionDeg)}°`} · ${current.sourceId} · ${current.validAt||'valid time unavailable'}.`:'Regional current unavailable; the game uses its labeled water simulation.'} ${value?.visibility||''}`;
}
export function coastalRecord(part,{site,voyage,conditions,depth,position,now=Date.now()}){
 const saved=validateOceanVoyage(voyage);
 if(!COASTAL_DEPARTURE.parts.includes(part)||!COASTAL_SITES.some(s=>s.id===site?.id)||!saved||!Number.isFinite(now)||now<=0)throw Error('The coastal voyage is not ready to record.');
 if(part==='plan'&&(depth?.truthType!=='modeled'||!Number.isFinite(depth?.depthMeters)||depth.depthMeters<8||!depth.sourceId||!conditions))throw Error('Check modeled water depth and review conditions before accepting a station.');
 const titles={plan:'Coastal Departure · station plan',station:'Coastal Departure · moored on station',ladder:'Coastal Departure · return ladder checked',cradle:'Coastal Departure · submarine prepared',launch:'Coastal Departure complete'};
 const details={plan:`${site.name}. ${coastalConditionText(conditions)} Model depth ${Math.round(depth?.depthMeters)} m from ${depth?.sourceId}${depth?.bundled?' (bundled chart)':''} · ${depth?.fetchedAt||'sample time unavailable'}; game depths are compressed.`,station:`Moored within 80 m of ${site.name}. Briefing and conditions reviewed.`,ladder:'Walked to the water-entry ladder and checked the return point on this research vessel.',cradle:'Walked to the actual submarine cradle after identifying the return ladder.',launch:'Deployed the same vessel’s loaded submarine. Continue the three-site reef survey, keep partial findings, then submit the report at the wet lab.'};
 return {eventId:coastalEventId(part),eventType:part==='launch'?'campaign-completed':'campaign-progress',sourceSystem:'coastal-departure',sourceId:coastalEventId(part),activityId:COASTAL_DEPARTURE.id,pathId:'field',name:titles[part],detail:details[part],occurredAt:now,environment:part==='launch'?'OCEAN':'EARTH',regionLabel:'Coral Shelf authored study',locationSnapshot:{lat:site.lat,lon:site.lon,name:site.name},localPosition:position,
  projections:{journal:true,profile:false,place:false,missionProgress:false},progress:{points:0,reason:'personal-coastal-chapter'},metadata:{truthType:'authored',chapterId:COASTAL_DEPARTURE.id,siteId:site.id,voyageId:saved.id,shipId:saved.ship.transportEntityId,subId:saved.subId,voyage:saved,...(part==='plan'?{conditions,depth}:{} )}};
}

export function validateCoastalBackup(events){
 const rows=events.filter(e=>coastalEventIds.includes(e.eventId)||e.sourceSystem==='coastal-departure');
 if(!rows.length)return;
 const state=coastalDepartureState(rows);
 if(!state.plan||rows.length!==state.accepted.length||rows.some(e=>!state.accepted.some(part=>coastalEventId(part)===e.eventId)))throw new TypeError('Invalid coastal chapter evidence.');
}
