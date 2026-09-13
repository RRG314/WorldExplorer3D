import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCompiledRoadSurfaceSampler,
  createRoadTerrainConformanceAudit,
  finalizeRoadTerrainConformanceAudit,
  recordAtGradeRoadTerrainConformance
} from '../app/js/terrain/rebuild.js';

function atGradeFeature() {
  return {
    id: 'road-1',
    name: 'Terrain Test Road',
    pts: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
    structureSemantics: { terrainMode: 'at_grade' },
    transportSurfaceModel: {
      distances: new Float32Array([0, 10]),
      pathDistances: new Float32Array([0, 10]),
      centerHeights: new Float32Array([2, 2]),
      leftHeights: new Float32Array([2, 2]),
      rightHeights: new Float32Array([2, 2])
    }
  };
}

test('at-grade road sampler cannot publish below rendered outer terrain', () => {
  const diagnostics = {};
  const sample = createCompiledRoadSurfaceSampler(atGradeFeature(), () => 5, diagnostics);
  assert.equal(sample(5, 0), 5);
  assert.equal(diagnostics.renderedTerrainClamps, 1);
});

test('structure-owned road profiles are not clamped to terrain', () => {
  for (const terrainMode of ['elevated', 'subgrade']) {
    const feature = atGradeFeature();
    feature.structureSemantics.terrainMode = terrainMode;
    const sample = createCompiledRoadSurfaceSampler(feature, () => 5, {});
    assert.equal(sample(5, 0), 2);
  }
});

test('per-road conformance audit covers at-grade batches and excludes tunnels', () => {
  const audit = createRoadTerrainConformanceAudit();
  const feature = atGradeFeature();
  recordAtGradeRoadTerrainConformance(
    audit,
    feature,
    [0, 5.2, 0, 10, 4.5, 0],
    () => 5,
    (x) => ({ lat: 39 + x / 1000, lon: -76 })
  );
  recordAtGradeRoadTerrainConformance(
    audit,
    { ...feature, structureSemantics: { terrainMode: 'subgrade' } },
    [0, -5, 0],
    () => 5
  );
  const result = finalizeRoadTerrainConformanceAudit(audit);
  assert.equal(result.totalSamples, 2);
  assert.equal(result.issuesFound, 1);
  assert.equal(result.minimumDelta, -0.5);
  assert.equal(result.worstDeltas[0].roadName, 'Terrain Test Road');
});

test('floating at-grade roads fail conformance while nominal bias remains accepted', () => {
  const audit = createRoadTerrainConformanceAudit();
  recordAtGradeRoadTerrainConformance(audit, atGradeFeature(), [0, 5.18, 0, 2, 8.3, 0], () => 5);
  const result = finalizeRoadTerrainConformanceAudit(audit);
  assert.equal(result.issuesFound, 1);
  assert.equal(result.floatingSamples, 1);
  assert.equal(result.buriedSamples, 0);
  assert.equal(result.maximumDelta, 3.3);
  assert.equal(result.worstDeltas[0].kind, 'floating');
});

test('captured Sacramento Street separation is detected, not certified by coverage counts', async () => {
  const {readFile} = await import('node:fs/promises');
  const fixture = JSON.parse(await readFile(new URL('./fixtures/sf-road-ground-separation.json', import.meta.url)));
  const audit = createRoadTerrainConformanceAudit();
  for (const p of fixture.vertices) recordAtGradeRoadTerrainConformance(audit, atGradeFeature(), [p.x,p.y,p.z], () => p.terrain);
  const result = finalizeRoadTerrainConformanceAudit(audit);
  assert.ok(result.floatingSamples > 0);
  assert.ok(result.maximumDelta > 3);
  const {assessStreetQuality} = await import('../app/js/world/street-quality-assessment.js');
  const quality = assessStreetQuality({roadTerrainConformance:result,streetOverview:{status:'complete',totalCells:3232,completedCells:3232,workerActive:false}});
  assert.equal(quality.status, 'fail');
  assert.ok(quality.failures.some(message => message.includes('separate from rendered terrain')));
});

test('at-grade render height consumes signed published grading without recreating floating fill', () => {
  const feature = atGradeFeature();
  for (const ground of [-2,1,2,5]) assert.equal(createCompiledRoadSurfaceSampler(feature, () => ground)(5,0),ground);
});

test('overlapping terrain shoulders are continuous and independent of road order', async () => {
  const {createTerrainHeightSamplingApi} = await import('../app/js/terrain/height-sampling.js');
  const a=atGradeFeature(), b=atGradeFeature();
  a.width=b.width=4;
  b.pts=b.pts.map(p=>({...p,z:8}));
  b.transportSurfaceModel={...b.transportSurfaceModel,centerHeights:new Float32Array([6,6]),leftHeights:new Float32Array([6,6]),rightHeights:new Float32Array([6,6])};
  const forward=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:[a,b]},elevationWorldYAtWorldXZ:()=>0});
  const reverse=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:[b,a]},elevationWorldYAtWorldXZ:()=>0});
  for(let z=3.9;z<=4.1;z+=.005)assert.ok(Math.abs(forward.applyStructureTerrainCuts(5,z,0)-reverse.applyStructureTerrainCuts(5,z,0))<1e-10);
  assert.ok(Math.abs(forward.applyStructureTerrainCuts(5,4.001,0)-forward.applyStructureTerrainCuts(5,3.999,0))<.02);
});

test('terrain grading index includes shoulders across spatial cell boundaries', async () => {
  const {createDriveableRoadConflictIndex}=await import('../app/js/world/bridge-safety.js');
  const road=atGradeFeature();road.width=4;road.pts=road.pts.map(p=>({...p,z:68}));
  const index=createDriveableRoadConflictIndex([road],{cellSize:72,paddingForRoad:r=>r.width/2+3.5});
  assert.ok(index.candidates(5,72.5).includes(road));
  const collisionIndex=createDriveableRoadConflictIndex([road],{cellSize:72});
  assert.equal(collisionIndex.candidates(5,72.5).length,0);
});

test('frontage grading extends to the actual facade and honors absent sidewalks', async () => {
 const {createStreetFrontageGrading}=await import('../app/js/terrain/street-frontage-grading.js');
 const {createTerrainHeightSamplingApi}=await import('../app/js/terrain/height-sampling.js');
 const building={pts:[{x:-5,z:6},{x:15,z:6},{x:15,z:15},{x:-5,z:15}]};
 const frontage=createStreetFrontageGrading([building],1);
 const road=atGradeFeature();road.width=4;road.type='residential';
 const projection={segIndex:0,t:.5,dist:5};
 assert.equal(frontage.outerDistance(road,projection,5,5,2),6);
 const api=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:[road],streetFrontageGrading:frontage},elevationWorldYAtWorldXZ:()=>10});
 assert.ok(Math.abs(api.applyStructureTerrainCuts(5,5,10)-1.92)<.0001,'Sidewalk foundation must follow the road grade all the way to its facade');
 const excluded={...road,tags:{sidewalk:'no'}};
 assert.equal(frontage.outerDistance(excluded,projection,5,5,2),2);
 frontage.dispose();
});

test('road markings follow the rendered road instead of the old transport profile',async()=>{
 const {appendRoadCenterMarkings}=await import('../app/js/terrain/rebuild.js');
 const road={...atGradeFeature(),type:'primary',width:10};
 const vertices=[],indices=[],height=(x,z)=>.3*x+.1*z;
 appendRoadCenterMarkings(road,road.pts,vertices,indices,null,height);
 assert.ok(indices.length>0);
 for(let i=0;i<vertices.length;i+=3)assert.ok(Math.abs(vertices[i+1]-height(vertices[i],vertices[i+2])-.012)<1e-6);
});

test('markings split at road folds and never bridge an unsupported gap',async()=>{
 const {createRoadContactIndex}=await import('../app/js/terrain/road-contact-index.js');
 const positions=new Float32Array([0,0,0, 0,0,4, 2,0,0, 2,0,4, 4,2,0, 4,2,4]);
 const indices=new Uint16Array([0,1,2,2,1,3,2,3,4,4,3,5]);
 const mesh={geometry:{attributes:{position:{array:positions}},getIndex:()=>({array:indices})},userData:{terrainMode:'at_grade'}};
 const index=createRoadContactIndex([mesh]);
 const result=index.projectTriangle([{x:-1,z:1},{x:5,z:1},{x:2,z:3}],.012,'at_grade');
 assert.ok(result.length>9);
 for(let i=0;i<result.length;i+=9){
   const x=(result[i]+result[i+3]+result[i+6])/3,z=(result[i+2]+result[i+5]+result[i+8])/3,y=(result[i+1]+result[i+4]+result[i+7])/3;
   assert.ok(Math.abs(y-index.sampleAt(x,z)-.012)<1e-6);
 }
 assert.equal(index.projectTriangle([{x:6,z:0},{x:7,z:0},{x:6,z:1}]).length,0);
 assert.equal(index.projectTriangle([{x:0,z:0},{x:1,z:0},{x:0,z:1}],.012,'elevated').length,0);
 index.dispose();
});
