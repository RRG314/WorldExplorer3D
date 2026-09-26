import test from 'node:test';
import assert from 'node:assert/strict';
import {captureStreetSurfaceGeometry} from '../app/js/world/street-surface-capture.js';
const attribute=values=>({count:values.length/3,getX:i=>values[i*3],getY:i=>values[i*3+1],getZ:i=>values[i*3+2]});
test('capture includes pavement and road world triangles and independent height sources',()=>{
  const mesh={geometry:{attributes:{position:attribute([0,2,0,1,2,0,0,2,1])}},matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,100,4,200,1]},userData:{kind:'sidewalk'}};
  const ctx={roadMeshes:[mesh],streetPavement:{meshes:[mesh],sampleAt:()=>6},roadContactIndex:{sampleAt:()=>5},elevationWorldYAtWorldXZ:()=>3};
  const capture=captureStreetSurfaceGeometry(ctx,{x:100,z:200},()=>4,1);
  assert.deepEqual(capture.surfaces.map(s=>s.family),['road','pavement']);
  assert.deepEqual(capture.surfaces[1].triangles[0][0],{x:100,y:6,z:200,terrain:4});
  assert.deepEqual(capture.samples[0],{x:99,z:199,terrain:4,rawTerrain:3,road:5,pavement:6});
});
test('capture retains triangles crossing the window with all vertices outside it',()=>{
  const mesh={geometry:{attributes:{position:attribute([-10,0,-10,10,0,-10,0,0,10])}},userData:{}};
  assert.equal(captureStreetSurfaceGeometry({roadMeshes:[mesh]},{x:0,z:0},()=>0,1).surfaces[0].triangles.length,1);
});

test('capture replay preserves the source-station and width array types',async()=>{
 const {serializeStreetSurfaceCapture,parseStreetSurfaceCapture}=await import('../app/js/world/street-surface-capture.js');
 const {sampleFeatureSurfaceY}=await import('../app/js/structure-semantics.js');
 const road={pts:[{x:0,z:0},{x:20,z:0},{x:20,z:10}],transportSurfaceModel:{distances:new Float64Array([0,10,20,30]),pathDistances:new Float32Array([0,20,30]),centerHeights:new Float32Array([0,1,2,3])},resolvedCrossSection:{segmentWidthsMeters:new Float32Array([5,3]),segmentStartDistancesMeters:new Float64Array([0,20])}};
 const replay=parseStreetSurfaceCapture(serializeStreetSurfaceCapture(road));
 assert.ok(replay.transportSurfaceModel.pathDistances instanceof Float32Array);
 assert.ok(replay.resolvedCrossSection.segmentWidthsMeters instanceof Float32Array);
 assert.equal(sampleFeatureSurfaceY(replay,20,5),2.5);
 replay.transportSurfaceModel.pathDistances=Float64Array.from(replay.transportSurfaceModel.pathDistances);
 assert.equal(sampleFeatureSurfaceY(replay,20,5),2.5,'double-precision source stations must not use resampled station indices');
});
