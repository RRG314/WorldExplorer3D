import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {prepareRaceDistrictStorage,readRaceDistrictFacts,raceDistrictChunkPath,RACE_DISTRICT_STORAGE_LIMITS as L} from '../app/js/racing/district-storage.js';
import {prepareRacingDistrictIntake,publishPreparedRacingDistrict} from '../scripts/racing/intake-district.mjs';
import {raceDistrictFingerprint,raceCourseReference,raceCourseKey} from '../app/js/racing/course-library.js';
import {buildRaceRoadGraph,createRaceCourse} from '../app/js/racing/course-rules.js';
import {readPublishedRaceCourse} from '../app/js/racing/publication-rules.js';
import {RACE_PHYSICS_VERSION} from '../app/js/racing/record-rules.js';
const backend=createRequire(import.meta.url)('../functions/racing-publication.js');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const raw={type:'RaceDistrictFacts',version:1,locationLabel:'Controlled storage fixture; not a real venue',anchor:{lat:43,lon:7},metersPerUnit:1,
 roads:Array.from({length:3000},(_,index)=>({sourceId:`storage-${String(index).padStart(5,'0')}`,sourceFeatureId:'controlled-storage',label:'Controlled storage fixture; not a real venue',
  a:{x:index*10,y:0,z:0,connectionLayer:`a:${index}`},b:{x:index*10,y:0,z:250,connectionLayer:`b:${index}`},
  widthMeters:8,structure:'surface',direction:'forward',clearanceMeters:0,driveable:true,supported:true,heightSampleSpanMeters:1.2,
  heightSamples:[{t:0,y:0,leftY:0,rightY:0},{t:.25,y:0,leftY:0,rightY:0},{t:.75,y:0,leftY:0,rightY:0},{t:1,y:0,leftY:0,rightY:0}]}))};
const input=facts=>({facts,credits:[{role:'roads',label:'OpenStreetMap contributors',license:'ODbL-1.0',url:'https://www.openstreetmap.org/copyright'},
 {role:'terrain',label:'Controlled fixture',license:'Test fixture only',url:'https://example.test/controlled'}],
 provenance:{capturedAt:'2026-10-29T12:00:00Z',sourceRelease:'Controlled fixture only',buildId:'controlled-storage',reviewNote:'Not an actual world or track; transaction boundary test.'}});
const prepared=await prepareRacingDistrictIntake(input(raw)),fingerprint=await raceDistrictFingerprint(prepared.facts);
const reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,value])=>[key,reverse(value)])):value;
function database(){
 const rows=new Map(),writes=[];let sequence=0,failCommit=false;
 const snapshot=path=>({id:path.split('/').at(-1),exists:rows.has(path),data:()=>rows.get(path)});
 const ref=(path,query={})=>({path,query,
  collection:name=>ref(path+'/'+name),doc:name=>ref(path+'/'+(name||'generated-'+ ++sequence)),
  where:(field,operator,value)=>ref(path,{...query,conditions:[...(query.conditions||[]),[field,operator,value]]}),
  orderBy:()=>ref(path,{...query,ordered:true}),startAfter:after=>ref(path,{...query,after}),limit:limit=>ref(path,{...query,limit}),
  async get(){
   if(path.split('/').length%2===0)return snapshot(path);
   const prefix=path+'/',docs=[...rows.keys()].filter(key=>key.startsWith(prefix)&&!key.slice(prefix.length).includes('/')).sort()
    .filter(key=>(!query.after||key.split('/').at(-1)>query.after)&&(query.conditions||[]).every(([field,operator,value])=>operator==='=='&&rows.get(key)[field]===value)).slice(0,query.limit||Infinity).map(snapshot);
   return {docs,size:docs.length};
  }});
 const db={collection:ref,doc:ref,async runTransaction(operation){
  const pending=[];let writing=false;
  const result=await operation({get:async r=>{assert.equal(writing,false,'all transaction reads precede every write');return r.get();},
   create:(r,value)=>{assert.equal(rows.has(r.path),false);writing=true;pending.push(['set',r.path,value]);},
   set:(r,value)=>{writing=true;pending.push(['set',r.path,value]);},update:(r,value)=>{writing=true;pending.push(['update',r.path,value]);},delete:r=>{writing=true;pending.push(['delete',r.path]);}});
  if(failCommit)throw Error('controlled commit failure');
  for(const [kind,path,value] of pending){writes.push({kind,path});if(kind==='delete')rows.delete(path);else rows.set(path,kind==='update'?{...rows.get(path),...value}:value);}return result;
 }};
 const admin={firestore:{Timestamp:{fromMillis:value=>value}}};
 return {db,rows,writes,admin,failCommit:()=>{failCommit=true;}};
}
test('large qualified snapshots use bounded chunks without changing canonical facts; old inline records remain intact',async()=>{
 assert.ok(Buffer.byteLength(JSON.stringify(prepared.facts))>1048576);
 assert.ok(prepared.chunks.length>1&&prepared.chunks.length<=L.chunks);
 assert.ok(Buffer.byteLength(JSON.stringify(prepared.record))<L.inlineBytes);
 for(const chunk of prepared.chunks)assert.ok(Buffer.byteLength(JSON.stringify(chunk.record))<1048576);
 const rows=new Map(prepared.chunks.map(c=>[c.index,reverse(c.record)]));
 const read=await readRaceDistrictFacts(reverse(prepared.record),index=>Promise.resolve(rows.get(index)));
 assert.equal(await raceDistrictFingerprint(read),fingerprint);assert.deepEqual(read,prepared.facts);
 const small=await prepareRaceDistrictStorage({...raw,roads:raw.roads.slice(0,1)});
 assert.equal(small.chunks.length,0);assert.equal(await readRaceDistrictFacts(small.fields,()=>assert.fail('inline must not read children')),small.facts);
 assert.throws(()=>raceDistrictChunkPath('../users',0));assert.throws(()=>raceDistrictChunkPath(prepared.id,12));
});
test('missing, changed or malformed chunk ownership fails closed before returning any facts',async()=>{
 const rows=new Map(prepared.chunks.map(c=>[c.index,c.record]));
 await assert.rejects(readRaceDistrictFacts(prepared.record,index=>Promise.resolve(index===1?null:rows.get(index))),/storage_unavailable/);
 const changed=structuredClone(prepared.chunks[0].record);changed.roads[0].label='Changed controlled storage fixture label';
 await assert.rejects(readRaceDistrictFacts(prepared.record,index=>Promise.resolve(index===0?changed:rows.get(index))),/storage_unavailable/);
 let reads=0;const malformed=structuredClone(prepared.record);malformed.factsManifest.chunks[0].bytes=L.chunkBytes+1;
 await assert.rejects(readRaceDistrictFacts(malformed,async()=>{reads++;return null;}),/storage_unavailable/);assert.equal(reads,0);
 await assert.rejects(readRaceDistrictFacts({...prepared.record,facts:prepared.facts},async()=>null),/storage_unavailable/);
});
test('storage capacity is bounded before publication and descriptive facts cannot change under an old geographic identity',async()=>{
 const dense={...raw,roads:raw.roads.map(road=>({...road,heightSamples:Array.from({length:25},(_,index)=>({t:index/24,y:0,leftY:0,rightY:0}))}))};
 await assert.rejects(prepareRaceDistrictStorage(dense),/storage_capacity/);
 const h=database();await publishPreparedRacingDistrict(h.db,prepared,1);
 const changed=await prepareRacingDistrictIntake(input({...raw,locationLabel:'A different unreviewed description'}));assert.equal(changed.id,prepared.id);
 const count=h.writes.length;await assert.rejects(publishPreparedRacingDistrict(h.db,changed,2),/identity conflict/);assert.equal(h.writes.length,count);
});
test('publication commits metadata, all children and the current-location pointer atomically; a failed commit publishes none',async()=>{
 const h=database();h.rows.set('unrelated/preserved',{value:7});h.failCommit();
 await assert.rejects(publishPreparedRacingDistrict(h.db,prepared,1),/commit failure/);
 assert.equal(h.rows.size,1);assert.deepEqual(h.rows.get('unrelated/preserved'),{value:7});
 const good=database();await publishPreparedRacingDistrict(good.db,prepared,1);
 assert.equal(good.rows.size,prepared.chunks.length+2);
 assert.equal(good.rows.get('racingLocations/'+prepared.locationKey).districtId,prepared.id);
 const first=good.rows.get(raceDistrictChunkPath(prepared.id,0)),count=good.writes.length;
 for(const [key,value] of good.rows)good.rows.set(key,reverse(value));
 await publishPreparedRacingDistrict(good.db,prepared,2);
 assert.deepEqual(good.rows.get(raceDistrictChunkPath(prepared.id,0)),reverse(first));assert.equal(good.writes.length,count+1);
 good.rows.get('racingDistricts/'+prepared.id).status='retired';await publishPreparedRacingDistrict(good.db,prepared,3);
 assert.equal(good.rows.get('racingDistricts/'+prepared.id).status,'approved');assert.deepEqual(good.rows.get(raceDistrictChunkPath(prepared.id,0)),reverse(first));
});
test('an orphaned child or damaged previous publication cannot be overwritten by an operator retry',async()=>{
 const orphan=database();orphan.rows.set(raceDistrictChunkPath(prepared.id,0),prepared.chunks[0].record);
 await assert.rejects(publishPreparedRacingDistrict(orphan.db,prepared,1),/orphaned/);assert.equal(orphan.rows.size,1);
 const broken=database();await publishPreparedRacingDistrict(broken.db,prepared,1);broken.rows.delete(raceDistrictChunkPath(prepared.id,0));
 const count=broken.writes.length;await assert.rejects(publishPreparedRacingDistrict(broken.db,prepared,2),/storage_unavailable/);assert.equal(broken.writes.length,count);
});
test('publication owns its prepared values across awaits and refuses a damaged or unreferenced handoff before writes',async()=>{
 const h=database(),candidate=structuredClone(prepared),promise=publishPreparedRacingDistrict(h.db,candidate,1);
 candidate.chunks[0].record.roads[0].label='Changed after the handoff';await promise;
 const actual=await readRaceDistrictFacts(h.rows.get('racingDistricts/'+prepared.id),async index=>h.rows.get(raceDistrictChunkPath(prepared.id,index)));
 assert.deepEqual(actual,prepared.facts);
 const bad=structuredClone(prepared);bad.chunks[0].record.roads[0].label='Changed before the handoff';const broken=database();
 await assert.rejects(publishPreparedRacingDistrict(broken.db,bad,1),/storage_unavailable/);assert.equal(broken.rows.size,0);
 const extra=structuredClone(prepared);extra.chunks.push({index:extra.chunks.length,record:extra.chunks[0].record});
 await assert.rejects(publishPreparedRacingDistrict(broken.db,extra,1),/Invalid prepared/);assert.equal(broken.rows.size,0);
});
test('catalogue, trusted service reconstruction and curated ownership all consume the same complete chunked publication',async()=>{
 const h=database();await publishPreparedRacingDistrict(h.db,prepared,1);
 const graph=buildRaceRoadGraph(prepared.facts.roads),course=createRaceCourse(graph,['storage-00000:forward'],{...prepared.facts,participants:4});
 const reference=raceCourseReference(course,fingerprint),id=await raceCourseKey(course),revision=hash({districtId:prepared.id,reference});
 h.rows.set('racingCourses/'+id,{districtId:prepared.id,ownerUid:'creator',reference,revision,status:'approved',qualification:{revision,physicsVersion:RACE_PHYSICS_VERSION,resultId:'qualification',timeMs:12345}});
 h.rows.set('users/creator/racingRoutes/'+id,{districtId:prepared.id,status:'approved'});
 h.rows.set('racingResults/qualification',{fingerprint:'b'.repeat(64),receipt:{purpose:'qualification',courseId:id,courseRevision:revision,physicsVersion:RACE_PHYSICS_VERSION,players:[{uid:'creator',finished:true,timeMs:12345,credits:0}]}});
 const loaded=await readPublishedRaceCourse({id,uid:'viewer',read:async path=>h.rows.get(path)||null});assert.equal(loaded.lengthMeters,250);
 const catalog=await backend.readRacingCatalog({db:h.db,uid:'viewer',locationId:prepared.facts.locationId});assert.equal(catalog.courses[0].id,id);assert.deepEqual(catalog.district.facts,prepared.facts);
 const adoption=await backend.adoptCuratedRacingRoute({db:h.db,admin:h.admin,id,ownerUid:'creator',revision,note:'Controlled chunked course provenance',approve:true});
 assert.equal(adoption.curated,true);assert.equal(h.rows.get('racingCourses/'+id).ownerUid,null);
 h.rows.delete(raceDistrictChunkPath(prepared.id,0));
 await assert.rejects(readPublishedRaceCourse({id,uid:'viewer',read:async path=>h.rows.get(path)||null}),/storage_unavailable/);
 await backend.moderateRacingRoute({db:h.db,admin:h.admin,moderatorUid:'reviewer',input:{id,revision,decision:'rejected',note:'Withdraw unavailable controlled source'}});
 assert.equal(h.rows.get('racingCourses/'+id).status,'rejected','missing source cannot prevent withdrawing unsafe content');
});
