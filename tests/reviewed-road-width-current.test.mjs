import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {reviewedRoadTransportRecord,roadSourceSurvey} from '../app/js/world/road-source-survey.js';
import {normalizeTransportSource} from '../app/js/world/compiler/transport-source-normalizer.js?v=4';
import {createRacingVenueGroundPlan,prepareVenueSourceMerge,RACING_VENUE_SOURCES} from '../app/js/racing/venue-source-packs.js';
const source=JSON.parse(fs.readFileSync(new URL('../app/assets/racing/nordschleife/source.json',import.meta.url),'utf8'));
function record(way){return normalizeTransportSource({sourceId:'osm:way:'+way.id,id:way.id,type:'way',providerNamespace:'osm',completeness:'lossless',geometryProvenance:'osm-overpass'},way.tags);}
test('all mapped Nordschleife pavement widths survive a narrower reviewed race corridor',()=>{
 const widths=new Set();for(const way of source.ways.filter(way=>source.layout.wayIds.includes(way.id))){const before=record(way),copy=structuredClone(before),next=reviewedRoadTransportRecord(before,{venueId:source.venueId,usableWidthMeters:7,pavementWidthPolicy:'mapped'});
  assert.equal(next.crossSection,before.crossSection);assert.equal(next.crossSection.widthMeters,Number(way.tags.width));widths.add(next.crossSection.widthMeters);assert.deepEqual(before,copy);}
 assert.ok(widths.has(7)&&widths.has(12));
});
test('mapped-width preparation probes the complete pavement and preserves private policy without admitting the unfinished venue',()=>{
 const descriptor={id:source.venueId,name:'Nordschleife',pavementWidthPolicy:'mapped',groundArtifactId:'fixture',groundContentSha256:'a'.repeat(64),maximumCrossfall:.15};
 const plan=createRacingVenueGroundPlan(descriptor,source),base=createRacingVenueGroundPlan({...descriptor,pavementWidthPolicy:'usable-corridor'},source);
 assert.equal(plan.coverageProbes.length,base.coverageProbes.length);
 const a=plan.coverageProbes[0],b=plan.coverageProbes[2],oldA=base.coverageProbes[0],oldB=base.coverageProbes[2];
 assert.ok(Math.hypot(a.latitude-b.latitude,a.longitude-b.longitude)>Math.hypot(oldA.latitude-oldB.latitude,oldA.longitude-oldB.longitude)*1.4,'12 m mapped pavement receives the wider ground-support envelope');
 const prepared=prepareVenueSourceMerge({},source,descriptor,{status:'accepted',artifactIds:['fixture'],contentSha256s:[descriptor.groundContentSha256]});
 const ways=prepared.data.elements.filter(e=>e.type==='way');
 for(const way of ways)assert.equal(roadSourceSurvey(way)?.pavementWidthPolicy,source.layout.wayIds.includes(way.id)?'mapped':undefined);
 const changed=structuredClone(source);changed.ways.find(w=>w.id===changed.layout.wayIds[0]).tags.width='6';
 assert.throws(()=>createRacingVenueGroundPlan(descriptor,changed),/mapped_pavement_width_invalid/);
 assert.equal(RACING_VENUE_SOURCES.find(pack=>pack.id===source.venueId).raceAdmission,'pending-timing-line');
});
test('authored corridor behavior and ordinary roads retain their existing contracts; unknown or wider mapped corridors reject',()=>{
 const original=record({id:1,tags:{highway:'raceway'}});assert.equal(reviewedRoadTransportRecord(original,null),original);
 const next=reviewedRoadTransportRecord(original,{venueId:'silverstone',usableWidthMeters:12});assert.equal(next.crossSection.widthMeters,12);assert.equal(next.crossSection.widthSource,'reviewed-venue-usable-corridor');
 assert.throws(()=>reviewedRoadTransportRecord(original,{venueId:'test',usableWidthMeters:7,pavementWidthPolicy:'mapped'}),/mapped_width_unavailable/);
 const mapped=record({id:2,tags:{highway:'raceway',width:'8'}});
 assert.throws(()=>reviewedRoadTransportRecord(mapped,{usableWidthMeters:9,pavementWidthPolicy:'mapped'}),/mapped_width_unavailable/);
 assert.throws(()=>reviewedRoadTransportRecord(mapped,{usableWidthMeters:7,pavementWidthPolicy:'untrusted'}),/invalid_reviewed/);
});
