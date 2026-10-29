import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {buildRaceRoadGraph,createRaceCourse,raceCourseKey,raceCourseReference,raceDistrictFingerprint,canonicalRaceDistrict,RACE_PHYSICS_VERSION,readPublishedRaceCourse} from '../services/racing/generated/engine.mjs';
const {adoptCuratedRacingRoute,moderateRacingRoute,writeRacingRoute,locationKey}=createRequire(import.meta.url)('../functions/racing-publication.js');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const facts=canonicalRaceDistrict({type:'RaceDistrictFacts',version:1,locationId:'earth:430000000:70000000',locationLabel:'Controlled district',anchor:{lat:43,lon:7},metersPerUnit:1,
 roads:[{sourceId:'controlled',a:{x:0,y:0,z:0,connectionLayer:'node:1'},b:{x:0,y:0,z:250,connectionLayer:'node:2'},widthMeters:8,structure:'surface',clearanceMeters:0,direction:'both',driveable:true,supported:true,heightSampleSpanMeters:1.2,heightSamples:[{t:0,y:0,leftY:0,rightY:0},{t:1,y:0,leftY:0,rightY:0}]}]});
const fingerprint=await raceDistrictFingerprint(facts),districtId=fingerprint.slice(14),course=createRaceCourse(buildRaceRoadGraph(facts.roads),['controlled:forward'],{...facts,participants:4}),id=await raceCourseKey(course),reference=raceCourseReference(course,fingerprint),revision=hash({districtId,reference});
function fixture(){
 const rows=new Map(),writes=[],route='racingCourses/'+id,source='users/creator/racingRoutes/'+id;let generated=0;
 const ref=path=>({path,get:async()=>({exists:rows.has(path),data:()=>rows.get(path)}),collection:name=>ref(path+'/'+name),doc:name=>ref(path+'/'+(name??'generated-'+ ++generated)),limit:count=>({path,count})});
 const db={collection:ref,async runTransaction(operation){const pending=[];const result=await operation({get:async r=>r.count?{size:[...rows.keys()].filter(key=>key.startsWith(r.path+'/')).slice(0,r.count).length}:{exists:rows.has(r.path),data:()=>rows.get(r.path)},
  update:(r,value)=>pending.push(['merge',r.path,value]),set:(r,value)=>pending.push(['set',r.path,value]),delete:r=>pending.push(['delete',r.path]),create:(r,value)=>{assert.equal(rows.has(r.path),false);pending.push(['set',r.path,value]);}});
  for(const [kind,path,value]of pending){writes.push({kind,path});if(kind==='delete')rows.delete(path);else rows.set(path,kind==='merge'?{...rows.get(path),...value}:value);}return result;
 }};
 const admin={firestore:{Timestamp:{fromMillis:value=>({toMillis:()=>value})}}};
 rows.set(route,{ownerUid:'creator',status:'approved',revision,reference,districtId,qualification:{resultId:'test-result',revision,physicsVersion:RACE_PHYSICS_VERSION,timeMs:12345}});
 rows.set('racingDistricts/'+districtId,{status:'approved',facts});rows.set('racingLocations/'+locationKey(facts.locationId),{districtId});rows.set(source,{status:'approved'});
 rows.set('racingResults/test-result',{fingerprint:'a'.repeat(64),receipt:{purpose:'qualification',courseId:id,courseRevision:revision,physicsVersion:RACE_PHYSICS_VERSION,players:[{uid:'creator',finished:true,timeMs:12345,credits:0}]}});
 const input={db,admin,id,ownerUid:'creator',revision,note:'First-party starter course; reviewed geographic credits.',nowMs:1700000000000};
 return {rows,writes,route,source,db,admin,input,adopt:approve=>adoptCuratedRacingRoute({...input,approve}),read:path=>Promise.resolve(rows.get(path)||null)};
}
test('curated adoption previews without writes and transfers only a tested, reviewed current course',async()=>{
 const f=fixture(),dry=await f.adopt(false);assert.equal(dry.dryRun,true);assert.equal(dry.qualificationMs,12345);assert.deepEqual(f.writes,[]);
 const result=await f.adopt(true);assert.equal(result.curated,true);assert.equal(result.alreadyCurated,false);
 const route=f.rows.get(f.route);assert.equal(route.ownerUid,null);assert.equal(route.curation.resultFingerprint,'a'.repeat(64));assert.equal(f.rows.has(f.source),false);
 assert.equal(JSON.stringify(route.curation).includes('creator'),false,'Content provenance must not depend on a temporary identity');
 assert.equal((await readPublishedRaceCourse({read:f.read,id,uid:'another-explorer'})).publication.purpose,'competition');
});
test('adoption retry survives removed author/result identity without recreating an account projection',async()=>{
 const f=fixture();await f.adopt(true);f.rows.delete('racingResults/test-result');f.rows.set('captureAccountDeletions/creator',{});f.writes.length=0;
 assert.equal((await f.adopt(true)).alreadyCurated,true);assert.deepEqual(f.writes,[]);assert.equal(f.rows.has(f.source),false);
 assert.equal((await readPublishedRaceCourse({read:f.read,id,uid:'another-explorer'})).publication.ownerUid,null);
});
test('Firestore map ordering does not change the reviewed reference identity',async()=>{
 const f=fixture();f.rows.get(f.route).reference=Object.fromEntries(Object.entries(reference).reverse());
 assert.equal((await f.adopt(false)).dryRun,true);assert.deepEqual(f.writes,[]);
});
test('unreviewed, untested, obsolete, changed-owner and deleted-author routes cannot become curated content',async()=>{
 for(const change of [f=>f.rows.get(f.route).status='review_required',f=>f.rows.get(f.route).qualification=null,
  f=>f.rows.get(f.route).qualification.physicsVersion='obsolete',f=>f.rows.get(f.route).ownerUid='other',f=>f.rows.set('captureAccountDeletions/creator',{}),
  f=>f.rows.get('racingResults/test-result').receipt.players[0].finished=false,f=>f.rows.get('racingResults/test-result').receipt.players[0].timeMs=Infinity,
  f=>f.rows.get('racingResults/test-result').receipt.courseRevision='obsolete',f=>f.rows.get('racingResults/test-result').receipt.purpose='competition']){
  const f=fixture();change(f);await assert.rejects(f.adopt(true),/race_/);assert.deepEqual(f.writes,[]);
 }
});
test('replaced district pointer or altered route cannot bypass publication reconstruction',async()=>{
 for(const change of [f=>f.rows.get('racingLocations/'+locationKey(facts.locationId)).districtId='replacement',f=>f.rows.get(f.route).reference={...reference,name:'Changed after review'}]){
  const f=fixture();change(f);await assert.rejects(f.adopt(true),/race_/);assert.deepEqual(f.writes,[]);
 }
});
test('moderation can remove a curated route without a null-user write, and adoption retry cannot republish it',async()=>{
 const f=fixture();await f.adopt(true);f.writes.length=0;
 const result=await moderateRacingRoute({db:f.db,admin:f.admin,moderatorUid:'reviewer',input:{id,revision,decision:'rejected',note:'Surface changed; testing required again.'}});
 assert.equal(result.status,'rejected');assert.ok(f.writes.every(w=>!w.path.startsWith('users/')));
 assert.equal(await readPublishedRaceCourse({read:f.read,id,uid:'another-explorer'}),null);
 await assert.rejects(f.adopt(true),/race_curated_route_not_approved/);
});
test('a former creator cannot edit or withdraw the platform-owned route',async()=>{
 const f=fixture();await f.adopt(true);f.writes.length=0;
 await assert.rejects(writeRacingRoute({db:f.db,admin:f.admin,uid:'creator',input:{action:'withdraw',id,revision}}),/race_route_owner_required/);
 assert.deepEqual(f.writes,[]);
});
test('a deleted creator releases an archived geometry key, but its qualification and approval cannot transfer',async()=>{
 const f=fixture(),old=f.rows.get(f.route);Object.assign(old,{ownerUid:null,status:'withdrawn',qualification:null});f.rows.delete(f.source);
 const result=await writeRacingRoute({db:f.db,admin:f.admin,uid:'new-creator',input:{action:'save-draft',districtId,reference}});
 assert.equal(result.status,'draft');assert.equal(f.rows.get(f.route).ownerUid,'new-creator');assert.equal(f.rows.get(f.route).qualification,null);
 assert.equal(await readPublishedRaceCourse({read:f.read,id,uid:'another-explorer'}),null);
});
test('archived platform content and another living creator cannot be reclaimed through a player command',async()=>{
 for(const curated of [false,true]){const f=fixture();if(curated){await f.adopt(true);f.rows.get(f.route).status='withdrawn';}f.writes.length=0;
  await assert.rejects(writeRacingRoute({db:f.db,admin:f.admin,uid:'new-creator',input:{action:'save-draft',districtId,reference}}),/race_route_already_exists/);assert.deepEqual(f.writes,[]);
 }
});
test('reclaiming an archived route still respects the creator library capacity',async()=>{
 const f=fixture();Object.assign(f.rows.get(f.route),{ownerUid:null,status:'withdrawn',qualification:null});
 for(let i=0;i<40;i++)f.rows.set('users/new-creator/racingRoutes/owned-'+i,{});
 await assert.rejects(writeRacingRoute({db:f.db,admin:f.admin,uid:'new-creator',input:{action:'save-draft',districtId,reference}}),/race_route_library_full/);assert.deepEqual(f.writes,[]);
});
