import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildRaceRoadGraph} from '../app/js/racing/course-rules.js';
import {canonicalRaceDistrict} from '../app/js/racing/district-facts.js';
const length=1.675,at=(t,edge)=>({t,y:0,leftY:0,rightY:edge*.3,lateralSamples:[{offsetMeters:-4,y:0},{offsetMeters:0,y:0},{offsetMeters:4,y:edge}]}),road={sourceId:'controlled-precision',sourceFeatureId:'controlled-precision',a:{x:0,y:0,z:0},b:{x:0,y:0,z:length},widthMeters:8,structure:'surface',direction:'both',driveable:true,supported:true,surfaceModel:'banked-road-v1',heightSampleSpanMeters:1.2,heightSamples:[at(0,.00049),at(1,.00049+.2199*length)]},facts={type:'RaceDistrictFacts',version:1,locationLabel:'Controlled precision fixture',anchor:{lat:50,lon:7},metersPerUnit:1,roads:[road]};
test('canonical lateral heights preserve a valid near-limit plane without relaxing the slope fence',async()=>{
 assert.equal(buildRaceRoadGraph(facts.roads).edges.length,2);
 const canonical=canonicalRaceDistrict(facts);assert.equal(buildRaceRoadGraph(canonical.roads).edges.length,2);
 assert.equal(canonical.roads[0].heightSamples[0].lateralSamples.at(-1).y,.0005);
 assert.equal(canonical.roads[0].heightSamples[1].lateralSamples.at(-1).y,.3688);
 const engines=[await import('../services/racing/generated/engine.mjs'),createRequire(import.meta.url)('../functions/generated/racing-engine.cjs')];
 for(const engine of engines)assert.deepEqual(engine.canonicalRaceDistrict(facts),canonical);
 const unsafe=structuredClone(facts);unsafe.roads[0].heightSamples[1]=at(1,.00049+.221*length);
 assert.throws(()=>canonicalRaceDistrict(unsafe),/heights/);
});
test('ordinary profiles retain their existing millimetre canonical values',()=>{
 const ordinary=structuredClone(facts),r=ordinary.roads[0];delete r.surfaceModel;
 for(const s of r.heightSamples){delete s.lateralSamples;s.y=.00049;s.leftY=.00049;s.rightY=.00049;}r.a.y=.00049;r.b.y=.00049;
 const canonical=canonicalRaceDistrict(ordinary);assert.equal(canonical.roads[0].heightSamples[0].y,0);assert.equal(canonical.roads[0].heightSamples[0].leftY,0);assert.equal(canonical.roads[0].a.y,0);
});
