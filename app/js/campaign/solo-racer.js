import {personalVehicleById} from '../transport/vehicle-garage-rules.js';
const phases=['first-finish','clean-finish','improve-time','venue-tour','complete'];
export const SOLO_RACER=Object.freeze({id:'solo-racer',version:1,receiptId:'event:campaign:solo-racer:v1',venues:Object.freeze(['silverstone-grand-prix','nurburgring-nordschleife','daytona-tri-oval'])});
const copy=value=>JSON.parse(JSON.stringify(value));
export function normalizeSoloRacer(value){
 if(value?.schemaVersion!=null&&value.schemaVersion!==1)return copy(value);
 return {schemaVersion:1,acceptedAt:0,phase:'available',ownerUid:'',vehicleId:'',evidence:{},venueResults:{},bests:{},completedAt:0,repeat:null,...copy(value||{})};
}
export function beginSoloRacer(value,{garage,ownerUid='',now=Date.now(),variantId='campaign'}={}){
 const state=normalizeSoloRacer(value);if(state.schemaVersion!==1)throw Error('This career needs a newer version of World Explorer.');
 const vehicle=garage?.vehicles?.[garage.selectedId];
 if(!vehicle||!personalVehicleById(garage.selectedId)||!Number.isFinite(vehicle.condition)||vehicle.condition<.3)throw Error('Choose an owned car with at least 30% condition in the Garage.');
 if(!Number.isFinite(now)||now<=0)throw Error('The career could not start. Try again.');
 if(!['campaign','clean-series','pace-session'].includes(variantId))throw Error('Choose a valid racing assignment.');
 if(variantId!=='campaign'){
  if(state.phase!=='complete')throw Error('Finish the venue tour before starting these assignments.');
  if(state.repeat?.id===variantId&&state.repeat.phase==='active')return {...state,ownerUid,vehicleId:garage.selectedId};
  return {...state,ownerUid,vehicleId:garage.selectedId,repeat:{id:variantId,acceptedAt:now,phase:'active',count:0,evidenceIds:[],completedAt:0,courseKey:null}};
 }
 if(state.phase!=='available')return {...state,ownerUid,vehicleId:garage.selectedId};
 return {...state,acceptedAt:now,ownerUid,vehicleId:garage.selectedId,phase:'first-finish'};
}
function finishEvidence(event,state){
 const m=event?.metadata;
 if(state.schemaVersion!==1||!state.acceptedAt||event?.sourceSystem!=='games-and-activities'||event.eventType!=='activity-completed'||m?.outcome!=='completed'||m.resultOwner!=='game-result'||m.racingOwnerUid!==state.ownerUid||event.occurredAt<state.acceptedAt||!personalVehicleById(m.vehicleId)||!/^road-race-[a-f0-9]{32}$/.test(m.courseId)||!m.raceConfiguration||!m.physicsVersion||!(m.racingPracticeVersion===1||m.raceVerified===true)||m.racingQualificationVersion===1||!Number.isFinite(m.elapsedMs)||m.elapsedMs<=0||!Number.isSafeInteger(m.barrierContacts)||m.barrierContacts<0||!Number.isFinite(m.penaltyMs)||m.penaltyMs<0||!event.eventId)return null;
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const configuration=JSON.stringify(canonical(m.raceConfiguration));
 return {id:event.eventId,at:event.occurredAt,vehicleId:m.vehicleId,key:[state.ownerUid,m.courseId,m.vehicleId,m.physicsVersion,configuration].join('|'),timeMs:m.elapsedMs,clean:m.barrierContacts===0&&m.penaltyMs===0,consistent:m.consistentLaps===true,venueId:SOLO_RACER.venues.includes(m.racingVenueId)?m.racingVenueId:null};
}
export function projectSoloRacer(value,event){
 const state=normalizeSoloRacer(value),finish=finishEvidence(event,state);if(!finish)return state;
 const used=new Set([...Object.values(state.evidence||{}),...Object.values(state.venueResults||{}).map(e=>e.eventId),...(state.repeat?.evidenceIds||[])]);
 if(used.has(finish.id))return state;
 const previous=state.bests[finish.key];
 const improved=Number.isFinite(previous?.timeMs)&&finish.timeMs<=previous.timeMs*.99;
 const bests={...state.bests,[finish.key]:{timeMs:Math.min(previous?.timeMs??Infinity,finish.timeMs),eventId:finish.id}};
 const next={...state,bests:Object.fromEntries(Object.entries(bests).slice(-32)),evidence:{...state.evidence},venueResults:{...state.venueResults}};
 if(finish.venueId)next.venueResults[finish.venueId]={eventId:finish.id,at:finish.at,timeMs:finish.timeMs,vehicleId:finish.vehicleId};
 if(state.phase==='first-finish'){next.evidence.first=finish.id;next.phase='clean-finish';}
 else if(state.phase==='clean-finish'&&finish.clean){next.evidence.clean=finish.id;next.phase='improve-time';}
 else if(state.phase==='improve-time'&&improved){next.evidence.improved=finish.id;next.evidence.benchmark=previous.eventId;next.phase='venue-tour';}
 else if(state.phase==='venue-tour'&&SOLO_RACER.venues.every(id=>next.venueResults[id])){next.evidence.tour=finish.id;next.phase='complete';next.completedAt=finish.at;}
 const repeat=state.repeat;
 if(state.phase==='complete'&&repeat?.phase==='active'&&finish.at>=repeat.acceptedAt){
  const sameCourse=!repeat.courseKey||repeat.courseKey===finish.key;
  if(repeat.id==='clean-series'){
   const count=finish.clean&&sameCourse?repeat.count+1:finish.clean?1:0;
   next.repeat={...repeat,courseKey:finish.key,count,evidenceIds:finish.clean&&sameCourse?[...repeat.evidenceIds,finish.id].slice(-3):finish.clean?[finish.id]:[],phase:count>=3?'complete':'active',completedAt:count>=3?finish.at:0};
  }else if(repeat.id==='pace-session'&&finish.clean&&finish.consistent){next.repeat={...repeat,count:1,evidenceIds:[finish.id],courseKey:finish.key,phase:'complete',completedAt:finish.at};}
 }
 return next;
}
export function soloRacerReceipt(state,event){
 if(state?.schemaVersion!==1||state.phase!=='complete'||!state.completedAt)return null;
 return {eventId:SOLO_RACER.receiptId,eventType:'campaign-completed',sourceSystem:'explorer-campaign',sourceId:SOLO_RACER.id,pathId:'activity',name:'Racer · Three-Venue Tour',detail:'Finished a race, drove a separate clean finish, improved a matching car and course time by at least 1%, and completed Silverstone, Nordschleife and Daytona.',occurredAt:state.completedAt,environment:'EARTH',regionId:event.regionId,regionLabel:event.regionLabel,points:0,projections:{journal:true,profile:false,place:false},metadata:{chapterId:SOLO_RACER.id,evidenceIds:Object.values(state.evidence),venueResults:copy(state.venueResults)}};
}
export function soloRacerBadge(value){const state=normalizeSoloRacer(value);return state.schemaVersion===1&&state.phase==='complete'&&state.completedAt?{id:SOLO_RACER.id,label:'Three-Venue Racer',detail:'Clean finish, personal improvement and the three-venue tour.',earnedAt:state.completedAt,eventId:SOLO_RACER.receiptId}:null;}
export function soloRacerSummary(value,{variantId='campaign'}={}){
 const state=normalizeSoloRacer(value),index=phases.indexOf(state.phase);
 const labels=['Check your car and condition','Finish your first event','Finish a separate event without barrier contacts or timing penalties','Improve a matching car, build and course time by at least 1%','Complete Silverstone, Nordschleife and Daytona'];
 const details={available:'Choose a venue, review your car and finish your first event.', 'first-finish':'Finish any qualified event. Your first saved result sets a personal benchmark.', 'clean-finish':'Finish another event without course-barrier contacts or timing penalties.', 'improve-time':'Improve your saved benchmark by at least 1% using the same car, build, course and lap count.', 'venue-tour':'Finish at all three venues. Your earlier finishes in this career count toward the tour.',complete:'Three-Venue Racer earned. Replay an event or choose a new driving assignment.'};
 const choices=state.phase==='complete'?[{id:'campaign',label:'Venue tour · complete'},{id:'clean-series',label:'Clean Sprint · three clean finishes'},{id:'pace-session',label:'Consistency Run · three consistent laps'}]:[{id:'campaign',label:'Three-Venue Tour'}];
 const repeat=state.repeat?.id===variantId?state.repeat:null;
 return {title:variantId==='clean-series'?'Clean Sprint':variantId==='pace-session'?'Consistency Run':state.phase==='complete'?'Three-Venue Racer':'First clean finish',summary:variantId==='clean-series'?`Finish three consecutive clean events with the same car, build and course. ${repeat?.count||0}/3 saved.`:variantId==='pace-session'?'Choose a three-lap event. Finish cleanly with all lap times within 5% of the fastest lap.':details[state.phase]||'Your saved career needs a newer version of World Explorer.',resume:variantId==='campaign'?!['available','complete'].includes(state.phase):repeat?.phase==='active',choices,stages:variantId==='campaign'?labels.map((label,i)=>({label,complete:i===0?index>=0:i===4?state.phase==='complete':index>=i})):undefined};
}

export function validateSoloRacerBackup(value,events){
 if(!value||value.schemaVersion!==1)return;
 const state=normalizeSoloRacer(value),byId=new Map(events.map(event=>[event.eventId,event]));
 const fail=()=>{throw new TypeError('The racing career backup is incomplete.');};
 if(!['available',...phases].includes(state.phase))fail();
 if(state.phase==='available'){if(state.acceptedAt||state.completedAt||Object.keys(state.evidence).length)fail();return;}
 if(!Number.isFinite(state.acceptedAt)||state.acceptedAt<=0||!personalVehicleById(state.vehicleId))fail();
 function accepted(id){const event=byId.get(id);if(!event||!finishEvidence(event,{...state,ownerUid:event.metadata?.racingOwnerUid}))fail();return event;}
 const index=phases.indexOf(state.phase);
 if(index>=1)accepted(state.evidence.first);
 if(index>=2){const event=accepted(state.evidence.clean);if(event.metadata.barrierContacts||event.metadata.penaltyMs||event.eventId===state.evidence.first)fail();}
 if(index>=3){const event=accepted(state.evidence.improved),baseline=accepted(state.evidence.benchmark),a=finishEvidence(event,{...state,ownerUid:event.metadata.racingOwnerUid}),b=finishEvidence(baseline,{...state,ownerUid:baseline.metadata.racingOwnerUid});if(a.key!==b.key||a.timeMs>b.timeMs*.99||event.eventId===baseline.eventId)fail();}
 for(const [id,row] of Object.entries(state.venueResults)){if(!SOLO_RACER.venues.includes(id)||accepted(row.eventId).metadata.racingVenueId!==id)fail();}
 if(state.phase==='complete'){
  accepted(state.evidence.tour);
  if(!state.completedAt||!SOLO_RACER.venues.every(id=>state.venueResults[id])||byId.get(SOLO_RACER.receiptId)?.eventType!=='campaign-completed')fail();
 }
 if(state.repeat){if(!['clean-series','pace-session'].includes(state.repeat.id)||!['active','complete'].includes(state.repeat.phase))fail();for(const id of state.repeat.evidenceIds)accepted(id);}
}
