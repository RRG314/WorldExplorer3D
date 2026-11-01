import test from 'node:test';
import assert from 'node:assert/strict';
import {eaRasterMetadata,sampleEaRaster,normalizeEaGrid,encodeEaGround} from '../scripts/lib/ea-ground-grid.mjs';
import {compileDistrictGroundModel,sampleDistrictGroundMeters} from '../app/js/world/compiler/district-ground-model.js';
const raster={origin:[100,204],resolution:[2,-2],width:2,height:2,nodata:-9999,data:new Float32Array([10,12,20,22])};
test('EA north-up affine retains the signed Y coefficient instead of flipping the source',()=>{
 const image={getGeoKeys:()=>({ProjectedCSTypeGeoKey:27700,GTRasterTypeGeoKey:1}),
  fileDirectory:{getValue:()=>[2,0,0,100,0,-2,0,204,0,0,0,0,0,0,0,1]},
  getResolution:()=>[2,2,0],getWidth:()=>2,getHeight:()=>2,getGDALNoData:()=>-9999};
 assert.deepEqual(eaRasterMetadata(image),{origin:[100,204],resolution:[2,-2],width:2,height:2,nodata:-9999});
 assert.equal(sampleEaRaster(raster,102,202),16);
 assert.equal(sampleEaRaster(raster,101,203),10);
 assert.equal(sampleEaRaster(raster,103,201),22);
});
const model=encoding=>compileDistrictGroundModel({districtId:'venue',sourceClassification:'accepted-ground',verticalDatum:'EGM2008',
 grid:{spacingMeters:4,minColumn:0,maxColumn:1,minRow:0,maxRow:1},encodedSamples:{...encoding,shared:{available:true,confidence:.9,provenance:'test-survey',normalizationUncertaintyMeters:.15}}});
test('centimetre terrain delivery preserves interpolation, datum and byte order in the existing ground owner',()=>{
 const heights=[-12.345,-12.335,300.012,500.001],encoding=encodeEaGround(heights),ground=model(encoding);
 assert.equal(ground.status,'accepted');
 assert.equal(ground.encodedSamples.rawElevationMeters,ground.encodedSamples.groundElevationMeters,'one immutable decoded view for a bare-earth source');
 assert.ok(encoding.maximumErrorMeters<=.00500001);
 const middle=sampleDistrictGroundMeters(ground,2,2);
 assert.equal(middle.status,'available');
 assert.ok(Math.abs(middle.groundElevationMeters-heights.reduce((a,b)=>a+b)/4)<=.00500001);
 assert.ok(Math.abs(sampleDistrictGroundMeters(ground,4,4).groundElevationMeters-500.001)<=.00500001);
 assert.throws(()=>encodeEaGround([0,700]),/quantization_range/);
 assert.throws(()=>encodeEaGround([0,NaN]),/nonfinite/);
});
test('the ground compiler rejects damaged quantized payloads and unbounded precision declarations',()=>{
 const encoding=encodeEaGround([1,2,3,4]);
 for(const changed of [{byteOrder:'big-endian'},{sampleCount:3},{scaleMeters:0},{scaleMeters:.5},{offsetMeters:NaN},{groundElevationMetersBase64:'AA=='}]){
  const result=model({...encoding,...changed});assert.equal(result.status,'rejected');assert.equal(result.reason,'invalid-sample-encoding');
 }
});
test('existing Float64 ground deliveries retain separate raw and corrected products',()=>{
 const bytes=values=>{const b=Buffer.alloc(32);values.forEach((v,i)=>b.writeDoubleLE(v,i*8));return b.toString('base64');};
 const old=model({type:'row-major-f64-shared-metadata-v1',byteOrder:'little-endian',sampleCount:4,
  rawElevationMetersBase64:bytes([31,32,33,34]),groundElevationMetersBase64:bytes([1,2,3,4])});
 assert.equal(old.status,'accepted');
 const sample=sampleDistrictGroundMeters(old,2,2);assert.equal(sample.groundElevationMeters,2.5);assert.equal(sample.rawElevationMeters,32.5);
});
test('EA sampling refuses gaps and missing contributing pixels; exact pixel centres do not depend on unused neighbours',()=>{
 assert.throws(()=>sampleEaRaster(raster,99,202),/outside_source/);
 const missing={...raster,data:new Float32Array([10,12,20,-9999])};
 assert.throws(()=>sampleEaRaster(missing,102,202),/missing_source/);
 assert.equal(sampleEaRaster(missing,101,203),10);
});
test('venue grid subtracts the ODN offset at each point and rejects truncated or nonfinite coordinates',()=>{
 const bytes=Buffer.alloc(48);[102,202,.6,101,203,.8].forEach((v,i)=>bytes.writeDoubleLE(v,i*8));
 const result=normalizeEaGrid(raster,bytes,{sampleCount:2});
 assert.deepEqual(Array.from(result.heights),[15.4,9.2]);
 assert.throws(()=>normalizeEaGrid(raster,bytes.subarray(0,47),{sampleCount:2}),/coordinates_invalid/);
 bytes.writeDoubleLE(NaN,16);
 assert.throws(()=>normalizeEaGrid(raster,bytes,{sampleCount:2}),/elevation_invalid/);
});
