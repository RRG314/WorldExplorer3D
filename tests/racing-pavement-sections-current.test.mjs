import test from 'node:test';import assert from 'node:assert/strict';
import {BANKED_ROAD_MODEL,PROFILED_ROAD_PAVEMENT_MODEL} from '../app/js/physics/road-plane-dynamics.js';
import {buildRaceRoadGraph,createRaceCourse,raceGridPose,sampleRaceSegmentY,projectRacePosition,raceProjectionOutsidePavement} from '../app/js/racing/course-rules.js';
import {canonicalRaceDistrict} from '../app/js/racing/district-facts.js';
import {racePavementCrossSection} from '../app/js/racing/pavement-cross-section.js';
import {createRaceVehicleProfile,createRaceVehicleState,stepRaceVehicle} from '../app/js/racing/vehicle-controller.js';
import {racePhysicsVersion,RACE_PROFILED_PAVEMENT_PHYSICS_VERSION,RACE_BANKED_PHYSICS_VERSION} from '../app/js/racing/record-rules.js';
import {raceClosureContains} from '../app/js/racing/closed-course.js';
const slope=Math.tan(31*Math.PI/180),apron=Math.tan(1.5*Math.PI/180),height=l=>10-slope*Math.min(l,6)-apron*Math.max(0,l-6),offsets=[-3,-1.2,0,1.2,6,15];
function fixture(){const road={sourceId:'mapped-test-road',sourceFeatureId:'osm:way:11',a:{x:0,y:10,z:0,connectionLayer:'node:1'},b:{x:0,y:10,z:300,connectionLayer:'node:2'},widthMeters:18,direction:'both',structure:'surface',supported:true,driveable:true,surfaceModel:BANKED_ROAD_MODEL,pavementModel:PROFILED_ROAD_PAVEMENT_MODEL,racingWidthMeters:6,heightSampleSpanMeters:1.2,heightSamples:[0,1].map(t=>({t,y:10,leftY:height(-1.2),rightY:height(1.2),racingOffsetMeters:1.5,lateralSamples:offsets.map(offsetMeters=>({offsetMeters,y:height(offsetMeters)}))}))},graph=buildRaceRoadGraph([road]),course=createRaceCourse(graph,[graph.edges[0].id],{discipline:'sprint',participants:4,locationId:'controlled',locationLabel:'Controlled bank',anchor:{lat:29.185,lon:-81.071}});return {road,graph,course};}
test('profiled pavement retains asymmetric physical bounds, separate racing line, reversed coordinates and canonical heights',()=>{
 const {road,graph,course}=fixture(),s=course.segments[0];assert.deepEqual(racePavementCrossSection(s,.5),{minimumMeters:-3,maximumMeters:15,racingOffsetMeters:1.5,racingWidthMeters:6});
 for(let x=-3;x<=15;x+=.25)assert.ok(Math.abs(sampleRaceSegmentY(s,.5,x)-height(x))<1e-12);
 const reverse=graph.edges[1],segment={...reverse,a:road.b,b:road.a};assert.deepEqual(racePavementCrossSection(segment,.5),{minimumMeters:-15,maximumMeters:3,racingOffsetMeters:-1.5,racingWidthMeters:6});assert.ok(Math.abs(sampleRaceSegmentY(segment,.5,-12)-height(12))<1e-12);
 const district={type:'RaceDistrictFacts',version:1,anchor:{lat:29.185,lon:-81.071},locationLabel:'Controlled',metersPerUnit:1,roads:[road]},canonical=canonicalRaceDistrict(district);assert.equal(canonical.roads[0].pavementModel,PROFILED_ROAD_PAVEMENT_MODEL);assert.equal(canonical.roads[0].heightSamples[0].racingOffsetMeters,1.5);assert.equal(canonical.roads[0].racingWidthMeters,6);
 const legacy={...road};delete legacy.pavementModel;assert.throws(()=>buildRaceRoadGraph([legacy]),/heights|pavement_sections/,'asymmetric geometry cannot enter through an unclassified old road');
 assert.throws(()=>buildRaceRoadGraph([{...road,racingWidthMeters:30}]),/pavement_sections/);assert.throws(()=>buildRaceRoadGraph([{...road,pavementModel:'unreviewed'}]),/surface_model/);
 assert.equal(racePhysicsVersion(course),RACE_PROFILED_PAVEMENT_PHYSICS_VERSION);assert.equal(racePhysicsVersion({surfaceModel:BANKED_ROAD_MODEL}),RACE_BANKED_PHYSICS_VERSION);
});
test('grid and timing remain on the bank while apron projection, closure and driving use the actual physical width',()=>{
 const {course}=fixture();for(let i=0;i<4;i++){const pose=raceGridPose(course,i);assert.ok(pose.x>=.1-1e-12&&pose.x<=2.9+1e-12);assert.ok(Math.abs(pose.y-height(pose.x))<1e-12);}
 assert.ok(course.gates.every(g=>g.x===1.5&&g.halfWidthMeters===3&&Math.abs(g.y-height(1.5))<1e-12));
 for(const x of [-4,12,16]){const pose={x,y:height(x),z:100},p=projectRacePosition(course,pose);assert.equal(raceProjectionOutsidePavement(p,0),x!==12);assert.equal(raceClosureContains(course,pose,0),x===12);}
 assert.equal(raceClosureContains(course,{x:12,y:height(12),z:10000},0),false);
 const profile=createRaceVehicleProfile('bmw_e34'),car=createRaceVehicleState({x:12,y:height(12),z:30,yaw:0},profile);
 for(let i=0;i<180;i++)stepRaceVehicle(course,car,{throttle:1,steer:0,serviceBrake:0,reverse:0,brake:0},1/60,profile);
 assert.equal(car.barrierContacts,0);assert.ok(car.x>9&&car.z>35);assert.ok(Math.abs(car.terrainRoll)<.04);assert.ok(car.maximumWheelGap<.02);
});


test('publication revalidation checks the full apron and racing line, including changes beyond the old wheel-width probes',async()=>{
 const {assertRaceCourseInDistrict}=await import('../app/js/racing/publication-rules.js'),{course,road}=fixture(),facts={locationId:course.locationId,anchor:course.anchor,metersPerUnit:1,roads:[road]};assert.equal(assertRaceCourseInDistrict(course,facts),true);
 const altered=structuredClone(course);for(const row of altered.segments[0].heightSamples)row.lateralSamples.at(-1).y+=.04;
 assert.throws(()=>assertRaceCourseInDistrict(altered,facts),/requalify/,'a changed far apron cannot hide outside the old centre and wheel probes');
 const moved=structuredClone(course);for(const row of moved.segments[0].heightSamples)row.racingOffsetMeters+=.02;
 assert.throws(()=>assertRaceCourseInDistrict(moved,facts),/requalify/,'the racing line is part of the same qualified publication');
});


test('existing event paint and furniture follow the asymmetric edges and bank-centred grid',async()=>{
 const {course}=fixture(),{buildRacePaint}=await import('../app/js/racing/course-markings.js'),{buildRaceFurniture}=await import('../app/js/racing/course-furniture.js'),paint=buildRacePaint(course),furniture=buildRaceFurniture(course);
 let maximum=-Infinity,minimum=Infinity;for(let i=0;i<paint.positions.length;i+=3){const x=paint.positions[i],y=paint.positions[i+1];maximum=Math.max(maximum,x);minimum=Math.min(minimum,x);assert.ok(Math.abs(y-height(x)-.018)<.00001,'paint must follow the same bank/apron height');}
 assert.ok(maximum>14.7&&maximum<15);assert.ok(minimum< -2.6&&minimum> -3);assert.ok(paint.rectangles.some(r=>r.variableLateral));
 const xs=furniture.chunks.flatMap(c=>c.positions.filter((_,i)=>i%3===0));assert.ok(Math.max(...xs)>15.4);assert.ok(Math.min(...xs)< -3.4);
});

test('qualification transfers the complete actual uploaded bank and apron through normal SurfaceQuery into canonical race facts',async t=>{
 const {createPavementSectionsFixture}=await import('./fixtures/pavement-sections.js'),{collectRaceDistrict}=await import('../app/js/racing/world-course-source.js'),{createRoadContactIndex}=await import('../app/js/terrain/road-contact-index.js'),{ctx}=await import('../app/js/shared-context.js?v=55'),{GroundHeight}=await import('../app/js/ground.js'),{createSurfaceQuery}=await import('../app/js/world/surface-contract.js'),{sampleFeatureSurfaceY}=await import('../app/js/structure-semantics.js?v=63');
 const f=await createPavementSectionsFixture(),index=createRoadContactIndex(f.batches.map(b=>({geometry:{attributes:{position:{array:b.positions}},getIndex:()=>({array:b.indices})},userData:{terrainMode:'at_grade'}}))),previous={roads:ctx.roads,roadContactIndex:ctx.roadContactIndex,car:ctx.car,METERS_PER_WORLD_UNIT:ctx.METERS_PER_WORLD_UNIT};t.after(()=>{index.dispose();Object.assign(ctx,previous);});
 Object.assign(ctx,{roads:[f.road],roadContactIndex:index,car:{road:f.road},METERS_PER_WORLD_UNIT:1});t.mock.method(GroundHeight,'terrainY',f.native);
 const context={METERS_PER_WORLD_UNIT:1,worldPublication:{requestId:'controlled-real-mesh',location:{lat:29.185,lon:-81.071}},buildings:[],roadContactIndex:index,sampleFeatureSurfaceY,SurfaceQuery:createSurfaceQuery(ctx,GroundHeight),transportDetail:{hasReadyCoverageAt:()=>true},buildTraversalNetworks:()=>({drive:{segments:f.road.pts.slice(1).map((p2,segIndex)=>({feature:f.road,p1:f.road.pts[segIndex],p2,segIndex,sourceTStart:0,sourceTEnd:1,fromId:segIndex,toId:segIndex+1,direction:'forward'}))}})};
 const facts=await collectRaceDistrict(context,{yieldWork:async()=>{}});assert.equal(facts.roads.length,2,JSON.stringify(facts.diagnostics));const canonical=canonicalRaceDistrict(facts);assert.equal(canonical.roads.length,2);
 for(const road of facts.roads){assert.equal(road.pavementModel,PROFILED_ROAD_PAVEMENT_MODEL);assert.equal(road.racingWidthMeters,6);assert.ok(road.heightSamples.every(s=>s.racingOffsetMeters===1.5&&s.lateralSamples[0].offsetMeters===-3&&s.lateralSamples.at(-1).offsetMeters===15));
  for(let i=1;i<road.heightSamples.length;i++){const t=road.heightSamples[i].t,z=road.a.z+(road.b.z-road.a.z)*t;for(const x of [-2.5,0,5.9,6.1,12,14.5])assert.ok(Math.abs(sampleRaceSegmentY(road,t,x)-index.sampleAt(x,z))<.0001);}
 }
});


test('a timing gate reads the bank height under the crossing without enlarging its vertical allowance',async()=>{
 const {createRaceProgress,advanceRaceProgress}=await import('../app/js/racing/course-rules.js'),{road}=fixture(),bank=.69,y=x=>10-bank*Math.min(x,6)-apron*Math.max(0,x-6);for(const row of road.heightSamples){row.leftY=y(-1.2);row.rightY=y(1.2);for(const p of row.lateralSamples)p.y=y(p.offsetMeters);}
 const graph=buildRaceRoadGraph([road]),course=createRaceCourse(graph,[graph.edges[0].id],{discipline:'sprint',participants:1,locationId:'controlled',anchor:{lat:29.185,lon:-81.071}}),x=4.45,gate=course.gates[0],from={x,y:y(x),z:gate.z-1},to={x,y:y(x),z:gate.z+1};assert.ok(Math.abs(to.y-gate.y)>2,'a centre-height gate would reject the supported outer bank lane');
 const progress=createRaceProgress(from,1000),next=advanceRaceProgress(course,progress,to,1100,{startedAtMs:0});assert.equal(next.nextGate,1);
 const airborne=createRaceProgress({...from,y:from.y+2.1},1000),rejected=advanceRaceProgress(course,airborne,{...to,y:to.y+2.1},1100,{startedAtMs:0});assert.equal(rejected.nextGate,0,'the existing two-metre vertical fence is unchanged');
});

test('browser, socket-service and Functions bundles reconstruct the same profiled course and preserve its storage and class',async()=>{
 const {createRequire}=await import('node:module'),service=await import('../services/racing/generated/engine.mjs'),functions=createRequire(import.meta.url)('../functions/generated/racing-engine.cjs'),{createRaceSession}=await import('../app/js/racing/session-rules.js'),{raceCourseKey,raceDistrictFingerprint,raceCourseReference}=await import('../app/js/racing/course-library.js'),{prepareRaceDistrictStorage,readRaceDistrictFacts}=await import('../app/js/racing/district-storage.js'),{reconstructPublishedRace}=await import('../app/js/racing/publication-rules.js'),{road}=fixture(),facts=canonicalRaceDistrict({type:'RaceDistrictFacts',version:1,anchor:{lat:29.185,lon:-81.071},locationLabel:'Controlled',metersPerUnit:1,roads:[road]}),graph=buildRaceRoadGraph(facts.roads),course=createRaceCourse(graph,[graph.edges[0].id],{...facts,discipline:'sprint',participants:1}),fingerprint=await raceDistrictFingerprint(facts),reference=raceCourseReference(course,fingerprint),expected=await reconstructPublishedRace(reference,facts),key=await raceCourseKey(expected),storage=await prepareRaceDistrictStorage(facts);
 assert.deepEqual(await readRaceDistrictFacts(storage.fields),facts);
 const browser={canonicalRaceDistrict,raceCourseKey,raceDistrictFingerprint,reconstructPublishedRace,createRaceVehicleProfile,createRaceSession,racePhysicsVersion},snapshots=[];
 for(const engine of [browser,service,functions]){
  const normalized=engine.canonicalRaceDistrict(facts),restored=await engine.reconstructPublishedRace(reference,normalized);assert.deepEqual(restored,expected);assert.equal(await engine.raceCourseKey(restored),key);assert.equal(await engine.raceDistrictFingerprint(normalized),fingerprint);assert.equal(engine.racePhysicsVersion(restored),RACE_PROFILED_PAVEMENT_PHYSICS_VERSION);
  const session=engine.createRaceSession({id:'controlled-profiled',course:restored,creatorUid:'driver',createdAtMs:0});session.add({uid:'driver',label:'Driver',profile:engine.createRaceVehicleProfile('bmw_m3_e92_race')});session.setReady('driver',true);session.start('driver',0);
  for(let i=1;i<=180;i++){const at=4000+i*1000/60;session.control('driver',i,{throttle:1,steer:0},at);session.advance(at);}const snapshot=session.snapshot();assert.equal(snapshot.players[0].dnf,false);snapshots.push(snapshot);
 }
 assert.deepEqual(snapshots[1],snapshots[0]);assert.deepEqual(snapshots[2],snapshots[0]);
});
