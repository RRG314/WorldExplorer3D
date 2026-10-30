import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareCarriagewayTiles} from '../app/js/world/compiler/street-carriageway.js';
import {meshCarriagewayTile} from '../app/js/world/compiler/street-carriageway-mesh.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
import {createRegionalRoadContact} from '../app/js/terrain/regional-road-contact.js';
import {collectRaceDistrict} from '../app/js/racing/world-course-source.js';
import {sampleRaceSegmentY,buildRaceRoadGraph} from '../app/js/racing/course-rules.js';
import {authorVenueEdgeRecipes} from '../app/js/racing/venue-edge-authoring.js';
import {compileMappedVenueLayout} from '../app/js/racing/venue-layout.js';
import {RACING_VENUE_SOURCES} from '../app/js/racing/venue-source-packs.js';
import {reviewedRoadEdgeRecipe} from '../app/js/world/reviewed-road-edge-source.js';
const recipe=Object.freeze({version:1,sourceLengthMeters:22,venueId:'controlled',sourceFeatureId:'controlled',sourceSha256:'a'.repeat(64),bands:[{side:1,startMeters:0,endMeters:22,widthMeters:.7,heightMeters:.045,rampMeters:.35,taperMeters:5,stripeMeters:1,phaseMeters:0}]}),evidence={version:1,venueId:'controlled',sourceFeatureId:'controlled',surfaceModel:'banked-road-v1',maximumCrossfall:.7,venueSource:{sourceSha256:'a'.repeat(64)},edgeBandRecipe:recipe};
function setup(){
 const road={sourceFeatureId:'controlled',pts:[{x:0,z:0},{x:0,z:20}],width:8,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:evidence,transportSurfaceModel:{surveyedSurface:{...evidence},reviewedSurfacePhase:'accepted',maximumReviewedCrossfall:0}};
 const batch=[],base=(x,z)=>10+x*.03+z*.02,partition=(v,sample)=>Float32Array.from(v.map((n,i)=>i%3===1?sample(v[i-1],v[i+1]):n));
 for(const tile of prepareCarriagewayTiles([{...road,edgeBandRecipe:reviewedRoadEdgeRecipe(road)}])){const data=meshCarriagewayTile(tile,base,partition);batch.push(data);if(data.edgeBands)batch.push(data.edgeBands);}
 const meshes=batch.map(b=>({geometry:{attributes:{position:{array:b.positions}},getIndex:()=>({array:b.indices})},userData:{terrainMode:'at_grade'}})),contacts=createRegionalRoadContact(createRoadContactIndex(meshes));
 const context={METERS_PER_WORLD_UNIT:1,worldPublication:{requestId:'controlled',location:{lat:50,lon:7}},buildings:[],roadContactIndex:contacts,transportDetail:{hasReadyCoverageAt:()=>true},sampleFeatureSurfaceY:(_r,x,z)=>base(x,z),
  buildTraversalNetworks:()=>({drive:{segments:[{feature:road,p1:road.pts[0],p2:road.pts[1],segIndex:0,sourceTStart:0,sourceTEnd:1,fromId:0,toId:1,direction:'forward'}]}}),
  SurfaceQuery:{driveAt:(x,z,o)=>{const y=contacts.sampleAt(x,z,o.currentY,'at_grade');return {kind:Number.isFinite(y)?'road':'terrain',position:{y}};}}};
 return {road,base,contacts,context};
}
test('qualification reads actual raised tops and transfers their full profile to the shared race graph',async()=>{
 const h=setup();try{
  const district=await collectRaceDistrict(h.context,{yieldWork:async()=>{}}),road=district.roads[0];
  assert.ok(road.heightSamples.every(s=>s.lateralSamples.length>=7&&s.lateralSamples.length<=32));
  assert.ok(road.heightSamples.some(s=>Math.abs(s.t-.25)<1e-6),'the original source length is scaled only for dressing stations, not stretched into the mapped road');
  let graph;assert.doesNotThrow(()=>{graph=buildRaceRoadGraph(district.roads,{metersPerUnit:1});},JSON.stringify(road.heightSamples));assert.ok(graph.edges.length>0);
  for(let z=.2;z<20;z+=.37)for(const x of[-3.8,-1.2,0,1.2,3.29,3.32,3.4,3.6,3.9]){
   const expected=h.contacts.sampleAt(x,z,h.base(x,z),'at_grade'),actual=sampleRaceSegmentY(road,z/20,x);
   assert.ok(Math.abs(expected-actual)<.001,`${x},${z}: ${expected} vs ${actual}`);
  }
 }finally{h.contacts.dispose();}
});
test('private reviewed source binding cannot be forged with plain road tags or a mismatched compiled model',()=>{
 const h=setup();try{
  assert.equal(reviewedRoadEdgeRecipe({...h.road,surfaceSurveyEvidence:undefined,tags:{edgeBandRecipe:recipe}}),undefined);
  assert.throws(()=>reviewedRoadEdgeRecipe({...h.road,sourceFeatureId:'another'}),/unreviewed/);
  assert.throws(()=>reviewedRoadEdgeRecipe({...h.road,transportSurfaceModel:{...h.road.transportSurfaceModel,surveyedSurface:{...evidence,edgeBandRecipe:{...recipe}}}}),/unreviewed/);
  assert.throws(()=>h.contacts.crossSectionOffsets(0,0,1,0,31),/cross_section/);
 }finally{h.contacts.dispose();}
});
test('Nordschleife bend dressing is bounded original authoring and preserves the pinned source',()=>{
 const source=JSON.parse(fs.readFileSync(new URL('../app/assets/racing/nordschleife/source.json',import.meta.url))),before=JSON.stringify(source),descriptor=RACING_VENUE_SOURCES.find(d=>d.id==='nurburgring-nordschleife'),layout=compileMappedVenueLayout(source),recipes=authorVenueEdgeRecipes(layout,descriptor);
 assert.ok(recipes.size>25);let count=0;
 for(const [id,r]of recipes){assert.equal(r.sourceFeatureId,`osm:way:${id}`);assert.equal(r.sourceSha256,descriptor.sourceSha256);assert.equal(layout.ways.get(id).tags.bridge,undefined);assert.ok(r.bands.every(b=>b.heightMeters===.045));count+=r.bands.length;}
 assert.ok(count>50&&count<500);assert.equal(JSON.stringify(source),before);
 assert.equal(authorVenueEdgeRecipes(layout,{...descriptor,edgeBandAuthoring:undefined}).size,0);
 assert.throws(()=>authorVenueEdgeRecipes(layout,{...descriptor,edgeBandAuthoring:'provider-tag'}),/authoring/);
});

test('moving native terrain creases use common lateral stations with a measured fit bound',async()=>{
 const {compilePublishedLateralProfiles}=await import('../app/js/racing/published-lateral-profile.js'),sections=Array.from({length:7},(_,row)=>{
  const t=row/6,points=Array.from({length:81},(_,i)=>{const offsetMeters=-4+i/10;return {offsetMeters,y:10+t*.05+offsetMeters*.02+Math.max(0,offsetMeters+.8-t*.2)*.025-Math.max(0,offsetMeters-1.6-t*.1)*.02};});
  return {fixed:[-4,-1.2,0,1.2,4],edgeKnots:[3.3,3.65],points};
 }),compiled=compilePublishedLateralProfiles(sections,1);
 assert.ok(compiled.profiles.every(p=>p.length===compiled.profiles[0].length));
 assert.ok(compiled.profiles[0].length>8&&compiled.profiles[0].length<=32);
 assert.ok(compiled.maximumErrorMeters<=.003);
 assert.throws(()=>compilePublishedLateralProfiles(sections,1,{maximumPoints:7}),/capacity/);
 const raw={sourceId:'moving-crease',sourceFeatureId:'moving-crease',a:{x:0,y:10,z:0},b:{x:0,y:10.05,z:30},widthMeters:8,structure:'surface',direction:'forward',driveable:true,supported:true,surfaceModel:'banked-road-v1',heightSampleSpanMeters:1.2,
  heightSamples:compiled.profiles.map((lateralSamples,i)=>{const at=offset=>{let k=1;while(k<lateralSamples.length-1&&offset>lateralSamples[k].offsetMeters)k++;const a=lateralSamples[k-1],b=lateralSamples[k];return a.y+(b.y-a.y)*(offset-a.offsetMeters)/(b.offsetMeters-a.offsetMeters);};return {t:i/6,y:at(0),leftY:at(-1.2),rightY:at(1.2),lateralSamples};})};
 raw.a.y=raw.heightSamples[0].y;raw.b.y=raw.heightSamples.at(-1).y;
 const {canonicalRaceDistrict}=await import('../app/js/racing/district-facts.js'),{prepareRaceDistrictStorage,readRaceDistrictFacts}=await import('../app/js/racing/district-storage.js'),facts={type:'RaceDistrictFacts',version:1,locationId:'controlled',locationLabel:'Controlled',anchor:{lat:50,lon:7},metersPerUnit:1,roads:[raw]};
 const canonical=canonicalRaceDistrict(facts),stored=await prepareRaceDistrictStorage(canonical);assert.deepEqual(await readRaceDistrictFacts(stored.fields,async i=>stored.chunks[i].record),canonical);
 const {createRequire}=await import('node:module'),engines=[await import('../services/racing/generated/engine.mjs'),createRequire(import.meta.url)('../functions/generated/racing-engine.cjs')];
 for(const engine of engines)assert.deepEqual(engine.canonicalRaceDistrict(facts),canonical);
 const oversized=structuredClone(raw);for(const s of oversized.heightSamples)while(s.lateralSamples.length<33)s.lateralSamples.push({...s.lateralSamples.at(-1)});
 assert.throws(()=>buildRaceRoadGraph([oversized],{metersPerUnit:1}),/heights/);
});
