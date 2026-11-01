import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {decodeNativeRasterWindow,sampleNativeRaster} from '../scripts/lib/bare-earth-raster.mjs';
import {compileGroundArtifact} from '../app/js/terrain/ground-artifact.js';
import {compileMappedVenueLayout} from '../app/js/racing/venue-layout.js';
import {geographicToWebMercatorMeters} from '../app/js/terrain/source-contract.js';
import {sampleDistrictGroundElevationMeters as sample} from '../app/js/world/compiler/district-ground-model.js';
import {RACING_VENUE_SOURCES,loadRacingVenueSource,prepareVenueSourceMerge,createRacingVenueGroundPlan} from '../app/js/racing/venue-source-packs.js';
import {roadSourceSurvey} from '../app/js/world/road-source-survey.js';
import {buildVenueRaceCourses} from '../app/js/racing/venue-courses.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('native window decoding retains the original pixel-centre affine, endian values and missing-source boundary',()=>{
 const m={schemaVersion:1,encoding:'float32-native-window-v1',byteOrder:'little-endian',nativeValuesUnchanged:true,keys:{ProjectedCSTypeGeoKey:26917,GTRasterTypeGeoKey:1},sourceWindow:[2,3,5,5],sourceOrigin:[489994.0000368088,3230005.999995777,0],origin:[489996.0000368088,3230002.999995777],resolution:[1,-1],width:3,height:2,nodata:-999999,bytes:24},bytes=Buffer.alloc(24);
 [10,11,12,20,21,22].forEach((v,i)=>bytes.writeFloatLE(v,i*4));
 const options={horizontalEpsg:26917,sourceDimensions:[10012,10012]},r=decodeNativeRasterWindow(m,bytes,options),x=m.origin[0],z=m.origin[1];
 assert.equal(sampleNativeRaster(r,x+1,z-1),15.5);assert.equal(sampleNativeRaster(r,x+.5,z-.5),10);
 for(const change of [{origin:[x+.5,z]},{byteOrder:'big-endian'},{sourceOrigin:[x]},{sourceWindow:[2,3,50000,5]},{width:4},{nativeValuesUnchanged:false}])assert.throws(()=>decodeNativeRasterWindow({...m,...change},bytes,options),/native_window_invalid/);
 const missing=Buffer.from(bytes);missing.writeFloatLE(m.nodata,0);const hole=decodeNativeRasterWindow(m,missing,options);
 assert.throws(()=>sampleNativeRaster(hole,x+1,z-1),/missing_source/);assert.throws(()=>sampleNativeRaster(r,x-.1,z-1),/outside_source/);
});
test('the actual compact Daytona ground covers the whole exact oval and retains varying measured banks through the shared compiler',async()=>{
 const text=read('app/assets/ground/daytona/ground-artifact.json'),artifact=JSON.parse(text),manifest=JSON.parse(read('app/assets/ground/daytona/ground-manifest.json')),descriptor=RACING_VENUE_SOURCES.find(s=>s.id==='daytona-tri-oval'),source=await loadRacingVenueSource(descriptor,{fetchImpl:async url=>({ok:true,text:async()=>read(url.slice(1))})}),layout=compileMappedVenueLayout(source),compiled=compileGroundArtifact({manifest,artifact});
 assert.equal(crypto.createHash('sha256').update(text).digest('hex'),descriptor.groundContentSha256);assert.equal(manifest.contentSha256,descriptor.groundContentSha256);assert.equal(compiled.status,'accepted');assert.equal(artifact.grid.sampleCount,689533);
 assert.equal(manifest.sourceEvidence.sourceVerticalAccuracyMeters,null);assert.equal(manifest.sourceEvidence.normalizationUncertaintyIncludesSourceAccuracy,false);assert.equal(manifest.sourceEvidence.normalization.accuracyMeters,5.125);assert.ok(manifest.sourceEvidence.quantization.maximumErrorMeters<=.0050001);
 const failure=geographicToWebMercatorMeters(29.19188026901,-81.0660516259155);
 assert.ok(Number.isFinite(sample(compiled.model,failure.eastingMeters,failure.northingMeters)),'the actual first native refinement failure must be inside the delivered ground');
 for(const p of createRacingVenueGroundPlan(descriptor,source).coverageProbes){const q=geographicToWebMercatorMeters(p.latitude,p.longitude);assert.ok(Number.isFinite(sample(compiled.model,q.eastingMeters,q.northingMeters)),'ground preflight must cover the same road-width plus 40m refinement, including cap extents');}
 let stations=0,high=0,low=0,maximumGrade=0;
 for(const id of layout.wayIds){const way=layout.ways.get(id);for(let i=1;i<way.geometry.length;i++){
  const ga=way.geometry[i-1],gb=way.geometry[i],a=geographicToWebMercatorMeters(ga.lat,ga.lon),b=geographicToWebMercatorMeters(gb.lat,gb.lon),dx=b.eastingMeters-a.eastingMeters,dz=b.northingMeters-a.northingMeters,length=Math.hypot(dx,dz),nx=dz/length,nz=-dx/length,scale=1/Math.cos((ga.lat+gb.lat)*Math.PI/360),steps=Math.ceil(length/scale/2);let previous;
  for(let step=0;step<=steps;step++){
   const t=step/steps,x=a.eastingMeters+dx*t,z=a.northingMeters+dz*t,heights=[-6,0,6].map(o=>sample(compiled.model,x+nx*o*scale,z+nz*o*scale));assert.ok(heights.every(Number.isFinite),'all contributing terrain must be present, including both usable edges');
   const cross=Math.abs(heights[2]-heights[0])/12;assert.ok(cross<.7);if(cross>.5)high++;if(cross<.1)low++;
   if(previous)for(let j=0;j<3;j++)maximumGrade=Math.max(maximumGrade,Math.abs(heights[j]-previous[j])/(length/scale/steps));previous=heights;stations++;
  }
 }}
 assert.equal(stations,2196);assert.ok(high>200&&low>200,'real banks and flatter sections cannot be replaced by a constant tilt');assert.ok(maximumGrade<.22);
 const neighbor={type:'way',id:999,nodes:[1,2],tags:{building:'yes'}},merged=prepareVenueSourceMerge({elements:[neighbor]},source,descriptor,{status:'accepted',artifactIds:[descriptor.groundArtifactId],contentSha256s:[descriptor.groundContentSha256]});
 assert.equal(merged.data.elements.find(e=>e.id===999),neighbor);assert.equal(merged.metadata.sourceDate,source.source.observedAt);assert.equal(merged.metadata.raceAdmission,'practice');assert.equal(merged.metadata.layoutWayIds.length,5);
 assert.ok(merged.metadata.sourceFeatureIds.every(id=>{const w=merged.data.elements.find(e=>e.tags?._sourceFeatureId===id);return roadSourceSurvey(w)?.venueSource===merged.metadata.venueSource;}));
 assert.throws(()=>buildVenueRaceCourses({},{...merged.metadata,raceAdmission:'pending-timing-line'}),/timing_line_pending/);
});
