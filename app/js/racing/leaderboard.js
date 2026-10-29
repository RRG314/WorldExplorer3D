import {createActivityCompletionStore} from '../activity-discovery/completion.js';
import {racingPracticeStorage} from './practice-storage.js';
import {personalVehicleById} from '../transport/vehicle-garage-rules.js';
import {RACE_MAXIMUM_DURATION_MS} from './session-limits.js';

// This is a read projection of accepted Journal events, not another score store
// or a path for sending client times to a verified competition leaderboard.
export async function readRacingPracticeBests({ownerUid='',storage=globalThis.localStorage,lookupEvents,listEventsByIdPrefix,isCurrent=()=>true}={}) {
 const bests=new Map();let legacy=0,cacheUnavailable=false;
 const prefix=`event:activity-completed:racing:${ownerUid||'guest'}:`;
 function consider(event, cachedRow) {
  const m=event?.metadata,car=personalVehicleById(m?.vehicleId);
  if(!m||m.racingPracticeVersion!==1||m.raceVerified!==false||m.outcome!=='completed'||event.eventType!=='activity-completed'||!car
   ||!/^race-practice-[a-f0-9]{32}$/.test(m.recordKey)||!/^road-race-[a-f0-9]{32}$/.test(m.courseId)
   ||!Number.isFinite(m.elapsedMs)||m.elapsedMs<=0||m.elapsedMs>RACE_MAXIMUM_DURATION_MS)return;
  if((m.racingOwnerUid??'')!==ownerUid||cachedRow&&(m.recordKey!==cachedRow.id||m.elapsedMs!==cachedRow.bestTimeMs)){legacy++;return;}
  const old=bests.get(m.recordKey);if(old&&old.timeMs<=m.elapsedMs)return;
  const condition=m.raceConfiguration?.condition;
  bests.set(m.recordKey,{id:m.recordKey,courseId:m.courseId,courseName:String(event.name||'Road race').slice(0,120),location:String(event.regionLabel||'Earth').slice(0,120),
   vehicleId:car.id,vehicleLabel:car.label,timeMs:m.elapsedMs,condition:Number.isFinite(condition)?Math.round(condition*100):null,
   setupId:m.recordKey.slice(-6),physicsVersion:String(m.physicsVersion||''),eventId:event.eventId});
 }
 // Journal is the durable owner. Prefix pages use its existing primary key and
 // retain old bests even after cache removal or Journal export/import.
 if(listEventsByIdPrefix){
  let after='';
  do {
   if(!isCurrent())return null;
   const page=await listEventsByIdPrefix(prefix,{after,limit:64});
   if(!isCurrent())return null;
   if(!Array.isArray(page?.events)||page.events.length>64||page.events.some(e=>typeof e.eventId!=='string'||!e.eventId.startsWith(prefix)||e.eventId<=after))throw Error('race_journal_invalid_page');
   page.events.forEach(event=>consider(event));
   const next=page.nextCursor;
   if(next&&(typeof next!=='string'||!next.startsWith(prefix)||next<=after||next!==page.events.at(-1)?.eventId))throw Error('race_journal_invalid_cursor');
   after=next||'';
  }while(after);
 }
 const history=createActivityCompletionStore({storage:()=>racingPracticeStorage(ownerUid,storage)});
 const rows=history.entries().filter(row=>/^race-practice-[a-f0-9]{32}$/.test(row.id)&&Number.isFinite(row.bestTimeMs)&&row.bestTimeMs>0&&row.bestTimeMs<=RACE_MAXIMUM_DURATION_MS&&row.journalSavedAt);
 if(!history.isReadable()){if(!listEventsByIdPrefix)throw Error('race_records_unreadable');cacheUnavailable=true;}
 if(!listEventsByIdPrefix&&!lookupEvents)throw Error('race_journal_unavailable');
 // Legacy, unprefixed events are only admitted through an account-scoped cache
 // plus matching Journal evidence. Never relabel unknown older account records.
 const byEventId=new Map();
 for(const row of rows){const id=row.bestJournalEventId||row.journalEventId;if(typeof id!=='string'||id.length>260||listEventsByIdPrefix&&id.startsWith(prefix))continue;if(!byEventId.has(id))byEventId.set(id,[]);byEventId.get(id).push(row);}
 const ids=[...byEventId.keys()];
 if(lookupEvents)for(let offset=0;offset<ids.length;offset+=32){
  if(!isCurrent())return null;
  const events=await lookupEvents(ids.slice(offset,offset+32));
  if(!isCurrent())return null;
  for(const event of events)for(const row of byEventId.get(event.eventId)||[])consider(event,row);
 }
 return {ownerUid,legacy,cacheUnavailable,entries:[...bests.values()].sort((a,b)=>a.courseName.localeCompare(b.courseName)||a.timeMs-b.timeMs||a.id.localeCompare(b.id))};
}

export function createRacingTimesView({appCtx,ui,getSignedInUser,limit=10}) {
 let result=null,courseId='',setupId='',source='practice',paintRevision=0,readSequence=0,readCurrent=()=>true;
 const practiceHint=ui.titleHint?.textContent||'Practice results on this device; these are not verified online times.';
 const doc=ui.titleList.ownerDocument,course=ui.racingCourse,setup=ui.racingSetup;
 const text=(tag,value,className)=>{const node=doc.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
 function clear(){paintRevision++;readSequence++;result=null;ui.titleList.replaceChildren();course?.replaceChildren();setup?.replaceChildren();}
 async function paintOnline(){
  const revision=++paintRevision,owner=result?.ownerUid,entry=result?.entries.find(e=>e.id===setupId);
  ui.titleList.replaceChildren(text('li',entry?'Loading shared times…':'Finish an online race to add a course and car class.','flowerLeaderboardEmpty'));
  if(!entry)return;
  if(ui.titleHint)ui.titleHint.textContent='Server-timed races with the same course, car, upgrades, starting condition, grid row and physics version.';
  if(ui.titleScope)ui.titleScope.textContent='Online races • Same car setup';
  try{const {readOnlineRacingRecords}=await import('./service-client.js'),response=await readOnlineRacingRecords({ownerUid:owner,boardId:entry.id});
   if(revision!==paintRevision||source!=='online'||getSignedInUser?.()?.uid!==owner||!readCurrent())return;
   let rank=0;
   ui.titleList.replaceChildren(...response.entries.slice(0,limit).map((row,index)=>{const li=text('li','','flowerLeaderboardItem');
    if(!index||row.timeMs!==response.entries[index-1].timeMs)rank=index+1;
    li.append(text('span',String(rank),'flowerLeaderboardRank'),text('span',row.player,'flowerLeaderboardPlayer'),text('span',`${(row.timeMs/1000).toFixed(2)}s`,'flowerLeaderboardTime'),text('span',entry.vehicleLabel,'flowerLeaderboardLoc'));return li;}));
   if(!response.entries.length)ui.titleList.append(text('li','No shared results for this setup yet.','flowerLeaderboardEmpty'));
   if(ui.status)ui.status.textContent='Server-verified times · Fastest first · Blocked players omitted';
  }catch{if(revision===paintRevision&&source==='online'&&getSignedInUser?.()?.uid===owner&&readCurrent())ui.titleList.replaceChildren(text('li','Shared times could not load. Try Refresh. Your results are kept.','flowerLeaderboardEmpty'));}
 }
 function paint(){
  if(!result||(getSignedInUser?.()?.uid||'')!==result.ownerUid){clear();return;}
  if(ui.titleBadge)ui.titleBadge.textContent=source==='online'?'Online racing':'My racing times';
  if(ui.titleScope)ui.titleScope.textContent=source==='online'?'Online races • Same car setup':'This device • Practice';
  if(ui.titleHint)ui.titleHint.textContent=source==='online'?'Server-timed races with the same course, car, upgrades, starting condition, grid row and physics version.':practiceHint;
  if(source==='online'){void paintOnline();return;}paintRevision++;
  const entries=result.entries.filter(e=>e.courseId===courseId&&(setupId==='all'||e.id===setupId));
  ui.titleList.replaceChildren(...entries.slice(0,limit).map(entry=>{
   const li=doc.createElement('li');li.className='flowerLeaderboardItem';
   li.append(text('span','PB','flowerLeaderboardRank'),text('span',entry.vehicleLabel,'flowerLeaderboardPlayer'),text('span',`${(entry.timeMs/1000).toFixed(2)}s`,'flowerLeaderboardTime'),
    text('span',`${entry.location} · ${entry.condition===null?'Saved setup':`${entry.condition}% condition`} · Setup ${entry.setupId}`,'flowerLeaderboardLoc'));return li;
  }));
  if(!entries.length){const li=text('li','Finish a race to add a practice time.','flowerLeaderboardEmpty');ui.titleList.append(li);}
  if(ui.status)ui.status.textContent=`${result.entries.length} car setup best${result.entries.length===1?'':'s'} saved on this device${entries.length>limit?` · Showing ${limit}; choose a setup to see another`:''}${result.legacy?' · Older records remain in your Journal':''}${result.cacheUnavailable?' · Older device cache unavailable':''}`;
 }
 function setSetups(){
  const rows=result.entries.filter(e=>e.courseId===courseId);
  if(!rows.some(e=>e.id===setupId))setupId=source==='online'?rows[0]?.id||'':'all';
  if(setup){setup.replaceChildren(...(source==='online'?[]:[new Option('All my car setups','all')]),...rows.map(e=>new Option(`${e.vehicleLabel} · ${e.condition===null?'saved':e.condition+'%'}${source==='online'&&Number.isInteger(e.gridRow)?` · Row ${e.gridRow+1}`:''} · ${e.setupId}`,e.id)));setup.value=setupId;setup.disabled=!rows.length;}
  paint();
 }
 if(course)course.onchange=()=>{courseId=course.value;setupId='all';setSetups();};
 if(setup)setup.onchange=()=>{setupId=setup.value;paint();};
 async function read(isCurrent){
  readCurrent=isCurrent;const request=++readSequence,expected=source,current=()=>request===readSequence&&source===expected&&isCurrent();
  const ownerUid=getSignedInUser?.()?.uid||'';
  if(source==='online'){
   if(!ownerUid)throw Error('race_signed_account_required');
   const {readOnlineRacingRecords}=await import('./service-client.js'),entries=[];let cursor='';
   do{const response=await readOnlineRacingRecords({ownerUid,...(cursor?{cursor}:{})});if(!current())return null;
    if(!Array.isArray(response.entries)||response.entries.length>32||response.entries.some(e=>!/^([a-f0-9]{64})$/.test(e.id)||e.id<=cursor)||response.nextCursor&&(response.nextCursor<=cursor||response.nextCursor!==response.entries.at(-1)?.id))throw Error('invalid_race_board_page');
    entries.push(...response.entries);cursor=response.nextCursor||'';
   }while(cursor);
   return {ownerUid,entries:entries.map(r=>({id:r.id,courseId:r.courseId,courseName:r.courseName,vehicleLabel:personalVehicleById(r.configuration.vehicleId)?.label||'Car',
    timeMs:r.timeMs,condition:Math.round(r.configuration.condition*100),gridRow:r.configuration.gridRow,setupId:r.id.slice(-6),location:r.location}))};
  }
  let store=appCtx.discoveryProfileStore;
  if(!store?.listEventsByIdPrefix){const {createIndexedDbDiscoveryProfileStore}=await import('../discovery/profile-store.js?v=5');store=createIndexedDbDiscoveryProfileStore();}
  return readRacingPracticeBests({ownerUid,lookupEvents:appCtx.getExplorerEventsById||store.getEventsById?.bind(store),
   listEventsByIdPrefix:store.listEventsByIdPrefix.bind(store),isCurrent:()=>current()&&(getSignedInUser?.()?.uid||'')===ownerUid});
 }
 if(ui.racingSource)ui.racingSource.onchange=()=>{source=ui.racingSource.value==='online'?'online':'practice';clear();const expected=source;
  void read(readCurrent).then(next=>{if(source===expected&&next)render(next);}).catch(()=>{if(source===expected){ui.titleList.replaceChildren(text('li',source==='online'?'Online results could not load. Sign in and try Refresh.':'Practice times could not load. Try Refresh.','flowerLeaderboardEmpty'));}});};
 function render(next){
  result=next;if(!result||(getSignedInUser?.()?.uid||'')!==result.ownerUid){clear();return;}
  const courses=[...new Map(result.entries.map(e=>[e.courseId,e])).values()];
  if(!courses.some(e=>e.courseId===courseId))courseId=courses[0]?.courseId||'';
  if(course){course.replaceChildren(...courses.map(e=>new Option(e.courseName,e.courseId)));course.value=courseId;course.disabled=!courses.length;}
  setSetups();
 }
 return {clear,read,render};
}
