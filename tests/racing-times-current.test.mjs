import test from 'node:test';
import assert from 'node:assert/strict';
import {createActivityCompletionStore} from '../app/js/activity-discovery/completion.js';
import {racingPracticeStorage} from '../app/js/racing/practice-storage.js';
import {readRacingPracticeBests} from '../app/js/racing/leaderboard.js';
import {createFlowerChallengeLeaderboardApi} from '../app/js/flower-challenge/leaderboard.js';

const record='race-practice-'+ 'a'.repeat(32),courseId='road-race-'+ 'b'.repeat(32);
function fixture(){
 const disk=new Map(),events=new Map(),storage={getItem:key=>disk.get(key),setItem:(key,value)=>disk.set(key,value)},queries=[];
 const lookupEvents=async ids=>{queries.push(ids);return ids.map(id=>events.get(id)).filter(Boolean);};
 const store=owner=>createActivityCompletionStore({storage:()=>racingPracticeStorage(owner,storage),eventNamespace:`racing:${owner||'guest'}`,recordEvent:async e=>{events.set(e.eventId,e);return {recorded:true,event:e};},context:()=>({regionLabel:'Monaco'})});
 const save=(s,owner,ms,id=record)=>s.complete({id,title:'Monaco · District sprint'},ms,{}, {pointsFirst:0,metadata:{racingPracticeVersion:1,raceVerified:false,recordKey:id,courseId,vehicleId:'bmw_e34',elapsedMs:ms,racingOwnerUid:owner,raceConfiguration:{condition:1}}});
 return {disk,events,storage,lookupEvents,queries,store,save,read:owner=>readRacingPracticeBests({ownerUid:owner,storage,lookupEvents})};
}
test('practice bests retain the fastest Journal event across slower replays and account changes',async()=>{
 const f=fixture(),a=f.store('account-a'),b=f.store('account-b'),guest=f.store('');
 await f.save(a,'account-a',1000);const best=a.get(record).bestJournalEventId;
 await f.save(a,'account-a',2000);assert.equal(a.get(record).bestJournalEventId,best);assert.notEqual(a.get(record).journalEventId,best);
 await f.save(b,'account-b',3000);await f.save(guest,'',4000);assert.equal(f.events.size,4,'same car/course/count cannot collide between owners');
 assert.equal((await f.read('account-a')).entries[0].timeMs,1000);assert.equal((await f.read('account-b')).entries[0].timeMs,3000);assert.equal((await f.read('')).entries[0].timeMs,4000);
 await f.save(a,'account-a',900);assert.equal((await f.read('account-a')).entries[0].timeMs,900);assert.equal(f.store('account-a').get(record).bestTimeMs,900);
});
test('a cached time without matching Journal evidence is excluded without changing saved history',async()=>{
 const f=fixture(),s=f.store('account-a');await f.save(s,'account-a',1000);
 const key='worldExplorer3D.activityCompletions.v1:account:account-a',cache=JSON.parse(f.disk.get(key));cache[record].bestTimeMs=1;f.disk.set(key,JSON.stringify(cache));const before=f.disk.get(key);
 assert.deepEqual((await f.read('account-a')).entries,[]);assert.equal(f.disk.get(key),before);
 cache[record].bestTimeMs=1000;cache[record].bestJournalEventId=null;f.disk.set(key,JSON.stringify(cache));assert.equal((await f.read('account-a')).entries.length,1,'legacy row is usable only when its last event actually matches the best');
 f.events.clear();assert.equal((await f.read('account-a')).entries.length,0);
});
test('accepted long-race Journal times remain visible and out-of-bound times cannot become practice records',async()=>{
 const f=fixture(),store=f.store('long-course-driver');
 await f.save(store,'long-course-driver',1200000);
 assert.equal((await f.read('long-course-driver')).entries[0].timeMs,1200000);
 const invalid='race-practice-'+'f'.repeat(32);await f.save(store,'long-course-driver',2700001,invalid);
 const read=await f.read('long-course-driver');assert.equal(read.entries.length,1);assert.equal(read.entries[0].timeMs,1200000);
});
test('Journal reads stay bounded and an obsolete owner cannot publish a partial board',async()=>{
 const f=fixture(),s=f.store('account-a');for(let i=0;i<65;i++)await f.save(s,'account-a',1000+i,'race-practice-'+i.toString(16).padStart(32,'0'));
 assert.equal((await f.read('account-a')).entries.length,65);assert.deepEqual(f.queries.map(ids=>ids.length),[32,32,1]);
 let current=true;assert.equal(await readRacingPracticeBests({ownerUid:'account-a',storage:f.storage,isCurrent:()=>current,lookupEvents:async ids=>{current=false;return f.lookupEvents(ids);}}),null);
 await assert.rejects(readRacingPracticeBests({storage:{getItem(){throw Error('blocked');}},lookupEvents:f.lookupEvents}),/unreadable/);
});
test('legacy leaderboard writers cannot send practice to a public board or the flower cache',async()=>{
 let calls=0;const api=createFlowerChallengeLeaderboardApi({challengeState:{},ui:{},constants:{},normalizeChallengeType:v=>v,readLocalLeaderboard(){calls++;},getFirebaseServices(){calls++;}});
 assert.equal(api.getLeaderboardCollection('racing'),null);assert.equal(api.getLeaderboardStorageKey('racing'),null);
 assert.equal(await api.writeRemoteLeaderboard('racing',{timeMs:1}),false);assert.equal(api.storeLocalResult('racing',{}),false);assert.equal(calls,0);
});

test('Journal prefix pages preserve bests after cache loss and new runs keep distinct identities',async()=>{
 const f=fixture(),s=f.store('account-a');
 const save=(store,ms,completionId)=>store.complete({id:record,title:'Monaco'},ms,{}, {pointsFirst:0,completionId,metadata:{racingPracticeVersion:1,raceVerified:false,recordKey:record,courseId,vehicleId:'bmw_e34',elapsedMs:ms,racingOwnerUid:'account-a'}});
 await save(s,1000,'practice:first');
 f.disk.clear();await save(f.store('account-a'),2000,'practice:second');
 assert.equal(f.events.size,2,'cache loss must not reuse an earlier Journal event');
 const {createMemoryDiscoveryProfileStore}=await import('../app/js/discovery/profile-store.js');
 const journal=createMemoryDiscoveryProfileStore();for(const e of f.events.values())await journal.recordExplorerEvent(e);
 f.disk.clear();const queries=[];
 const read=()=>readRacingPracticeBests({ownerUid:'account-a',storage:f.storage,listEventsByIdPrefix:async(prefix,page)=>{queries.push({prefix,page});return journal.listEventsByIdPrefix(prefix,page);}});
 assert.equal((await read()).entries[0].timeMs,1000,'Journal remains authoritative without a completion cache');
 assert.equal(queries[0].prefix,'event:activity-completed:racing:account-a:');assert.equal(queries[0].page.limit,64);
 assert.equal((await readRacingPracticeBests({ownerUid:'account-b',storage:f.storage,listEventsByIdPrefix:journal.listEventsByIdPrefix})).entries.length,0);
 let current=true;assert.equal(await readRacingPracticeBests({ownerUid:'account-a',storage:f.storage,isCurrent:()=>current,listEventsByIdPrefix:async(...args)=>{current=false;return journal.listEventsByIdPrefix(...args);}}),null);
 assert.equal((await readRacingPracticeBests({ownerUid:'account-a',storage:{getItem(){throw Error('blocked');}},listEventsByIdPrefix:journal.listEventsByIdPrefix})).entries[0].timeMs,1000);
 await assert.rejects(journal.listEventsByIdPrefix('event:test:',{after:'other-prefix'}),/prefix/);
 await assert.rejects(journal.listEventsByIdPrefix('event:test:',{limit:65}),/page/);
});

test('prefix reads page beyond 64 records and reject nonadvancing cursors',async()=>{
 const f=fixture(),s=f.store('account-a');for(let i=0;i<130;i++)await f.save(s,'account-a',1000+i,'race-practice-'+i.toString(16).padStart(32,'0'));
 const {createMemoryDiscoveryProfileStore}=await import('../app/js/discovery/profile-store.js');const journal=createMemoryDiscoveryProfileStore();
 for(const e of f.events.values())await journal.recordExplorerEvent(e);
 const pages=[];const result=await readRacingPracticeBests({ownerUid:'account-a',storage:f.storage,listEventsByIdPrefix:async(...args)=>{const page=await journal.listEventsByIdPrefix(...args);pages.push(page.events.length);return page;}});
 assert.equal(result.entries.length,130);assert.deepEqual(pages,[64,64,2]);
 await assert.rejects(readRacingPracticeBests({ownerUid:'account-a',storage:f.storage,listEventsByIdPrefix:async()=>({events:[],nextCursor:'event:activity-completed:racing:account-a:bad'})}),/cursor/);
});
