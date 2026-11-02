const clone=value=>JSON.parse(JSON.stringify(value));
const coordinate=p=>p&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180;
const distance=(a,b)=>Math.hypot((a.lat-b.lat)*111000,(a.lon-b.lon)*111000*Math.cos(a.lat*Math.PI/180));
export const GEOLOGY_CAREER=Object.freeze({id:'geology',version:1,title:'Reading the Landscape',badge:'Geologist Field Survey',sourceUrl:'https://pubs.usgs.gov/gip/collect1/collectgip.html'});
export const GEOLOGY_STUDIES=Object.freeze({
 campaign:Object.freeze({label:'Reading the Landscape',question:'What can two contrasting rocks tell us about a landscape?',a:{name:'Coarse crystalline rock',texture:'interlocking-crystals',grain:'coarse',grainMm:4,scratch:'glass-scratched',classification:'igneous',model:'granite'},b:{name:'Bedded sandstone',texture:'rounded-grains',grain:'medium',grainMm:.6,scratch:'mixed-response',classification:'sedimentary',model:'sandstone'},interpretation:'different-processes-age-uncertain',conclusion:'The crystalline and bedded rocks record different formation processes. These separated exposures do not establish their relative ages.'}),
 'cooling-rates':Object.freeze({label:'A Tale of Two Textures',question:'How does crystal size help compare two igneous rocks?',a:{name:'Coarse crystalline rock',texture:'interlocking-crystals',grain:'coarse',grainMm:4,scratch:'glass-scratched',classification:'igneous',model:'granite'},b:{name:'Fine volcanic rock',texture:'fine-crystalline',grain:'fine',grainMm:.1,scratch:'mixed-response',classification:'igneous',model:'basalt'},interpretation:'different-cooling-rates',conclusion:'The coarse crystals support slower cooling than the fine crystalline texture. Cooling rate is an interpretation of the training evidence, not a measured age.'}),
 'sediment-comparison':Object.freeze({label:'Reading the Grain Boundary',question:'What changes between coarse and fine sedimentary beds?',a:{name:'Bedded sandstone',texture:'rounded-grains',grain:'medium',grainMm:.6,scratch:'mixed-response',classification:'sedimentary',model:'sandstone'},b:{name:'Fine laminated mudstone',texture:'fine-laminae',grain:'fine',grainMm:.04,scratch:'no-clear-scratch',classification:'sedimentary',model:'mudstone'},interpretation:'contrasting-deposition',conclusion:'The contrasting grain sizes support different depositional conditions. Grain size alone cannot establish a unique cause or date.'})
});
export function normalizeGeologyCareer(value){if(value?.schemaVersion!=null&&value.schemaVersion!==1)return clone(value);return {schemaVersion:1,revision:0,completed:{},active:null,...clone(value||{})};}
function validateSite(site){
 if(!site||!coordinate(site.location)||!site.id||site.truthType!=='virtual-training-site'||!['a','b','bench'].every(id=>coordinate(site.points?.[id])))throw Error('Choose a supported virtual field course.');
 if(distance(site.points.a,site.points.b)<8||distance(site.points.a,site.points.b)>60||distance(site.location,site.points.b)>120)throw Error('The field course layout is not supported.');
 if(site.locationContext&&!coordinate(site.locationContext))throw Error('The saved field destination is invalid.');
 return {locationContext:site.locationContext?{lat:site.locationContext.lat,lon:site.locationContext.lon,name:String(site.locationContext.name||site.name).slice(0,120)}:null,id:String(site.id).slice(0,100),name:String(site.name||'Virtual geology field course').slice(0,120),truthType:'virtual-training-site',location:{lat:site.location.lat,lon:site.location.lon},points:Object.fromEntries(['a','b','bench'].map(id=>[id,{lat:site.points[id].lat,lon:site.points[id].lon}]))};
}
function physicallyAt(active,target,evidence,now){
 if(evidence?.supported!==true||!Number.isFinite(evidence.verticalDistance)||Math.abs(evidence.verticalDistance)>2.5||evidence?.environment!=='EARTH'||evidence.travelMode!=='walk'||evidence.liveGps||evidence.siteId!==active.site.id||!coordinate(evidence.position)||!Number.isFinite(evidence.at)||Math.abs(now-evidence.at)>2000||distance(evidence.position,active.site.points[target])>3)throw Error('Walk to the marked station before recording this step.');
}
function sourceMap(value){
 if(value?.status==='unavailable'&&typeof value.checkedAt==='number')return {status:'unavailable',checkedAt:value.checkedAt,scope:'map-unavailable-no-unit-inferred'};
 const fetchedAt=typeof value?.fetchedAt==='string'?Date.parse(value.fetchedAt):value?.fetchedAt;
 if(value?.status!=='reference'||!value.items?.length||value.items.length>16||!Number.isFinite(fetchedAt))throw Error('Review the local geological map or record that its source is unavailable.');
 return {status:'reference',fetchedAt,items:value.items.map(row=>({id:String(row.id).slice(0,120),name:String(row.name).slice(0,240),material:String(row.material).slice(0,500),citation:String(row.citation).slice(0,500),sourceUrl:/^https:\/\/(?:energy\.usgs\.gov|ngmdb\.usgs\.gov|macrostrat\.org)\//.test(row.sourceUrl||'')?row.sourceUrl:null})),scope:'published-map-not-proof-of-training-rocks'};
}
export function transitionGeologyCareer(value,command,now=Date.now()){
 const state=normalizeGeologyCareer(value);if(state.schemaVersion!==1)throw Error('This field career needs a newer version of World Explorer.');
 if(command?.revision!==state.revision)throw Error('This study changed in another tab. Reopen the assignment to continue.');
 if(!Number.isFinite(now)||now<=0)throw Error('This step could not be timed. Try again.');
 let active=state.active?clone(state.active):null,samples=[];const completed={...state.completed};
 if(command.type==='accept'){
  const variantId=command.variantId||'campaign';if(!GEOLOGY_STUDIES[variantId]||variantId!=='campaign'&&!completed.campaign)throw Error('Finish Reading the Landscape before starting this study.');
  if(active&&active.phase!=='complete'){if(active.variantId!==variantId)throw Error('Continue your current field study before choosing another.');return {state,event:null,samples};}
  if(!/^[a-zA-Z0-9-]{8,64}$/.test(command.runId||''))throw Error('This field study could not start. Try again.');
  const site=validateSite(command.site);
  active={runId:command.runId,variantId,site,acceptedAt:now,phase:'exposure-a',observations:{},samples:{},tests:{},classifications:{},map:null,interpretation:null,completedAt:0};
 }else{
  if(!active||active.phase==='complete')throw Error('Choose a field study first.');
  const study=GEOLOGY_STUDIES[active.variantId];if(!study)throw Error('This saved study needs a newer version of World Explorer.');
  if(command.type==='observe'&&['exposure-a','exposure-b'].includes(active.phase)){
   const target=active.phase==='exposure-a'?'a':'b';physicallyAt(active,target,command.evidence,now);
   if(command.texture!==study[target].texture||command.grain!==study[target].grain)throw Error('Compare your notes with the visible grains and layers before saving.');
   if(target==='b'){if(command.mapScope!=='context-not-proof')throw Error('The real geological map gives context; it does not verify the virtual training specimens.');active.map=sourceMap(command.map);}
   active.observations[target]={texture:command.texture,grain:command.grain,at:now,position:clone(command.evidence.position)};active.phase=target==='a'?'exposure-b':'samples';
  }else if(command.type==='collect'&&active.phase==='samples'){
   const target=command.sampleId;if(!['a','b'].includes(target))throw Error('Choose a designated sample.');physicallyAt(active,target,command.evidence,now);
   if(active.samples[target])throw Error('That labeled sample is already in your collection.');
   if(command.labelSite!==target||command.labelLayer!==`face-${target}`)throw Error('Label this sample with its correct site and exposed face before taking it.');
   const instanceId=`research:${active.runId}:sample:${target}`,claimId=`claim:${instanceId}`;
   const sample={instanceId,claimId,catalogId:`training-geology-${study[target].model}`,name:`${study[target].name} · Face ${target.toUpperCase()}`,description:`Virtual training specimen from ${active.site.name}, face ${target.toUpperCase()}. Not a real-location discovery.`,quantity:1,authority:'anonymous-local',tradeable:false,provenance:'field-discovery',sourceEventId:`event:research:${active.runId}:${state.revision+1}`,collectedAt:now,regionId:active.site.id,regionLabel:active.site.name,evidenceClass:'virtual-training-specimen',researchLabel:{careerId:'geology',runId:active.runId,siteId:active.site.id,face:target,layer:`face-${target}`}};
   active.samples[target]={instanceId,claimId,siteId:target,layer:`face-${target}`,at:now};samples.push(sample);if(active.samples.a&&active.samples.b)active.phase='bench';
  }else if(command.type==='test'&&active.phase==='bench'){
   physicallyAt(active,'bench',command.evidence,now);const target=command.sampleId;if(!active.samples[target]||!command.custody?.includes(active.samples[target].instanceId))throw Error('Bring your labeled sample to the bench. Retrieve stored specimens from your home first.');
   if(!['lens','scratch'].includes(command.method))throw Error('Choose the hand lens or the virtual grain probe.');
   const key=`${target}:${command.method}`;if(active.tests[key])throw Error('That test is already in your field record.');
   active.tests[key]={sampleId:target,method:command.method,result:command.method==='lens'?{texture:study[target].texture,grainMm:study[target].grainMm,truthType:'simulated'}:{response:study[target].scratch,truthType:'simulated'},at:now};
  }else if(command.type==='classify'&&active.phase==='bench'){
   physicallyAt(active,'bench',command.evidence,now);
   if(!['a:lens','b:lens','a:scratch','b:scratch'].every(key=>active.tests[key]))throw Error('Compare both labeled samples with both bench methods first.');
   for(const id of ['a','b'])if(![study[id].classification,'uncertain'].includes(command.classifications?.[id]))throw Error('Choose a classification supported by your texture observations, or retain uncertainty.');
   active.classifications={a:command.classifications.a,b:command.classifications.b};active.phase='interpretation';
  }else if(command.type==='interpret'&&active.phase==='interpretation'){
   physicallyAt(active,'bench',command.evidence,now);
   if(Object.values(active.classifications).includes('uncertain')&&command.interpretation!=='need-more-evidence')throw Error('Keep this report inconclusive while either specimen remains unclassified.');
   if(![study.interpretation,'need-more-evidence'].includes(command.interpretation))throw Error('That conclusion goes beyond your paired observations. Use the supported comparison or keep the result inconclusive.');
   active.interpretation={choice:command.interpretation,conclusion:command.interpretation==='need-more-evidence'?'The study remains inconclusive. Retain the observations and plan a follow-up comparison.':study.conclusion,at:now};active.phase='complete';active.completedAt=now;completed[active.variantId]=`event:research:${active.runId}:${state.revision+1}`;
  }else throw Error('That action does not match the current field step.');
 }
 const revision=state.revision+1,next={...state,revision,active,completed},complete=command.type==='interpret';
 const title=GEOLOGY_STUDIES[active.variantId].label;
 const event={eventId:`event:research:${active.runId}:${revision}`,eventType:complete?'campaign-completed':'campaign-progress',sourceSystem:'research-careers',sourceId:`geology:${active.variantId}:${command.type}:${command.sampleId||''}:${command.method||''}`,activityId:'geology-inspect',pathId:'field',name:`${title} · ${complete?'field report':command.type==='collect'?'labeled specimen':command.type==='test'?'bench test':command.type==='classify'?'sample comparison':command.type==='observe'?'exposure observation':'field plan'}`,detail:complete?active.interpretation.conclusion:'Virtual geology field course. The real geological map is context; the training objects are authored game content.',occurredAt:now,environment:'EARTH',regionId:active.site.id,regionLabel:active.site.name,locationSnapshot:{...active.site.location,name:active.site.name},points:0,firstCompletion:complete&&!state.completed[active.variantId],projections:{journal:true,profile:command.type!=='accept',place:false},metadata:{careerId:'geology',runId:active.runId,variantId:active.variantId,phase:active.phase,truthType:'virtual-training-site',...(complete?{sitePlan:active.site.points,observations:active.observations,samples:active.samples,tests:active.tests,classifications:active.classifications,map:active.map,interpretation:active.interpretation}:{}),sourceRefs:[{url:GEOLOGY_CAREER.sourceUrl,truthType:'reference'}]}};
 return {state:next,event,samples};
}
export function geologyCareerSummary(value,{variantId='campaign'}={}){
 const state=normalizeGeologyCareer(value),active=state.active,study=GEOLOGY_STUDIES[variantId]||GEOLOGY_STUDIES.campaign;
 const phases=['exposure-a','exposure-b','samples','bench','interpretation','complete'],index=active?.variantId===variantId?phases.indexOf(active.phase):-1;
 return {title:study.label,summary:study.question,resume:index>=0&&index<5,choices:Object.entries(GEOLOGY_STUDIES).filter(([id])=>id==='campaign'||state.completed.campaign).map(([id,row])=>({id,label:row.label})),stages:['Observe and frame Exposure A','Compare Exposure B and the local geological map','Label and carry two contrasting training specimens','Compare texture and grain-probe evidence at the bench','Save a supported landscape interpretation'].map((label,i)=>({label,complete:index>i}))};
}
export function validateGeologyCareerBackup(value,events,items){
 if(!value||value.schemaVersion!==1)return;
 const state=normalizeGeologyCareer(value),active=state.active,byId=new Map(events.map(event=>[event.eventId,event]));
 const fail=()=>{throw new TypeError('This field-study backup is incomplete.');};
 if(!Number.isSafeInteger(state.revision)||state.revision<0)fail();
 for(const [id,receiptId] of Object.entries(state.completed)){
  const event=byId.get(receiptId);if(!GEOLOGY_STUDIES[id]||event?.sourceSystem!=='research-careers'||event.eventType!=='campaign-completed'||event.metadata?.careerId!=='geology'||event.metadata?.variantId!==id||event.metadata.phase!=='complete')fail();
 }
 if(!active)return;if(!GEOLOGY_STUDIES[active.variantId]||!Number.isFinite(active.acceptedAt)||active.acceptedAt<=0)fail();
 validateSite(active.site);
 const phases=['exposure-a','exposure-b','samples','bench','interpretation','complete'],index=phases.indexOf(active.phase);if(index<0)fail();
 const study=GEOLOGY_STUDIES[active.variantId];
 for(const id of ['a','b'])if(active.observations[id]){const row=active.observations[id];if(row.texture!==study[id].texture||row.grain!==study[id].grain||!coordinate(row.position)||distance(row.position,active.site.points[id])>3)fail();}
 if(index>=1&&!active.observations.a||index>=2&&!active.observations.b)fail();
 for(const [id,row] of Object.entries(active.samples)){
  const item=items.find(item=>item.instanceId===row.instanceId);if(!['a','b'].includes(id)||row.siteId!==id||row.layer!==`face-${id}`||!item||item.researchLabel?.runId!==active.runId||item.researchLabel?.face!==id||!byId.has(item.sourceEventId))fail();
 }
 if(index>=3&&(!active.samples.a||!active.samples.b))fail();
 for(const [key,row] of Object.entries(active.tests)){if(!['a:lens','b:lens','a:scratch','b:scratch'].includes(key)||key!==`${row.sampleId}:${row.method}`||row.result?.truthType!=='simulated')fail();}
 if(index>=4){if(Object.keys(active.tests).length!==4||!['a','b'].every(id=>[study[id].classification,'uncertain'].includes(active.classifications[id])))fail();}
 const records=events.filter(event=>event.sourceSystem==='research-careers'&&event.metadata?.careerId==='geology'&&event.metadata.runId===active.runId),last=byId.get(`event:research:${active.runId}:${state.revision}`)||null;
 const expected=index<2?index+1:index===2?3+Object.keys(active.samples).length:index===3?5+Object.keys(active.tests).length:index===4?10:11;
 if(records.length!==expected||last?.sourceSystem!=='research-careers'||last.metadata?.runId!==active.runId||last.metadata.phase!==active.phase)fail();
 if(active.phase==='complete'&&(!active.completedAt||state.completed[active.variantId]!==last.eventId||!active.interpretation))fail();
}
export function geologyCareerBadge(value){const state=normalizeGeologyCareer(value);return state.schemaVersion===1&&state.completed.campaign?{id:'geologist-field-survey',label:GEOLOGY_CAREER.badge,detail:'Compared two exposures, labeled specimens, bench evidence and a supported field interpretation.',eventId:state.completed.campaign}:null;}
