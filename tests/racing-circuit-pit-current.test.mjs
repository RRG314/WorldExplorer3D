import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createCircuitPitFixture,circuitPitSourceFixture} from './fixtures/circuit-pit-format.js';
import {ovalPitDriverActions} from './fixtures/oval-pit-driver.js';
import {createRaceSession} from '../app/js/racing/session-rules.js';
import {createRaceVehicleProfile,raceVehicleSpeedMetersPerSecond,stepRaceVehicle,snapshotRaceVehicle,raceVehicleGroundPose} from '../app/js/racing/vehicle-controller.js';
import {createRacePitGeometry,racePitPavementAt,circuitPitPaceActions,CIRCUIT_PIT_SPEED_METERS_PER_SECOND} from '../app/js/racing/pit-lane-rules.js';
import {raceAiActions} from '../app/js/racing/ai-controller.js';
import {racePhysicsVersion,RACE_CIRCUIT_PIT_PHYSICS_VERSION,raceRecordConfiguration} from '../app/js/racing/record-rules.js';
import {raceCourseReference,raceDistrictFingerprint,raceCourseKey,restoreRaceCourse} from '../app/js/racing/course-library.js';
import {buildRaceRoadGraph,projectRacePosition} from '../app/js/racing/course-rules.js';
import {ovalDistanceGap} from '../app/js/racing/oval-rules.js';
import {canonicalRaceDistrict} from '../app/js/racing/district-facts.js';
import {reconstructPublishedRace} from '../app/js/racing/publication-rules.js';
import {createNetworkRaceController} from '../app/js/racing/network-controller.js';
import {prepareVenueSourceMerge,createRacingVenueGroundPlan} from '../app/js/racing/venue-source-packs.js';
import {roadSourceSurvey,reviewedRoadTransportRecord} from '../app/js/world/road-source-survey.js';
const profile=createRaceVehicleProfile('bmw_m3_e92_race');
function run(engine={createRaceSession,createRaceVehicleProfile},{takePit=true,finishInPit=false,paceMetersPerSecond=10}={}){
 const {course}=createCircuitPitFixture({finishInPit}),geometry=createRacePitGeometry(course),session=engine.createRaceSession({id:'controlled-circuit-pit',course,creatorUid:'driver',createdAtMs:0});
 session.add({uid:'driver',profile:engine.createRaceVehicleProfile('bmw_m3_e92_race')});session.setReady('driver',true);session.start('driver',0);
 let state=session.snapshot(),sequence=0,sawExit=false,sawPit=false,maximumGate=0,midPit=null;
 const grid=structuredClone(state.players[0].vehicleState);session.advance(3000);assert.deepEqual(session.snapshot().players[0].vehicleState,grid,'standing countdown cannot adopt oval formation');
 for(let now=3050;now<=240000;now+=50){const me=state.players[0];
  session.control('driver',sequence++,takePit?ovalPitDriverActions(course,geometry,me,profile,{paceMetersPerSecond}):raceAiActions(course,me.vehicleState,me.progress,profile),now);
  state=session.advance(now);const p=state.players[0];
  if(p.pit.active){sawPit=true;maximumGate=Math.max(maximumGate,p.pit.nextGate);if(p.pit.nextGate>=4&&!midPit)midPit=structuredClone(state);}
  if(sawPit&&!p.pit.active)sawExit=true;if(state.phase==='complete'||p.dnf)break;
 }
 return {course,state,sawPit,sawExit,maximumGate,midPit};
}

test('an ordinary-pavement circuit starts standing, drives its real pit checkpoints, merges and finishes',()=>{
 const r=run(),p=r.state.players[0];assert.equal(r.state.phase,'complete');assert.ok(p.progress.finished&&!p.dnf);assert.ok(r.sawPit&&r.sawExit);
 assert.equal(p.pit.visits,1);assert.ok(r.maximumGate>=17);assert.equal(p.barrierContacts,0);assert.equal(p.progress.penaltyMs,0);
 assert.equal(r.state.raceControl,undefined);assert.equal(p.trackZone,undefined);assert.equal(p.draftingReduction,undefined);
 assert.equal(p.pit.speedLimitMetersPerSecond,CIRCUIT_PIT_SPEED_METERS_PER_SECOND);assert.equal(racePhysicsVersion(r.course),RACE_CIRCUIT_PIT_PHYSICS_VERSION);
});
test('passing the shared circuit entry on the main course grants no pit visit',()=>{
 const r=run(undefined,{takePit:false}),p=r.state.players[0];assert.equal(r.state.phase,'complete');assert.ok(p.progress.finished&&!p.dnf);
 assert.equal(p.pit.visits,0);assert.equal(p.barrierContacts,0);assert.equal(p.progress.penaltyMs,0);
});
test('a circuit timing line inside the branch finishes only after the required physical pit checkpoints',()=>{
 const r=run(undefined,{finishInPit:true}),p=r.state.players[0];assert.equal(r.state.phase,'complete');assert.ok(p.progress.finished&&!p.dnf);
 assert.ok(r.sawPit&&!r.sawExit);assert.ok(p.pit.active);assert.equal(p.pit.visits,1);assert.equal(p.barrierContacts,0);assert.equal(p.progress.lapTimes.length,1);
});
test('circuit pit replay and class identity agree in the browser and both generated authority engines',async()=>{
 const browser=run(),service=await import('../services/racing/generated/engine.mjs'),functions=createRequire(import.meta.url)('../functions/generated/racing-engine.cjs');
 for(const engine of [service,functions]){assert.deepEqual(run(engine).state,browser.state);assert.equal(engine.racePhysicsVersion(browser.course),RACE_CIRCUIT_PIT_PHYSICS_VERSION);}
 const f=createCircuitPitFixture(),facts=canonicalRaceDistrict({type:'RaceDistrictFacts',version:1,roads:f.roads,venueSource:f.venueSource,metersPerUnit:1,anchor:f.settings.anchor}),
  fingerprint=await raceDistrictFingerprint(facts),reference=raceCourseReference(f.course,fingerprint),restored=await reconstructPublishedRace(reference,facts),
  approvedBrowser=restoreRaceCourse(reference,facts,buildRaceRoadGraph(facts.roads,{metersPerUnit:1,venueSource:facts.venueSource}),fingerprint);
 // Class identity is built from the same canonical approved millimetre facts,
 // not from the pre-publication floating-point fixture.
 assert.equal(await raceCourseKey(restored),await raceCourseKey(approvedBrowser));assert.equal(racePhysicsVersion(restored),RACE_CIRCUIT_PIT_PHYSICS_VERSION);
});
test('circuit entry overspeed receives one session-owned penalty, with no oval restriction fields',()=>{
 const r=run(undefined,{paceMetersPerSecond:22}),p=r.state.players[0];assert.equal(r.state.phase,'complete');assert.ok(p.progress.finished&&!p.dnf);assert.equal(p.pit.visits,1);
 assert.equal(p.progress.penaltyMs,5000);assert.equal(p.pit.penaltyReason,'pit-entry-speed');assert.equal(p.ovalPenaltyReason,undefined);
});
test('network prediction uses the identical circuit pit support and input restriction without modifying authority state',()=>{
 const r=run(),state={...r.midPit,physicsVersion:racePhysicsVersion(r.course),profiles:{driver:raceRecordConfiguration(profile,{course:r.course})}},p=state.players[0],writes=[],
  connection={snapshot:()=>state,connected:()=>true,isFresh:()=>true,control:a=>writes.push(a),stop(){}},context={worldPublication:{},car:{personalVehicleId:profile.vehicleId},Walk:{state:{mode:'drive'}},activateSurfaceActivity:()=>true},
  controller=createNetworkRaceController({context,course:r.course,connection,uid:'driver'});
 controller.start();const frozen=JSON.stringify(state),input={throttle:1},expected=structuredClone(p.vehicleState),geometry=createRacePitGeometry(r.course);
 stepRaceVehicle(racePitPavementAt(r.course,geometry,raceVehicleGroundPose(expected),p.pit),expected,circuitPitPaceActions(input,raceVehicleSpeedMetersPerSecond(expected),true),1/60,profile);
 assert.deepEqual(controller.step(1/60,input),snapshotRaceVehicle(expected));assert.deepEqual(writes,[input]);assert.equal(JSON.stringify(state),frozen);controller.dispose();
});
test('circuit pit exit detects a genuinely occupied main-lane gap and applies one merge penalty',()=>{
 const {course}=createCircuitPitFixture(),geometry=createRacePitGeometry(course),session=createRaceSession({id:'circuit-pit-merge',course,creatorUid:'driver',createdAtMs:0});
 for(const uid of ['driver','main'])session.add({uid,profile});for(const uid of ['driver','main'])session.setReady(uid,true);session.start('driver',0);
 let state=session.snapshot(),sequence=0,holding=false,merged=null,gapAtMerge=null;
 for(let now=50;now<=160000;now+=50){
  const driver=state.players.find(p=>p.uid==='driver'),main=state.players.find(p=>p.uid==='main'),projection=projectRacePosition(course,main.pose),
   gap=ovalDistanceGap(projection.distanceMeters,geometry.exitDistanceMeters,course.lengthMeters);
  let actions=raceAiActions(course,main.vehicleState,main.progress,profile,{laneOffsetMeters:-1.4});
  if((!driver.pit.visits||driver.pit.active)&&gap<55&&gap> -5)holding=true;
  if(holding&&(!driver.pit.visits||driver.pit.active)){
   const target=Math.max(0,Math.min(8,(gap-.5)*.5)),difference=target-Math.abs(raceVehicleSpeedMetersPerSecond(main.vehicleState));
   actions={...actions,throttle:difference>.2?Math.min(1,difference*.6):0,serviceBrake:difference<-.2?Math.min(1,-difference*.4):0};
  }
  session.control('driver',sequence,ovalPitDriverActions(course,geometry,driver,profile),now);session.control('main',sequence++,actions,now);state=session.advance(now);
  const p=state.players.find(p=>p.uid==='driver');if(p.pit.visits&&!p.pit.active){merged=p;gapAtMerge=Math.abs(ovalDistanceGap(projectRacePosition(course,p.pose).distanceMeters,projectRacePosition(course,state.players.find(p=>p.uid==='main').pose).distanceMeters,course.lengthMeters));break;}
 }
 assert.ok(holding&&merged);assert.ok(gapAtMerge<10,'the other car physically occupies the exit gap');assert.equal(merged.pit.penaltyReason,'unsafe-pit-merge');
 assert.equal(merged.progress.penaltyMs,5000);assert.ok(state.players.every(p=>p.barrierContacts===0));
});
test('circuit source review keeps its separate mapped pit width, tags and existing transport/ground owners',()=>{
 const {source,descriptor,ground}=circuitPitSourceFixture(),before=JSON.stringify(source),prepared=prepareVenueSourceMerge({},source,descriptor,ground),
  main=prepared.data.elements.find(e=>e.type==='way'&&e.id===101),pit=prepared.data.elements.find(e=>e.type==='way'&&e.id===102),review=roadSourceSurvey(pit);
 assert.equal(JSON.stringify(source),before);assert.equal(main.tags.width,'20');assert.equal(pit.tags.width,'8');assert.equal(review.usableWidthMeters,6);assert.equal(review.pavementWidthPolicy,'mapped');
 assert.equal(roadSourceSurvey(main).usableWidthMeters,12);assert.equal(review.venueSource,prepared.metadata.venueSource);assert.equal(roadSourceSurvey(JSON.parse(JSON.stringify(pit))),null);
 const record={identity:'osm:way:102',crossSection:{widthMeters:8,widthSource:'source:width',placement:{}},provenance:{}},accepted=reviewedRoadTransportRecord(record,review);
 assert.equal(accepted.crossSection,record.crossSection);assert.ok(createRacingVenueGroundPlan(descriptor,source).coverageProbes.length>0);
 for(const change of [{pitUsableWidthMeters:undefined},{pitPavementWidthPolicy:undefined},{pitUsableWidthMeters:9},{pitUsableWidthMeters:5},{raceDiscipline:'sprint'}]){
  assert.throws(()=>prepareVenueSourceMerge({},source,{...descriptor,...change},ground),/pit_(review|width)_unavailable/);
 }
});
