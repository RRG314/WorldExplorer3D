import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalRaceDistrict,rebaseRaceReference,assertRaceCourseInDistrict,reconstructPublishedRace,readPublishedRaceCourse,raceLocationKey} from '../app/js/racing/publication-rules.js';
import {buildRaceRoadGraph,createRaceCourse} from '../app/js/racing/course-rules.js';
import {raceDistrictFingerprint,raceCourseReference,raceCourseKey} from '../app/js/racing/course-library.js';
import {prepareRacingDistrictIntake} from '../scripts/racing/intake-district.mjs';
import {raceOnlineMetadata,raceQualificationMetadata} from '../app/js/racing/driver-progress.js';
import {createRaceAuthority} from '../services/racing/authority.mjs';
import {racePhysicsVersion} from '../app/js/racing/record-rules.js';
import {createRaceVehicleProfile} from '../app/js/racing/vehicle-controller.js';
const facts={type:'RaceDistrictFacts',version:1,locationId:'earth:430000000:70000000',locationLabel:'Controlled district',anchor:{lat:43,lon:7},metersPerUnit:1,
 roads:[{sourceId:'controlled',a:{x:0,y:0,z:0,connectionLayer:'node:1'},b:{x:0,y:0,z:250.00000000002,connectionLayer:'node:2'},widthMeters:8,structure:'surface',clearanceMeters:0,direction:'both',driveable:true,supported:true,heightSampleSpanMeters:1.2,heightSamples:[{t:0,y:0,leftY:0,rightY:0},{t:1,y:0,leftY:0,rightY:0}]}]};
const originalCourse=createRaceCourse(buildRaceRoadGraph(facts.roads),['controlled:forward'],{...facts,participants:4});
const originalReference=raceCourseReference(originalCourse,await raceDistrictFingerprint(facts));
const canonical=canonicalRaceDistrict(facts),reference=await rebaseRaceReference(originalReference,canonical,facts),course=await reconstructPublishedRace(reference,canonical),id=await raceCourseKey(course),districtId=(await raceDistrictFingerprint(canonical)).slice(14);
const turn=()=>new Promise(r=>setImmediate(r));
test('approved millimetre snapshot preserves private V1 fingerprints and road course support',async()=>{
 assert.notEqual(reference.districtFingerprint,originalReference.districtFingerprint);assert.equal(await raceDistrictFingerprint(facts),originalReference.districtFingerprint);
 assert.equal(canonical.roads[0].b.z,250);assert.equal(assertRaceCourseInDistrict(course,facts),true);
 assert.equal(await raceDistrictFingerprint(canonicalRaceDistrict({...facts,roads:[{...facts.roads[0],b:{...facts.roads[0].b,z:250.00000000003}}]})),reference.districtFingerprint);
});
test('replaced decks, missing spans, altered heights, narrowing and direction changes cannot admit a published course',()=>{
 for(const change of [{roads:[]},{roads:[{...facts.roads[0],structure:'bridge'}]},{roads:[{...facts.roads[0],widthMeters:7}]},{roads:[{...facts.roads[0],direction:'reverse'}]},
  {roads:[{...facts.roads[0],a:{...facts.roads[0].a,y:3},b:{...facts.roads[0].b,y:3},heightSamples:[{t:0,y:3,leftY:3,rightY:3},{t:1,y:3,leftY:3,rightY:3}]}]}])assert.throws(()=>assertRaceCourseInDistrict(course,{...facts,...change}));
});
test('public course loader requires exact active approved facts and keeps creator tests owner-only',async()=>{
 const rows=new Map([[`racingCourses/${id}`,{status:'draft',ownerUid:'creator',revision:'one',districtId,reference,physicsVersion:racePhysicsVersion(course)}],
  [`racingDistricts/${districtId}`,{status:'approved',facts:canonical}],[`racingLocations/${await raceLocationKey(facts.locationId)}`,{districtId}]]);
 const read=async key=>rows.get(key)||null;
 assert.equal(await readPublishedRaceCourse({read,id,uid:'other'}),null);assert.equal((await readPublishedRaceCourse({read,id,uid:'creator'})).publication.purpose,'qualification');
 rows.get(`racingCourses/${id}`).status='approved';assert.equal((await readPublishedRaceCourse({read,id,uid:'other'})).publication.purpose,'competition');
 rows.set(`racingLocations/${await raceLocationKey(facts.locationId)}`,{districtId:'replacement'});await assert.rejects(readPublishedRaceCourse({read,id,uid:'creator'}),/requalify/);
});
test('operator intake requires source rights and exact build provenance, without accepting oversized or malformed facts',async()=>{
 const input={facts,credits:[{role:'roads',label:'OpenStreetMap contributors',license:'ODbL-1.0',url:'https://www.openstreetmap.org/copyright'},{role:'terrain',label:'Controlled terrain fixture',license:'Test fixture only',url:'https://example.test/fixture'}],provenance:{capturedAt:'2026-10-29T12:00:00Z',sourceRelease:'Controlled fixture',buildId:'test-controlled',reviewNote:'Not a real venue.'}};
 assert.equal((await prepareRacingDistrictIntake(input)).id,districtId);
 for(const v of [{...input,credits:[]},{...input,provenance:{}},{...input,facts:{...facts,roads:[{...facts.roads[0],sourceId:'x'.repeat(181)}]}},{...input,credits:[{...input.credits[0],url:'http://example.test'}]}])await assert.rejects(prepareRacingDistrictIntake(v));
});
test('a solo creator test uses shared physics, completes once and cannot become a shared-time Journal entry',async()=>{
 let clock=0,settled=0,final;const profile=createRaceVehicleProfile('bmw_e34'),published={...course,publication:{purpose:'qualification',ownerUid:'creator'}};
 const authority=createRaceAuthority({now:()=>clock,store:{course:async()=>published,admit:async()=>({profile,label:'Creator',leaseUntil:clock+15000}),renew:async()=>({leaseUntil:clock+15000}),release:async()=>{},releaseParticipant:async()=>{},settle:async({snapshot})=>{settled++;return {id:snapshot.id,purpose:'qualification',players:[{uid:'creator',finished:true,timeMs:snapshot.players[0].progress.elapsedMs,credits:0}]};}}});
 const client={uid:'creator',isOpen:()=>true,send:value=>{if(value.snapshot)final=value.snapshot;},close:()=>{}};
 const command=v=>authority.command(client,JSON.stringify(v));await command({type:'join',roomCode:'TEST01',worldSeed:'controlled',courseId:id,vehicleId:'bmw_e34'});await command({type:'ready',ready:true});await command({type:'start'});
 for(let sequence=0;clock<30000;sequence++){clock+=50;if(['countdown','running'].includes(final.phase)&&!final.players[0].progress?.finished)await command({type:'control',sequence,actions:{throttle:1}});authority.tick();await turn();if(final.settlement==='saved')break;}
 assert.equal(final.phase,'complete');assert.equal(final.purpose,'qualification');assert.equal(settled,1);const player=final.players[0],options={courseId:id,recordKey:'race-route-test-'+id.slice(-32),physicsVersion:final.physicsVersion};
 const metadata=raceQualificationMetadata(final,player,options);assert.equal(metadata.raceVerified,false);assert.equal(metadata.racingPracticeVersion,undefined);assert.equal(metadata.racingQualificationVersion,1);
 assert.throws(()=>raceOnlineMetadata(final,player,{...options,recordKey:'race-online-'+id.slice(-32)}),/receipt/);await authority.close();
});
