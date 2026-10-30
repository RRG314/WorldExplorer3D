import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeTransportSource} from '../app/js/world/compiler/transport-source-normalizer.js?v=4';
import {roadSourceSurvey,reviewedRoadTransportRecord} from '../app/js/world/road-source-survey.js';
import {RACING_VENUE_SOURCES,loadRacingVenueSource,prepareVenueSourceMerge} from '../app/js/racing/venue-source-packs.js';
import {compileTransportNetworkModel} from '../app/js/world/compiler/transport-network-model.js';
const pack=RACING_VENUE_SOURCES.find(p=>p.id==='nurburgring-nordschleife');
const source=await loadRacingVenueSource(pack,{fetchImpl:async url=>new Response(fs.readFileSync(new URL('..'+url,import.meta.url)))}),
 prepared=prepareVenueSourceMerge({},source,pack,{status:'accepted',artifactIds:pack.groundArtifacts.map(x=>x.artifactId),contentSha256s:pack.groundArtifacts.map(x=>x.contentSha256)}),
 ways=prepared.data.elements.filter(w=>roadSourceSurvey(w)),record=w=>normalizeTransportSource({sourceId:'osm:way:'+w.id,id:w.id,type:'way',providerNamespace:'osm',completeness:'lossless'},w.tags);

test('reviewed virtual raceways preserve real-world private tags and pedestrian restrictions while entering the existing motor graph',()=>{
 assert.equal(ways.length,53);
 const roads=ways.map((way,i)=>{const original=record(way),survey=roadSourceSurvey(way),actual=reviewedRoadTransportRecord(original,survey);
  assert.equal(original.safeForDriving,false);assert.equal(original.access.motorVehicle,'prohibited');assert.equal(actual.safeForDriving,true);
  assert.equal(actual.sourceTags.access,'private');assert.equal(actual.rawTags.access,'private');assert.equal(actual.access.pedestrian,'prohibited');
  assert.equal(actual.access.motorSource,'reviewed:virtual-raceway');assert.equal(actual.provenance.reviewedMotorAccess,'virtual-raceway-v1');
  return {sourceFeatureId:actual.identity,transportRecord:actual,driveable:actual.safeForDriving,walkable:false,type:'raceway',width:8,metersPerWorldUnit:1,
   pts:[{x:i*100,z:0},{x:i*100+50,z:0}],sourceNodeIds:[String(i*2),String(i*2+1)],structureSemantics:{terrainMode:'at_grade'}};
 });
 const graph=compileTransportNetworkModel(roads);assert.ok(graph);assert.ok(roads.every(r=>r.transportGraphRef.driveable));assert.ok(roads.every(r=>!r.transportGraphRef.walkable));
});

test('ordinary private roads, explicit motor bans, incomplete geometry and copied provider tags cannot opt into virtual track access',()=>{
 const way=ways[0],survey=roadSourceSurvey(way),original=record(way);
 assert.equal(reviewedRoadTransportRecord(original,null),original);
 assert.equal(reviewedRoadTransportRecord(original,{...survey,motorAccess:undefined}).safeForDriving,false);
 const json=JSON.parse(JSON.stringify(way));json.tags.motorAccess='virtual-raceway-v1';assert.equal(roadSourceSurvey(json),null);assert.equal(record(json).safeForDriving,false);
 for(const change of [r=>r.sourceTags.highway='residential',r=>r.sourceTags.access='no',r=>r.access.motorSource='motor_vehicle',r=>r.routeState='incomplete',r=>r.completeness='generalized',r=>r.identity='osm:way:foreign']){
  const r=structuredClone(original);change(r);assert.throws(()=>reviewedRoadTransportRecord(r,survey),/raceway_access/);
 }
 for(const change of [s=>s.motorAccess='unbounded',s=>s.venueSource=undefined,s=>s.venueId='foreign']){
  const s=structuredClone(survey);change(s);assert.throws(()=>reviewedRoadTransportRecord(original,s),/raceway_access/);
 }
});
