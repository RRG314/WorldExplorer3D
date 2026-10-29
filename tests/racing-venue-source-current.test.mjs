import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {compileMappedVenueLayout} from '../app/js/racing/venue-layout.js';
import {prepareVenueSourceMerge,RACING_VENUE_SOURCES,loadRacingVenueSource} from '../app/js/racing/venue-source-packs.js';
import {roadSourceSurvey} from '../app/js/world/road-source-survey.js';
import {compileGroundArtifact} from '../app/js/terrain/ground-artifact.js';
import {geographicToWebMercatorMeters} from '../app/js/terrain/source-contract.js';
import {sampleDistrictGroundElevationMeters} from '../app/js/world/compiler/district-ground-model.js';
import {buildVenueRaceCourses} from '../app/js/racing/venue-courses.js';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
import {normalizeRaceRouteReference} from '../app/js/racing/course-library.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const text=read('app/assets/racing/silverstone/source.json'),source=JSON.parse(text),descriptor=RACING_VENUE_SOURCES[0];
const ground={status:'accepted',artifactIds:[descriptor.groundArtifactId],contentSha256s:[descriptor.groundContentSha256]};
test('the retained Silverstone source is the connected full GP loop with original geographic identities and an honest length reconciliation',()=>{
 assert.equal(crypto.createHash('sha256').update(text).digest('hex'),descriptor.sourceSha256);
 const layout=compileMappedVenueLayout(source);
 assert.equal(layout.wayIds.length,27);assert.equal(layout.points[0].nodeId,layout.points.at(-1).nodeId);
 assert.ok(Math.abs(layout.lengthMeters-5880.6229112)<.001);assert.ok(layout.lengthDifferenceMeters<0);
 assert.ok(source.ways.every(w=>!Object.hasOwn(w,'uid')&&!Object.hasOwn(w,'user')));
 const missing=structuredClone(source);missing.layout.wayIds.splice(5,1);
 assert.throws(()=>compileMappedVenueLayout(missing),/disconnected/);
 const wrong=structuredClone(source);wrong.layout.referenceLengthMeters=4023.36;
 assert.throws(()=>compileMappedVenueLayout(wrong),/length_mismatch/);
});
test('venue source adoption preserves unrelated map identity and uses private reviewed metadata without altering OSM width tags',()=>{
 const first=source.ways[0],a=first.geometry[0],b=first.geometry[1];
 const items=[{type:'node',id:-1,...a},{type:'node',id:-2,...b},
  {type:'way',id:-10,nodes:[-1,-2],tags:{highway:'raceway',_sourceCompleteness:'generalized'}},
  {type:'way',id:-11,nodes:[-1,-2],tags:{highway:'residential',_sourceCompleteness:'generalized'}},
  {type:'way',id:777,nodes:[-1,-2],tags:{building:'yes'}},
  {type:'way',id:778,nodes:[-1,-2],tags:{natural:'water'}}];
 const before=JSON.stringify(items),prepared=prepareVenueSourceMerge({elements:items},source,descriptor,ground);
 assert.equal(JSON.stringify(items),before);
 for(const id of [-11,777,778])assert.equal(prepared.data.elements.find(e=>e.id===id),items.find(e=>e.id===id));
 assert.equal(prepared.data.elements.some(e=>e.id===-10),false);
 const hamilton=prepared.data.elements.find(e=>e.type==='way'&&e.id===55224167);
 assert.equal(hamilton.tags.width,undefined);assert.equal(roadSourceSurvey(hamilton).usableWidthMeters,12);
 assert.equal(roadSourceSurvey(JSON.parse(JSON.stringify(hamilton))),null,'network/cache JSON cannot confer surveyed status');
 assert.equal(prepared.metadata.status,'source-prepared');
});
test('wrong ground, obsolete source geometry and damaged downloads cannot partially replace a world',async()=>{
 assert.throws(()=>prepareVenueSourceMerge({},source,descriptor,{...ground,contentSha256s:['f'.repeat(64)]}),/ground_not_ready/);
 const way=source.ways[0],data={elements:[{type:'way',id:way.id,version:way.version+1,tags:{highway:'raceway'}}]};
 assert.throws(()=>prepareVenueSourceMerge(data,source,descriptor,ground),/revision_obsolete/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(loadRacingVenueSource(descriptor,{signal:controller.signal,fetchImpl:async()=>({ok:true,text:async()=>text})}),error=>error.name==='AbortError');
 await assert.rejects(loadRacingVenueSource(descriptor,{fetchImpl:async()=>({ok:true,text:async()=>text+' '})}),/integrity_failed/);
});
test('the actual compact EA artifact is hash-bound, admitted by the existing ground compiler and covers the full GP road with lateral clearance',()=>{
 const bytes=read('app/assets/ground/silverstone/ground-artifact.json'),artifact=JSON.parse(bytes),manifest=JSON.parse(read('app/assets/ground/silverstone/ground-manifest.json'));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.contentSha256);
 assert.equal(manifest.contentSha256,descriptor.groundContentSha256);
 const compiled=compileGroundArtifact({manifest,artifact});assert.equal(compiled.status,'accepted');
 assert.ok(manifest.sourceEvidence.quantization.maximumErrorMeters<=.00500001);
 const layout=compileMappedVenueLayout(source);
 for(const point of layout.points){
  const p=geographicToWebMercatorMeters(point.lat,point.lon);
  for(const dx of [-12,0,12])for(const dz of [-12,0,12])assert.ok(Number.isFinite(sampleDistrictGroundElevationMeters(compiled.model,p.eastingMeters+dx,p.northingMeters+dz)));
 }
});
test('venue assembly retains all 506 mapped GP spans, including the sub-metre Chapel span, and rejects missing or shortened layouts',()=>{
 // Topology-only projection; source elevation has its separate actual-data
 // compiler check. This does not stand in for rendered-world qualification.
 const layout=compileMappedVenueLayout(source),frame=earthCoordinateFrame(descriptor.anchor,100000),roads=[];
 for(const id of layout.wayIds){
  const way=layout.ways.get(id),fid=`osm:way:${id}`;
  for(let index=0;index<way.nodes.length-1;index++)roads.push({sourceId:fid+':'+index+':0.000000:1.000000',sourceFeatureId:fid,
   a:{...frame.toWorld(way.geometry[index].lat,way.geometry[index].lon),y:0,connectionLayer:'source-node:'+way.nodes[index]},
   b:{...frame.toWorld(way.geometry[index+1].lat,way.geometry[index+1].lon),y:0,connectionLayer:'source-node:'+way.nodes[index+1]},
   widthMeters:12,direction:'forward',supported:true,driveable:true,structure:'surface'});
 }
 const district={locationId:'silverstone',locationLabel:'Silverstone',anchor:descriptor.anchor,metersPerUnit:1.11,roads};
 const venue={id:descriptor.id,name:'Silverstone',status:'source-prepared',sourceFeatureIds:layout.wayIds.map(id=>`osm:way:${id}`),mappedLengthMeters:layout.lengthMeters};
 const assembled=buildVenueRaceCourses(district,venue),course=assembled.events[0];
 assert.equal(course.sourcePath.length,506);assert.ok(course.lengthMeters>5800&&course.lengthMeters<5900);
 assert.ok(course.sourcePath.includes('osm:way:169733766:22:0.000000:1.000000:forward'));
 assert.equal(normalizeRaceRouteReference({version:1,districtFingerprint:'race-district:'+'a'.repeat(64),path:course.sourcePath,discipline:'circuit',laps:1,participants:4}).path.length,506);
 assert.throws(()=>buildVenueRaceCourses({...district,roads:roads.filter(r=>r.sourceFeatureId!=='osm:way:169733766')},venue),/incomplete/);
 assert.throws(()=>buildVenueRaceCourses({...district,roads:roads.filter(r=>r.sourceId!=='osm:way:169733766:22:0.000000:1.000000')},venue),/disconnected/);
});
