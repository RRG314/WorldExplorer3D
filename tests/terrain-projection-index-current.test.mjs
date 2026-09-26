import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeatureProjectionIndex} from '../app/js/terrain/feature-projection-index.js';
import {projectPointToFeature} from '../app/js/structure-semantics.js?v=63';

test('indexed projections exactly preserve brute-force source segment and closest point',()=>{
  const feature={pts:Array.from({length:2049},(_,i)=>({x:i*.8,z:Math.sin(i*.17)*18}))};
  const index=createFeatureProjectionIndex();let examined=0;
  for(let i=0;i<300;i++) {
    const x=(i*37.719)%1700-20,z=Math.cos(i*.97)*40,stats={};
    assert.deepEqual(index.project(feature,x,z,stats),projectPointToFeature(feature,x,z));
    examined+=stats.segments;
  }
  assert.ok(examined<300*2048*.1,`examined ${examined} segments instead of ${300*2048}`);
  index.dispose();
});
test('projection ties, zero-length segments and replacement geometry preserve source semantics',()=>{
  const f={pts:[{x:0,z:0},{x:0,z:0},{x:5,z:0},{x:5,z:5}]},index=createFeatureProjectionIndex();
  assert.deepEqual(index.project(f,5,0),projectPointToFeature(f,5,0));
  f.pts=[{x:0,z:10},{x:5,z:10}];
  assert.deepEqual(index.project(f,2,0),projectPointToFeature(f,2,0));
  index.dispose();
  f.pts[0].z=20;
  assert.deepEqual(index.project(f,2,0),projectPointToFeature(f,2,0));
});

const {createDriveableRoadConflictIndex}=await import('../app/js/world/bridge-safety.js');
test('bent-road broad phase indexes its corridors without filling the empty bounding box',()=>{
  const road={pts:[{x:0,z:0},{x:1000,z:0},{x:1000,z:1000}],width:4};
  const index=createDriveableRoadConflictIndex([road],{cellSize:50,paddingForRoad:()=>10});
  assert.deepEqual(index.candidates(500,500),[]);
  for(const [x,z] of [[500,0],[500,9],[1000,500],[1009,500],[1000,0]])assert.deepEqual(index.candidates(x,z),[road]);
  assert.ok(index.snapshot().cells<100);
  assert.equal(index.candidates(1000,0).length,1,'overlapping segment buckets must deduplicate the road');
});
