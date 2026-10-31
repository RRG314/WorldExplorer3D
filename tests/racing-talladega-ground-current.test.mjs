import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {compileGroundArtifact} from '../app/js/terrain/ground-artifact.js';
import {sampleDistrictGroundElevationMeters} from '../app/js/world/compiler/district-ground-model.js';
import {geographicToWebMercatorMeters} from '../app/js/terrain/source-contract.js';
import {compileMappedVenueLayout,compileMappedVenuePitLayout} from '../app/js/racing/venue-layout.js';
import {nad83UtmNavd88HorizontalEpsg,decodeNativeRasterWindow} from '../scripts/lib/bare-earth-raster.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),hash=s=>createHash('sha256').update(s).digest('hex');
test('USGS zone selection accepts declared NAD83 UTM/NAVD88 only and still rejects a mismatched TIFF key',()=>{
 assert.equal(nad83UtmNavd88HorizontalEpsg('EPSG:26916+5703'),26916);assert.equal(nad83UtmNavd88HorizontalEpsg('EPSG:26917+5703'),26917);
 for(const crs of ['EPSG:4326','EPSG:26900+5703','EPSG:26924+5703','EPSG:26916+3855',null,undefined])assert.equal(nad83UtmNavd88HorizontalEpsg(crs),null);
 const m={schemaVersion:1,encoding:'float32-native-window-v1',byteOrder:'little-endian',nativeValuesUnchanged:true,keys:{ProjectedCSTypeGeoKey:26916,GTRasterTypeGeoKey:1},sourceWindow:[0,0,2,2],sourceOrigin:[0,2,0],origin:[0,2],resolution:[1,-1],width:2,height:2,nodata:-999999,bytes:16},bytes=Buffer.alloc(16);
 assert.equal(decodeNativeRasterWindow(m,bytes,{horizontalEpsg:26916,sourceDimensions:[2,2]}).width,2);
 assert.throws(()=>decodeNativeRasterWindow(m,bytes,{horizontalEpsg:26917,sourceDimensions:[2,2]}),/native_window_invalid/);
});
test('the pinned Talladega source and full pit have complete finite normalized ground without a racing admission claim',()=>{
 const bytes=read('app/assets/ground/talladega/ground-artifact.json'),artifact=JSON.parse(bytes),manifest=JSON.parse(read('app/assets/ground/talladega/ground-manifest.json')),
  config=read('config/racing-venues/talladega-ground.json'),source=JSON.parse(read('app/assets/racing/talladega/source.json')),layout=compileMappedVenueLayout(source),pit=compileMappedVenuePitLayout(source,{pitWayIds:[116792873]},layout),compiled=compileGroundArtifact({artifact,manifest});
 assert.equal(hash(bytes),'d85b5d701a1d401dcaf5831fd7ef3bd90cbfdc37a88eb0a714ad923e70be8175');assert.equal(hash(bytes),manifest.contentSha256);
 assert.equal(hash(config),manifest.sourceEvidence.sourceConfigurationSha256);assert.equal(compiled.status,'accepted');assert.equal(artifact.grid.sampleCount,821100);
 assert.equal(manifest.sourceEvidence.sourceCrs,'EPSG:26916+5703');assert.equal(manifest.sourceEvidence.nativeWindow.keys.ProjectedCSTypeGeoKey,26916);
 assert.equal(manifest.sourceEvidence.nativeWindow.missing,0);assert.equal(manifest.sourceEvidence.normalizationUncertaintyIncludesSourceAccuracy,false);
 assert.equal(manifest.sourceEvidence.sourceVerticalAccuracyMeters,null);assert.equal(manifest.sourceEvidence.normalization.accuracyMeters,5.125);
 assert.ok(manifest.sourceEvidence.quantization.maximumErrorMeters<=.00500001);
 let samples=0,high=0,flat=0;
 for(const points of [layout.points,pit.points])for(let i=1;i<points.length;i++){
  const a=geographicToWebMercatorMeters(points[i-1].lat,points[i-1].lon),b=geographicToWebMercatorMeters(points[i].lat,points[i].lon),dx=b.eastingMeters-a.eastingMeters,dz=b.northingMeters-a.northingMeters,length=Math.hypot(dx,dz),scale=1/Math.cos((points[i].lat+points[i-1].lat)*Math.PI/360),steps=Math.ceil(length/scale/2),nx=dz/length,nz=-dx/length;
  for(let k=0;k<=steps;k++){const t=k/steps,x=a.eastingMeters+dx*t,z=a.northingMeters+dz*t,heights=[-6,0,6].map(offset=>sampleDistrictGroundElevationMeters(compiled.model,x+nx*offset*scale,z+nz*offset*scale));
   assert.ok(heights.every(Number.isFinite),'every centre/edge contributor on main and pit must exist');samples++;
   const cross=Math.abs(heights[2]-heights[0])/12;if(cross>.45)high++;if(cross<.1)flat++;
  }
 }
 assert.equal(samples,2654);assert.ok(high>800&&flat>900,'retained native data includes banks and flatter stretches; no constant tilt');
 // Ground coverage is not a road grade/contact/rules acceptance. In particular,
 // the raw lateral-edge probe includes a 23.16% local along-route gradient;
 // the existing 22% road gate is deliberately unchanged for surface review.
});
