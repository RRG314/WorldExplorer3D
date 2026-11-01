import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {BANKED_ROAD_MODEL} from '../app/js/physics/road-plane-dynamics.js';
import {updateFeatureSurfaceProfile} from '../app/js/structure-semantics.js?v=63';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
import {collectRaceDistrict} from '../app/js/racing/world-course-source.js';
import {buildRaceRoadGraph,createRaceCourse} from '../app/js/racing/course-rules.js';
import {canonicalRaceDistrict,assertRaceCourseInDistrict,reconstructPublishedRace,readPublishedRaceCourse,raceLocationKey} from '../app/js/racing/publication-rules.js';
import {prepareRaceDistrictStorage,readRaceDistrictFacts} from '../app/js/racing/district-storage.js';
import {raceDistrictFingerprint,raceCourseKey,raceCourseReference} from '../app/js/racing/course-library.js';
import {racePhysicsVersion,RACE_PHYSICS_VERSION,RACE_BANKED_PHYSICS_VERSION as LEGACY_BANKED_PHYSICS_VERSION,raceRecordConfiguration,raceCompetitiveRecordConfiguration,racePracticeRecordKey} from '../app/js/racing/record-rules.js';
import {raceNetworkProfile} from '../app/js/racing/network-controller.js';
import {createRaceConnection} from '../app/js/racing/network-client.js';
import {createRaceSession,createRaceVehicleProfile} from '../services/racing/generated/engine.mjs';
import {createFirestoreRaceStore} from '../services/racing/firestore-store.mjs';
import {createRaceServer} from '../services/racing/transport.mjs';
import {withinDeadline} from '../scripts/verification/owned-browser.mjs';
const require=createRequire(import.meta.url),publication=require('../functions/racing-publication.js'),career=require('../functions/racing-career.js');

function rawFacts(bank=.2,marked=true){
 return {type:'RaceDistrictFacts',version:1,locationId:'earth:500000000:70000000',locationLabel:'Controlled bank contract',anchor:{lat:50,lon:7},metersPerUnit:1,
  roads:[{sourceId:'controlled-bank',sourceFeatureId:'osm:way:1',label:'Controlled pavement',a:{x:0,y:10,z:0,connectionLayer:'node:1'},b:{x:600,y:10,z:0,connectionLayer:'node:2'},
   ...(marked?{surfaceModel:BANKED_ROAD_MODEL}:{}),widthMeters:8,direction:'forward',structure:'surface',clearanceMeters:0,driveable:true,supported:true,heightSampleSpanMeters:1.2,
   heightSamples:[0,1].map(t=>({t,y:10,leftY:10+bank*1.2,rightY:10-bank*1.2}))}]};
}
const RACE_BANKED_PHYSICS_VERSION=LEGACY_BANKED_PHYSICS_VERSION+'-contacts1';
const courseFrom=facts=>createRaceCourse(buildRaceRoadGraph(facts.roads,{metersPerUnit:facts.metersPerUnit}),['controlled-bank:forward'],facts);

test('only a finalized explicitly banked reviewed surface can qualify published high-bank triangles',async t=>{
 const feature={sourceFeatureId:'osm:way:1',type:'raceway',width:8,metersPerWorldUnit:1,driveable:true,pts:[{x:0,z:0},{x:600,z:0}],
  structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:{version:1,sourceFeatureId:'osm:way:1',groundArtifactId:'controlled-ground',groundContentSha256:'a'.repeat(64),maximumCrossfall:.7,surfaceModel:BANKED_ROAD_MODEL}};
 const ground=(x,z)=>10+z*.2;
 updateFeatureSurfaceProfile(feature,ground);
 const positions=Float32Array.from([0,9.2,-4,0,10.8,4,600,9.2,-4,600,10.8,4]);
 const contacts=createRoadContactIndex([{geometry:{attributes:{position:{array:positions}},getIndex:()=>({array:new Uint16Array([0,1,2,2,1,3])})},userData:{terrainMode:'at_grade'}}]);t.after(()=>contacts.dispose());
 const segment={feature,p1:feature.pts[0],p2:feature.pts[1],segIndex:0,sourceTStart:0,sourceTEnd:1,fromId:1,toId:2,direction:'forward'};
 const context={METERS_PER_WORLD_UNIT:1,worldPublication:{requestId:'controlled',location:{lat:50,lon:7}},buildings:[],roadContactIndex:contacts,
  buildTraversalNetworks:()=>({drive:{segments:[segment]}}),sampleFeatureSurfaceY:ground,transportDetail:{hasReadyCoverageAt:()=>true},
  SurfaceQuery:{driveAt:(x,z,options)=>{const y=contacts.sampleAt(x,z,options.currentY);return {kind:y===null?'terrain':'road',position:{y}};}}};
 const read=()=>collectRaceDistrict(context,{radiusWorld:800,yieldWork:async()=>{}});
 const district=await read();assert.equal(district.roads[0].surfaceModel,BANKED_ROAD_MODEL);
 const accepted=feature.transportSurfaceModel;
 updateFeatureSurfaceProfile(feature,ground,{reviewedSurfacePhase:'preparation'});
 await assert.rejects(read(),/no_qualified/);
 feature.transportSurfaceModel=accepted;
 feature.surfaceSurveyEvidence={...feature.surfaceSurveyEvidence,maximumCrossfall:.7,surfaceModel:'unsupported'};
 assert.throws(()=>updateFeatureSurfaceProfile(feature,ground),/invalid_reviewed_road_surface/);
 delete feature.surfaceSurveyEvidence;delete feature.transportSurfaceModel;
 feature.structureTags={surfaceModel:BANKED_ROAD_MODEL,maximumCrossfall:.7};
 await assert.rejects(read(),/no_qualified/,'provider tags cannot grant reviewed bank admission');
});

test('banked facts survive canonical storage and reconstruction, and selected source edges own the controller mode',async()=>{
 const facts=canonicalRaceDistrict(rawFacts()),course=courseFrom(facts),fingerprint=await raceDistrictFingerprint(facts),reference=raceCourseReference(course,fingerprint);
 assert.equal(course.surfaceModel,BANKED_ROAD_MODEL);
 const stored=await prepareRaceDistrictStorage(facts),restored=await readRaceDistrictFacts(stored.fields);
 assert.deepEqual(restored,facts);assert.equal((await reconstructPublishedRace(reference,restored)).surfaceModel,BANKED_ROAD_MODEL);
 assert.equal(assertRaceCourseInDistrict(course,facts),true);
 const low=rawFacts(.1,false),ordinary=courseFrom(low);
 assert.equal(createRaceCourse(buildRaceRoadGraph(low.roads),['controlled-bank:forward'],{...low,surfaceModel:BANKED_ROAD_MODEL}).surfaceModel,undefined);
 assert.notEqual(await raceDistrictFingerprint({...low,roads:low.roads.map(r=>({...r,surfaceModel:BANKED_ROAD_MODEL}))}),await raceDistrictFingerprint(low));
 assert.notEqual(await raceCourseKey({...ordinary,surfaceModel:BANKED_ROAD_MODEL}),await raceCourseKey(ordinary));
 assert.throws(()=>assertRaceCourseInDistrict({...ordinary,surfaceModel:BANKED_ROAD_MODEL},low),/requalify/);
 for(const bad of [rawFacts(.2,false),rawFacts(.71),{...rawFacts(),roads:rawFacts().roads.map(r=>({...r,surfaceModel:'unknown'}))}])assert.throws(()=>canonicalRaceDistrict(bad),/invalid|heights/);
});

test('ordinary immutable IDs and record versions remain exact while banked classes and network profiles partition',async()=>{
 const ordinary=rawFacts(.1,false),course=courseFrom({...ordinary,eventRules:null}),banked=courseFrom(rawFacts()),profile=createRaceVehicleProfile('bmw_e34');
 assert.equal(await raceDistrictFingerprint(ordinary),'race-district:4bc93b797690967feb93e5ba601715a508f07fa00ccae6e43b147e85b5d337d0');
 assert.equal(await raceCourseKey(course),'road-race-ac49ac0a201471ff4963fe0e59be5018');
 assert.equal(racePhysicsVersion(course),RACE_PHYSICS_VERSION);
 assert.equal(racePhysicsVersion(banked),RACE_BANKED_PHYSICS_VERSION);
 assert.equal(raceRecordConfiguration(profile).physicsVersion,RACE_PHYSICS_VERSION);
 const config=raceCompetitiveRecordConfiguration(profile,{slot:0,participants:1,course:banked});
 assert.equal(config.physicsVersion,RACE_BANKED_PHYSICS_VERSION);assert.equal(raceNetworkProfile(config,banked).vehicleId,'bmw_e34');
 assert.throws(()=>raceNetworkProfile(config,course),/physics_version/);
 assert.throws(()=>raceNetworkProfile(raceRecordConfiguration(profile),banked),/physics_version/);
 assert.notEqual(await racePracticeRecordKey(course,profile),await racePracticeRecordKey({...course,surfaceModel:BANKED_ROAD_MODEL},profile));
 const sockets=[],errors=[];class Socket{constructor(){this.readyState=1;this.events={};sockets.push(this);}addEventListener(n,f){this.events[n]=f;}send(){}close(){this.closed=true;}}
 const connection=createRaceConnection({uid:'driver',endpoint:'wss://example.test/race',credentials:async()=>({}),join:{courseId:'controlled'},isCurrent:()=>true,WebSocketClass:Socket,
  physicsVersion:RACE_BANKED_PHYSICS_VERSION,onError:e=>errors.push(e)});
 await connection.connect();const socket=sockets[0],state={id:'controlled',courseId:'controlled',physicsVersion:RACE_BANKED_PHYSICS_VERSION,players:[{uid:'driver'}],serverAtMs:100};
 socket.events.message({data:JSON.stringify({type:'snapshot',snapshot:state})});assert.equal(connection.snapshot().physicsVersion,RACE_BANKED_PHYSICS_VERSION);
 socket.events.message({data:JSON.stringify({type:'snapshot',snapshot:{...state,physicsVersion:RACE_PHYSICS_VERSION}})});
 assert.deepEqual(errors,['invalid_race_snapshot']);assert.equal(socket.closed,true);
});

test('chunked approved snapshots preserve and hash-bind the bank marker independently of map property order',async()=>{
 const base=rawFacts(.1),raw={...base,roads:Array.from({length:1700},(_,i)=>({...base.roads[0],sourceId:'controlled-bank:'+String(i).padStart(4,'0')}))};
 const stored=await prepareRaceDistrictStorage(raw);assert.ok(stored.chunks.length>0);
 const chunks=stored.chunks.map(c=>structuredClone(c.record));
 for(const chunk of chunks)chunk.roads=chunk.roads.map(r=>Object.fromEntries(Object.entries(r).reverse()));
 const restored=await readRaceDistrictFacts(stored.fields,async index=>chunks[index]);
 assert.equal(await raceDistrictFingerprint(restored),await raceDistrictFingerprint(stored.facts));
 assert.ok(restored.roads.every(r=>r.surfaceModel===BANKED_ROAD_MODEL));
 delete chunks[0].roads[0].surfaceModel;
 await assert.rejects(readRaceDistrictFacts(stored.fields,async index=>chunks[index]),/storage_unavailable/);
});

function memoryDb(){
 const rows=new Map(),writes=[];let generated=0;
 const ref=path=>({path,get:async()=>({exists:rows.has(path),data:()=>rows.get(path)}),collection:name=>ref(path+'/'+name),doc:name=>ref(path+'/'+(name??'generated-'+ ++generated)),limit:count=>({path,count})});
 const db={collection:ref,doc:ref,async runTransaction(operation){const pending=[];const result=await operation({get:async r=>r.count?{size:[...rows.keys()].filter(k=>k.startsWith(r.path+'/')).slice(0,r.count).length}:{exists:rows.has(r.path),data:()=>rows.get(r.path)},
  update:(r,v)=>pending.push(['merge',r.path,v]),set:(r,v,options)=>pending.push([options?.merge?'merge':'set',r.path,v]),delete:r=>pending.push(['delete',r.path]),create:(r,v)=>{assert.equal(rows.has(r.path),false);pending.push(['set',r.path,v]);}});
  for(const[k,p,v]of pending){writes.push(p);if(k==='delete')rows.delete(p);else rows.set(p,k==='merge'?{...rows.get(p),...v}:v);}return result;}};
 return {rows,writes,db,admin:{firestore:{Timestamp:{fromMillis:ms=>({toMillis:()=>ms})}}}};
}

test('actual publication and settlement commands preserve the bank version through qualification, review, curation and career classes',async()=>{
 const f=memoryDb(),facts=canonicalRaceDistrict(rawFacts()),course=courseFrom(facts),fingerprint=await raceDistrictFingerprint(facts),districtId=fingerprint.slice(14),reference=raceCourseReference(course,fingerprint),id=await raceCourseKey(course);
 f.rows.set('racingDistricts/'+districtId,{status:'approved',facts});f.rows.set('racingLocations/'+await raceLocationKey(facts.locationId),{districtId});
 const draft=await publication.writeRacingRoute({db:f.db,admin:f.admin,uid:'driver',input:{action:'save-draft',districtId,reference}});
 const path='racingCourses/'+id;assert.equal(f.rows.get(path).physicsVersion,RACE_BANKED_PHYSICS_VERSION);
 const publicationFacts={purpose:'qualification',ownerUid:'driver',status:'draft',revision:draft.revision,districtId};
 const raceCourse={...course,publication:publicationFacts},profile=createRaceVehicleProfile('bmw_e34'),session=createRaceSession({id:randomUUID(),course:raceCourse,creatorUid:'driver',createdAtMs:0});
 session.add({uid:'driver',profile,label:'Driver'});session.setReady('driver',true);session.start('driver',0);
 let clock=0;for(let sequence=0;clock<60000&&session.snapshot().phase!=='complete';sequence++){clock+=50;session.control('driver',sequence,{throttle:1},clock);session.advance(clock);}
 const snapshot=session.snapshot();assert.equal(snapshot.phase,'complete');assert.equal(snapshot.players[0].progress.finished,true);
 const race={id:session.snapshot().id,courseId:id,course:raceCourse,roomCode:'BANK01',worldSeed:'controlled',roster:new Map([['driver',{profile}]])};
 f.rows.set('rooms/BANK01/racing/current',{id:race.id,instanceId:'owner',expiresAt:{toMillis:()=>clock+15000}});
 const store=createFirestoreRaceStore({db:f.db,loadCourse:async()=>raceCourse}),receipt=await store.settle({race,snapshot,instanceId:'owner',nowMs:clock});
 assert.equal(receipt.physicsVersion,RACE_BANKED_PHYSICS_VERSION);assert.equal(receipt.players[0].credits,0);
 assert.deepEqual(await store.settle({race,snapshot,instanceId:'owner',nowMs:clock+1}),receipt);
 assert.equal(f.rows.get('racingResults/'+race.id).profiles.driver.physicsVersion,RACE_BANKED_PHYSICS_VERSION);
 assert.equal(f.rows.get(path).qualification.physicsVersion,RACE_BANKED_PHYSICS_VERSION);
 const result=f.rows.get('racingResults/'+race.id);result.receipt={...receipt,physicsVersion:RACE_PHYSICS_VERSION};
 await assert.rejects(publication.writeRacingRoute({db:f.db,admin:f.admin,uid:'driver',input:{action:'submit',id,revision:draft.revision}}),/test_route/);
 result.receipt=receipt;
 await publication.writeRacingRoute({db:f.db,admin:f.admin,uid:'driver',input:{action:'submit',id,revision:draft.revision}});
 await publication.moderateRacingRoute({db:f.db,admin:f.admin,moderatorUid:'reviewer',input:{id,revision:draft.revision,decision:'approved'}});
 await publication.adoptCuratedRacingRoute({db:f.db,admin:f.admin,id,ownerUid:'driver',revision:draft.revision,note:'Controlled banked source contract only.',approve:true});
 assert.equal(f.rows.get(path).curation.physicsVersion,RACE_BANKED_PHYSICS_VERSION);
 const read=async p=>f.rows.get(p)||null;
 assert.equal((await readPublishedRaceCourse({read,id,uid:'peer'})).surfaceModel,BANKED_ROAD_MODEL);
 f.rows.get(path).physicsVersion=RACE_PHYSICS_VERSION;await assert.rejects(readPublishedRaceCourse({read,id,uid:'peer'}),/physics_version/);f.rows.get(path).physicsVersion=RACE_BANKED_PHYSICS_VERSION;
 const board='b'.repeat(64),configuration=raceCompetitiveRecordConfiguration(profile,{slot:0,participants:1,course});
 f.rows.set('racingBoards/'+board,{courseId:id,courseName:course.name,configuration});
 f.rows.set('users/driver/racing/career/boards/'+board,{boardId:board});f.rows.set('users/driver/friends/peer',{});f.rows.set('users/peer/consents/community',{version:'community-2026-10-24'});
 const command=()=>career.commitRacingCareer({db:f.db,uid:'driver',input:{action:'create-rival',targetUid:'peer',boardId:board,requestId:randomUUID()},nowMs:clock});
 configuration.physicsVersion=RACE_PHYSICS_VERSION;await assert.rejects(command(),/class_unavailable/);configuration.physicsVersion=RACE_BANKED_PHYSICS_VERSION;
 const rival=await command();assert.equal(f.rows.get('racingRivals/'+rival.id).stage.configuration.physicsVersion,RACE_BANKED_PHYSICS_VERSION);
});

test('competitive banked settlement partitions boards and receipts and never repeats wallet awards',async()=>{
 const f=memoryDb(),facts=rawFacts(),course=createRaceCourse(buildRaceRoadGraph(facts.roads),['controlled-bank:forward'],{...facts,participants:2}),id=await raceCourseKey(course),profile=createRaceVehicleProfile('bmw_e34');
 const session=createRaceSession({id:randomUUID(),course,creatorUid:'one',createdAtMs:0});
 for(const uid of ['one','two'])session.add({uid,profile,label:uid});
 for(const uid of ['one','two'])session.setReady(uid,true);session.start('one',0);
 let clock=0;for(let sequence=0;clock<60000&&session.snapshot().phase!=='complete';sequence++){
  clock+=50;for(const uid of ['one','two'])session.control(uid,sequence,{throttle:1},clock);session.advance(clock);
 }
 const snapshot=session.snapshot();assert.equal(snapshot.phase,'complete');assert.ok(snapshot.players.every(p=>p.progress.finished));
 const race={id:snapshot.id,courseId:id,course,roomCode:'BANK02',worldSeed:'controlled',roster:new Map(['one','two'].map(uid=>[uid,{profile}]))};
 f.rows.set('rooms/BANK02/racing/current',{id:race.id,instanceId:'owner',expiresAt:{toMillis:()=>clock+15000}});
 const store=createFirestoreRaceStore({db:f.db,loadCourse:async()=>course}),receipt=await store.settle({race,snapshot,instanceId:'owner',nowMs:clock});
 assert.equal(receipt.physicsVersion,RACE_BANKED_PHYSICS_VERSION);
 for(const player of receipt.players){
  assert.equal(f.rows.get('racingBoards/'+player.boardId).configuration.physicsVersion,RACE_BANKED_PHYSICS_VERSION);
  assert.equal(f.rows.get('users/'+player.uid+'/racing/career/boards/'+player.boardId).physicsVersion,RACE_BANKED_PHYSICS_VERSION);
  assert.ok(player.credits>0);
 }
 const before=receipt.players.map(p=>f.rows.get('users/'+p.uid+'/economy/wallet').credits);
 assert.deepEqual(await store.settle({race,snapshot,instanceId:'owner',nowMs:clock+1}),receipt);
 assert.deepEqual(receipt.players.map(p=>f.rows.get('users/'+p.uid+'/economy/wallet').credits),before);
 await assert.rejects(store.settle({race:{...race,course:{...course,surfaceModel:undefined}},snapshot,instanceId:'owner',nowMs:clock+1}),/result_conflict/);
});

test('the actual WebSocket transport delivers the exact banked authority version and compatible driver profile',async()=>{
 const course=courseFrom(rawFacts()),id=await raceCourseKey(course),profile=createRaceVehicleProfile('bmw_e34');
 const store={course:async()=>course,admit:async()=>({profile,label:'Driver',leaseUntil:Date.now()+15000}),renew:async()=>({leaseUntil:Date.now()+15000}),release:async()=>{},releaseParticipant:async()=>{}};
 const service=createRaceServer({store,origins:['http://127.0.0.1:4000'],authenticate:async()=>({uid:'driver',expiresAtMs:Date.now()+60000})});
 await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
 const WebSocket=createRequire(new URL('../services/racing/package.json',import.meta.url))('ws');
 class BrowserSocket extends WebSocket{constructor(url){super(url,{origin:'http://127.0.0.1:4000'});}}
 let connected;const ready=new Promise(resolve=>connected=resolve),errors=[];
 const connection=createRaceConnection({uid:'driver',endpoint:'ws://127.0.0.1:'+service.server.address().port+'/race',physicsVersion:racePhysicsVersion(course),
  credentials:async()=>({idToken:'controlled-auth',appCheckToken:'controlled-appcheck'}),join:{roomCode:'BANK03',worldSeed:'controlled',courseId:id,vehicleId:'bmw_e34'},isCurrent:()=>true,
  WebSocketClass:BrowserSocket,onSnapshot:connected,onError:e=>errors.push(e)});
 try{
  await connection.connect();const state=await withinDeadline(()=>ready,3000,'banked authority snapshot');
  assert.equal(state.physicsVersion,RACE_BANKED_PHYSICS_VERSION);
  assert.equal(raceNetworkProfile(state.profiles.driver,course).vehicleId,'bmw_e34');assert.deepEqual(errors,[]);
 }finally{connection.stop();await service.close();}
});
