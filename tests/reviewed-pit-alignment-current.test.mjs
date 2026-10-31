import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RACING_VENUE_SOURCES,loadRacingVenueSource,prepareVenueSourceMerge} from '../app/js/racing/venue-source-packs.js';
import {roadSourceSurvey} from '../app/js/world/road-source-survey.js';
import {alignReviewedRoadPoints} from '../app/js/world/reviewed-road-alignment.js';
import {publishedRoadSourceTopology} from '../app/js/world/road-source-topology.js';
import {compileTransportSurfaceModel} from '../app/js/world/compiler/transport-surface-model.js';
import {compileGroundArtifact} from '../app/js/terrain/ground-artifact.js';
import {sampleDistrictGroundElevationMeters} from '../app/js/world/compiler/district-ground-model.js';
import {geographicToWebMercatorMeters} from '../app/js/terrain/source-contract.js';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));

test('Silverstone lower pit corridor resolves the actual native wall failure without changing ground, map or surface limits',async()=>{
 const d=RACING_VENUE_SOURCES[0],source=await loadRacingVenueSource(d,{fetchImpl:async url=>({ok:true,text:()=>fs.readFileSync(new URL('..'+url,import.meta.url),'utf8')})}),before=JSON.stringify(source),ground={status:'accepted',artifactIds:[d.groundArtifactId],contentSha256s:[d.groundContentSha256]},prepared=prepareVenueSourceMerge({},source,d,ground),raw=source.ways.find(w=>w.id===227902927),survey=roadSourceSurvey(prepared.data.elements.find(e=>e.type==='way'&&e.id===raw.id));
 const frame=earthCoordinateFrame(d.anchor,100000),unit=1.11,pts=raw.geometry.map(p=>frame.toWorld(p.lat,p.lon)),aligned=alignReviewedRoadPoints(pts,survey,unit),artifact=compileGroundArtifact({manifest:read('app/assets/ground/silverstone/ground-manifest.json'),artifact:read('app/assets/ground/silverstone/ground-artifact.json')}),sample=(x,z)=>{const p=frame.toGeographic(x,z),q=geographicToWebMercatorMeters(p.lat,p.lon);return sampleDistrictGroundElevationMeters(artifact.model,q.eastingMeters,q.northingMeters)/unit;};
 const feature=points=>({sourceFeatureId:survey.sourceFeatureId,pts:points,width:6/unit,metersPerWorldUnit:unit,surfaceSurveyEvidence:survey,structureSemantics:{terrainMode:'at_grade'}});
 assert.throws(()=>compileTransportSurfaceModel(feature(pts),sample),/crossfall_exceeded/);
 const model=compileTransportSurfaceModel(feature(aligned),sample);
 assert.ok(model.maximumReviewedCrossfall<.09);assert.equal(model.surveyedSurface.maximumCrossfall,.15);assert.ok(model.stats.maximumGrade<.08);
 assert.equal(JSON.stringify(source),before);assert.equal(aligned[0],pts[0]);assert.equal(aligned.at(-1),pts.at(-1));
 assert.equal(publishedRoadSourceTopology(raw.nodes.map(id=>({id})),aligned,aligned).length,73,'every source-node identity survives preparation');
 for(let i=0;i<pts.length;i++)assert.ok(Math.hypot(pts[i].x-aligned[i].x,pts[i].z-aligned[i].z)*unit<=3.500001);
 assert.equal(alignReviewedRoadPoints(pts,null,unit),pts,'ordinary roads retain their exact geometry');
 assert.throws(()=>alignReviewedRoadPoints(pts,{...survey,venueSource:undefined},unit),/alignment_invalid/);
 for(const patch of [{sourceVersion:12},{sourceSha256:'0'.repeat(64)},{groundContentSha256:'0'.repeat(64)},{sourceWayId:1},{stations:[{distanceMeters:0,offsetMeters:3},{distanceMeters:900,offsetMeters:0}]}])assert.throws(()=>prepareVenueSourceMerge({},source,{...d,pitUsableAlignment:{...d.pitUsableAlignment,...patch}},ground),/alignment_invalid/);
});
