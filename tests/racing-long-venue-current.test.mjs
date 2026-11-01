import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeRaceVenueSource,sameRaceVenueSource} from '../app/js/racing/venue-course-policy.js';
import {buildRaceRoadGraph,createRaceCourse} from '../app/js/racing/course-rules.js';
import {canonicalRaceDistrict} from '../app/js/racing/district-facts.js';
import {prepareRaceDistrictStorage,readRaceDistrictFacts} from '../app/js/racing/district-storage.js';
import {raceCourseKey,raceDistrictFingerprint,raceCourseReference} from '../app/js/racing/course-library.js';
import {reconstructPublishedRace,assertRaceCourseInDistrict} from '../app/js/racing/publication-rules.js';
import {raceCourseProjection,resolveRaceCourseProjection} from '../app/js/racing/course-projection.js';
import {createRaceConnection} from '../app/js/racing/network-client.js';
import {racePhysicsVersion} from '../app/js/racing/record-rules.js';
import {collectRaceDistrict} from '../app/js/racing/world-course-source.js';
import {updateFeatureSurfaceProfile} from '../app/js/structure-semantics.js?v=63';
import {prepareVenueSourceMerge,RACING_VENUE_SOURCES} from '../app/js/racing/venue-source-packs.js';
import {roadSourceSurvey} from '../app/js/world/road-source-survey.js';

// Synthetic complete loop; this tests bounded contracts, not venue acceptance.
function rawFacts(samples=40){
 const sourceFeatureIds=Array.from({length:20},(_,i)=>'osm:way:'+String(i+1).padStart(3,'0'));
 const at=i=>({x:3300*Math.cos(i%420*Math.PI*2/420),y:0,z:3300*Math.sin(i%420*Math.PI*2/420),connectionLayer:'node:'+i%420});
 return {type:'RaceDistrictFacts',version:1,locationLabel:'Controlled long-course contract',anchor:{lat:50,lon:7},metersPerUnit:1,
  venueSource:{version:1,id:'controlled-long',sourceSha256:'a'.repeat(64),mappedLengthMeters:20734.318,qualificationRadiusWorld:3500,sourceFeatureIds},
  roads:Array.from({length:420},(_,i)=>{const sourceFeatureId=sourceFeatureIds[Math.floor(i/21)];return {
   sourceId:sourceFeatureId+':'+String(i).padStart(4,'0')+':0:1',sourceFeatureId,label:'Controlled loop',a:at(i),b:at(i+1),
   widthMeters:8,structure:'surface',direction:'forward',clearanceMeters:0,driveable:true,supported:true,heightSampleSpanMeters:1.2,
   heightSamples:Array.from({length:samples},(_,j)=>({t:j/(samples-1),y:0,leftY:0,rightY:0}))};})};
}
const courseFrom=facts=>createRaceCourse(buildRaceRoadGraph(facts.roads,{metersPerUnit:facts.metersPerUnit,venueSource:facts.venueSource}),
 facts.roads.map(r=>r.sourceId+':forward'),{...facts,discipline:'circuit',participants:4});
const factsForSmallCourse=()=>[{sourceId:'small',a:{x:0,y:0,z:0},b:{x:0,y:0,z:250},widthMeters:8,driveable:true,supported:true}];
const reverse=v=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;

test('long mapped routes reconstruct the same approved geometry and identity; route settings cannot widen an ordinary graph',async()=>{
 const facts=canonicalRaceDistrict(rawFacts()),course=courseFrom(facts),fingerprint=await raceDistrictFingerprint(facts),reference=raceCourseReference(course,fingerprint);
 assert.ok(course.lengthMeters>20000&&course.lengthMeters<21000);assert.equal(course.segments.length,421);
 const restored=await reconstructPublishedRace(reference,facts);assert.equal(await raceCourseKey(restored),await raceCourseKey(course));
 assert.equal(assertRaceCourseInDistrict(restored,facts),true);assert.ok(sameRaceVenueSource(restored.venueSource,facts.venueSource));
 const ordinary=buildRaceRoadGraph(facts.roads);
 assert.throws(()=>createRaceCourse(ordinary,course.sourcePath,{...course,venueSource:facts.venueSource}),/route_length/);
 const changed={...facts,venueSource:{...facts.venueSource,sourceSha256:'b'.repeat(64)}};
 assert.notEqual(await raceDistrictFingerprint(changed),fingerprint);assert.notEqual(await raceCourseKey({...course,venueSource:changed.venueSource}),await raceCourseKey(course));
 assert.throws(()=>assertRaceCourseInDistrict({...course,venueSource:changed.venueSource},facts),/requalify/);
 const {venueSource,...unmarked}=facts;
 await assert.rejects(reconstructPublishedRace(reference,unmarked),/requalify/);
 assert.throws(()=>createRaceCourse(buildRaceRoadGraph(facts.roads,{venueSource}),[...course.sourcePath,...course.sourcePath],{...course,laps:1}),/route_length/);
});

test('venue extent rejects foreign or missing source ways, oversized headers, invalid coordinates and unbounded length',()=>{
 const raw=rawFacts(2),venue=raw.venueSource;
 for(const change of [v=>v.qualificationRadiusWorld=6001,v=>v.mappedLengthMeters=30001,v=>v.sourceFeatureIds.push(v.sourceFeatureIds[0]),v=>v.sourceFeatureIds[0]='x\n',v=>v.sourceSha256='z'.repeat(64),v=>v.id='../world']){
  const v=structuredClone(venue);change(v);assert.throws(()=>normalizeRaceVenueSource(v),/venue_extent/);
 }
 for(const change of [v=>v.roads.splice(0,21),v=>v.roads[0].sourceFeatureId='osm:way:foreign',v=>v.roads[0].sourceId='foreign:0:1',v=>v.roads[0].a.x=4000]){
  const v=structuredClone(raw);change(v);assert.throws(()=>canonicalRaceDistrict(v),/venue_extent/);
 }
 assert.equal(normalizeRaceVenueSource(undefined),undefined);assert.throws(()=>normalizeRaceVenueSource(null),/venue_extent/);
 const frozen=normalizeRaceVenueSource(venue);assert.ok(Object.isFrozen(frozen.sourceFeatureIds));
});

test('chunked long districts normalize partial source groups but require complete coverage after reassembly',async()=>{
 const stored=await prepareRaceDistrictStorage(rawFacts());assert.ok(stored.chunks.length>1);
 const chunks=stored.chunks.map(c=>reverse(c.record));
 const restored=await readRaceDistrictFacts(reverse(stored.fields),async index=>chunks[index]);assert.deepEqual(restored,stored.facts);
 assert.equal(await raceDistrictFingerprint(restored),await raceDistrictFingerprint(stored.facts));
 const manifest=structuredClone(stored.fields);manifest.factsManifest.header.venueSource.sourceFeatureIds.push('osm:way:missing');
 await assert.rejects(readRaceDistrictFacts(manifest,async index=>chunks[index]),/venue_extent/);
 chunks[0].roads[0].sourceFeatureId='osm:way:foreign';
 await assert.rejects(readRaceDistrictFacts(stored.fields,async index=>chunks[index]),/venue_extent/);
});

test('long join and saved result projections stay small and resolve only to the verified local course',async()=>{
 const course=courseFrom(canonicalRaceDistrict(rawFacts())),id=await raceCourseKey(course),projection=raceCourseProjection(course,id);
 assert.ok(Buffer.byteLength(JSON.stringify(course))>256*1024);
 assert.ok(Buffer.byteLength(JSON.stringify(projection))<10000);
 for(const key of ['segments','points','gates','sourcePath'])assert.equal(projection[key],undefined);
 assert.equal(resolveRaceCourseProjection(reverse(projection),course,id),course);
 assert.throws(()=>resolveRaceCourseProjection(projection,null,id),/snapshot/);
 for(const change of [v=>v.courseId='road-race-'+ 'b'.repeat(32),v=>v.lengthMeters++,v=>v.venueSource.sourceSha256='c'.repeat(64),v=>v.venueSource.sourceFeatureIds.reverse(),v=>v.segments=course.segments]){
  const v=structuredClone(projection);change(v);assert.throws(()=>resolveRaceCourseProjection(v,course,id),/snapshot/);
 }
 const {venueSource,...ordinary}=course;assert.equal(raceCourseProjection(ordinary,id).type,'RaceCourseProjection','large ordinary courses also use bounded projections');
 const small=createRaceCourse(buildRaceRoadGraph(factsForSmallCourse()),['small:forward'],{locationId:'controlled-small',anchor:{lat:50,lon:7}});assert.equal(raceCourseProjection(small,id),small,'small ordinary joins retain their existing schema');
});

test('browser socket checks the expected long-course key before opening, then supplies reconstructed geometry to the existing callback',async()=>{
 const course=courseFrom(canonicalRaceDistrict(rawFacts())),id=await raceCourseKey(course),sockets=[],errors=[],received=[];
 class Socket{constructor(){this.readyState=1;this.events={};sockets.push(this);}addEventListener(n,f){this.events[n]=f;}send(){}close(){this.closed=true;}}
 const options={uid:'driver',endpoint:'wss://example.test/race',credentials:async()=>({}),join:{courseId:id},isCurrent:()=>true,WebSocketClass:Socket,
  expectedCourse:course,physicsVersion:racePhysicsVersion(course),onSnapshot:(s,c)=>received.push(c),onError:e=>errors.push(e)};
 const connection=createRaceConnection(options);await connection.connect();assert.equal(sockets.length,1);
 const snapshot={id:'controlled',courseId:id,physicsVersion:racePhysicsVersion(course),players:[{uid:'driver'}],serverAtMs:100};
 sockets[0].events.message({data:JSON.stringify({type:'joined',course:raceCourseProjection(course,id),snapshot})});assert.equal(received[0],course);
 const bad=raceCourseProjection(course,id);bad.venueSource={...bad.venueSource,mappedLengthMeters:21000};
 sockets[0].events.message({data:JSON.stringify({type:'joined',course:bad,snapshot})});assert.deepEqual(errors,['invalid_race_snapshot']);assert.equal(sockets[0].closed,true);
 const wrong=createRaceConnection({...options,join:{courseId:'road-race-'+ 'b'.repeat(32)}});await wrong.connect();assert.equal(sockets.length,1);assert.equal(errors.at(-1),'race_course_wrong_world');
 const stale=createRaceConnection({...options,isCurrent:()=>false});await stale.connect();assert.equal(sockets.length,1);
});

test('only the current adopted source survey widens world qualification; caller radius, provider JSON and stale metadata cannot',async()=>{
 const venueSource=normalizeRaceVenueSource({version:1,id:'controlled-long',sourceSha256:'a'.repeat(64),mappedLengthMeters:9000,qualificationRadiusWorld:3500,sourceFeatureIds:['osm:way:1']}),
  survey={version:1,venueId:venueSource.id,sourceFeatureId:'osm:way:1',venueSource,groundArtifactId:'controlled',groundContentSha256:'b'.repeat(64),maximumCrossfall:.15},
  feature={sourceFeatureId:'osm:way:1',width:8,metersPerWorldUnit:1,driveable:true,pts:[{x:1700,z:0},{x:1940,z:0}],structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:survey};
 updateFeatureSurfaceProfile(feature,()=>0);
 const segment={feature,p1:feature.pts[0],p2:feature.pts[1],segIndex:0,sourceTStart:0,sourceTEnd:1,fromId:1,toId:2,direction:'forward'},
  context={METERS_PER_WORLD_UNIT:1,worldPublication:{requestId:'controlled',sequence:4,location:{lat:50,lon:7}},buildings:[],buildTraversalNetworks:()=>({drive:{segments:[segment]}}),
   sampleFeatureSurfaceY:()=>0,SurfaceQuery:{driveAt:()=>({kind:'road',position:{y:0}})},transportDetail:{hasReadyCoverageAt:()=>true}};
 const read=()=>collectRaceDistrict(context,{radiusWorld:6000,sourceFeatureIds:['osm:way:ignored'],yieldWork:async()=>{}});
 await assert.rejects(read(),/no_qualified/);
 context.worldLoadRuntimeState={sequence:4,venuePack:{status:'source-prepared',id:venueSource.id,sourceSha256:venueSource.sourceSha256,sourceFeatureIds:venueSource.sourceFeatureIds,venueSource}};
 const facts=await read();assert.equal(facts.roads.length,1);assert.ok(sameRaceVenueSource(facts.venueSource,venueSource));
 feature.surfaceSurveyEvidence={...survey,venueSource:structuredClone(venueSource)};
 await assert.rejects(read(),/no_qualified/,'a JSON copy cannot impersonate this adopted private survey');
 feature.surfaceSurveyEvidence=survey;context.worldLoadRuntimeState.sequence=5;await assert.rejects(read(),/no_qualified/);
 context.worldLoadRuntimeState.sequence=4;context.worldLoadRuntimeState.venuePack.sourceSha256='c'.repeat(64);await assert.rejects(read(),/venue_extent/);
});

test('explicit source merge shares its immutable extent with each private source annotation and no provider JSON',()=>{
 const descriptor={...RACING_VENUE_SOURCES[0],routeExtent:'mapped-venue-v1',qualificationRadiusWorld:3500},source=JSON.parse(fs.readFileSync(new URL('../app/assets/racing/silverstone/source.json',import.meta.url))),
  ground={status:'accepted',artifactIds:[descriptor.groundArtifactId],contentSha256s:[descriptor.groundContentSha256]};
 const result=prepareVenueSourceMerge({},source,descriptor,ground),venue=result.metadata.venueSource;
 assert.ok(venue);assert.ok(Object.isFrozen(venue));
 for(const way of result.data.elements.filter(e=>e.type==='way'&&result.metadata.layoutWayIds.includes(e.id)))assert.equal(roadSourceSurvey(way).venueSource,venue);
 assert.equal(JSON.stringify(result.data).includes('mappedLengthMeters'),false);
 assert.throws(()=>prepareVenueSourceMerge({},source,{...descriptor,routeExtent:'unsupported'},ground),/venue_pit_review_unavailable/);
});

// A transaction adapter and terminal fixture isolate the changed result shape.
// They do not claim another driven lap or database/emulator acceptance.
function memoryDb(){
 const rows=new Map(),writes=[];
 const ref=path=>({path,get:async()=>({exists:rows.has(path),data:()=>rows.get(path)}),collection:name=>ref(path+'/'+name),doc:name=>ref(path+'/'+name)});
 const db={collection:ref,doc:ref,async runTransaction(operation){const pending=[];let writing=false;
  const result=await operation({get:async r=>{assert.equal(writing,false);return {exists:rows.has(r.path),data:()=>rows.get(r.path)};},
   set:(r,v,o)=>{writing=true;pending.push([o?.merge?'merge':'set',r.path,v]);},update:(r,v)=>{writing=true;pending.push(['merge',r.path,v]);},
   create:(r,v)=>{assert.equal(rows.has(r.path),false);writing=true;pending.push(['set',r.path,v]);}});
  for(const [kind,path,value] of pending){writes.push(path);rows.set(path,kind==='merge'?{...rows.get(path),...value}:value);}return result;
 }};return {rows,writes,db};
}

test('long result transactions save compact metadata, retain replay-safe awards and recover without loading geometry',async()=>{
 const {createFirestoreRaceStore}=await import('../services/racing/firestore-store.mjs'),{createRaceVehicleProfile}=await import('../services/racing/generated/engine.mjs'),
  {randomUUID}=await import('node:crypto'),course=courseFrom(canonicalRaceDistrict(rawFacts())),courseId=await raceCourseKey(course),profile=createRaceVehicleProfile('bmw_e34'),f=memoryDb(),id=randomUUID();
 const snapshot={id,phase:'complete',players:['one','two'].map((uid,i)=>({uid,label:uid,slot:i,position:i+1,dnf:false,barrierContacts:0,progress:{finished:true,elapsedMs:500000+i*1000,penaltyMs:0}}))},
  race={id,courseId,course,roomCode:'LONG01',worldSeed:'controlled',roster:new Map(['one','two'].map(uid=>[uid,{profile}]))};
 f.rows.set('rooms/LONG01/racing/current',{id,instanceId:'owner',expiresAt:{toMillis:()=>600000}});
 const store=createFirestoreRaceStore({db:f.db,loadCourse:async()=>assert.fail('terminal recovery must not reconstruct result geometry')}),receipt=await store.settle({race,snapshot,instanceId:'owner',nowMs:550000});
 assert.ok(receipt.players.every(p=>p.credits>0));const stored=f.rows.get('racingResults/'+id),count=f.writes.length;
 assert.equal(stored.course.type,'RaceCourseProjection');assert.ok(Buffer.byteLength(JSON.stringify(stored))<20000);
 assert.deepEqual(await store.settle({race,snapshot,instanceId:'owner',nowMs:550001}),receipt);assert.equal(f.writes.length,count);
 assert.equal(await store.result(id,'foreign'),null);
 const recovered=await store.result(id,'one');assert.equal(recovered.snapshot.settlement,'saved');assert.equal(resolveRaceCourseProjection(recovered.course,course,courseId),course);
});

test('actual WebSocket joins and terminal recovery use bounded long-course projections with the existing browser callback',async()=>{
 const {createRequire}=await import('node:module'),{randomUUID}=await import('node:crypto'),{createRaceVehicleProfile}=await import('../services/racing/generated/engine.mjs'),
  {createRaceServer}=await import('../services/racing/transport.mjs'),{withinDeadline}=await import('../scripts/verification/owned-browser.mjs'),
  course=courseFrom(canonicalRaceDistrict(rawFacts())),courseId=await raceCourseKey(course),profile=createRaceVehicleProfile('bmw_e34'),terminalId=randomUUID();
 const store={course:async()=>course,admit:async()=>({profile,label:'Driver',leaseUntil:Date.now()+15000}),renew:async()=>({leaseUntil:Date.now()+15000}),release:async()=>{},releaseParticipant:async()=>{},
  result:async id=>id===terminalId?{courseId,worldSeed:'controlled',roomCode:'LONG02',course:raceCourseProjection(course,courseId),snapshot:{id,phase:'complete',settlement:'saved',courseId,
   physicsVersion:racePhysicsVersion(course),serverAtMs:Date.now(),players:[{uid:'driver'}]}}:null};
 const service=createRaceServer({store,origins:['http://127.0.0.1:4000'],authenticate:async()=>({uid:'driver',expiresAtMs:Date.now()+60000})});
 await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
 const WebSocket=createRequire(new URL('../services/racing/package.json',import.meta.url))('ws'),frames=[];
 class BrowserSocket extends WebSocket{constructor(url){super(url,{origin:'http://127.0.0.1:4000'});this.on('message',bytes=>frames.push(bytes.length));}}
 const connections=[],errors=[];
 try{
  for(const sessionId of [undefined,terminalId]){
   let receive;const ready=new Promise(resolve=>receive=resolve),connection=createRaceConnection({uid:'driver',endpoint:'ws://127.0.0.1:'+service.server.address().port+'/race',expectedCourse:course,
    physicsVersion:racePhysicsVersion(course),credentials:async()=>({idToken:'controlled-auth',appCheckToken:'controlled-appcheck'}),
    join:{roomCode:'LONG02',worldSeed:'controlled',courseId,vehicleId:'bmw_e34',...(sessionId?{sessionId}:{})},isCurrent:()=>true,WebSocketClass:BrowserSocket,
    onSnapshot:(state,resolved)=>{if(resolved)receive({state,resolved});},onError:e=>errors.push(e)});
   connections.push(connection);await connection.connect();const result=await withinDeadline(()=>ready,3000,'long course join');
   assert.equal(result.resolved,course);if(sessionId)assert.equal(result.state.settlement,'saved');connection.stop();
  }
  assert.deepEqual(errors,[]);assert.ok(frames.length>=2);assert.ok(Math.max(...frames)<256*1024);
 }finally{for(const c of connections)c.stop();await service.close();}
});
