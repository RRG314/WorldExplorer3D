import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainHeightSamplingApi} from '../app/js/terrain/height-sampling.js';
import {updateFeatureSurfaceProfile} from '../app/js/structure-semantics.js';
const plane=(x,z)=>10+.2*z+.2*x;
function road(){const r={sourceFeatureId:'controlled',pts:[{x:0,z:0},{x:0,z:100}],width:8,metersPerWorldUnit:1,surfaceBias:.18,type:'raceway',structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:{version:1,sourceFeatureId:'controlled',groundArtifactId:'controlled',groundContentSha256:'a'.repeat(64),maximumCrossfall:.7,surfaceModel:'banked-road-v1'}};updateFeatureSurfaceProfile(r,plane);return r;}
test('native terrain vertices supporting the full reviewed pavement retain its plane through a coarse verge cell',()=>{
 const r=road(),grade=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:[r]}}),base=(x,z)=>plane(x,z)-(Math.abs(x)>4?4:0);
 const a=grade.applyStructureTerrainCuts(3,50,base(3,50)),b=grade.applyStructureTerrainCuts(6,50,base(6,50)),edge=a+(b-a)/3;
 assert.ok(Math.abs(edge-plane(4,50))<.00001,`the terrain cell under the pavement edge departs by ${edge-plane(4,50)}`);
 assert.ok(Math.abs(grade.applyStructureTerrainCuts(6,50,base(6,50))-plane(6,50))<.00001,'support extends the compiled plane rather than flattening its bank outside the source width');
 assert.ok(Math.abs(grade.applyStructureTerrainCuts(0,-2,plane(0,-2))-plane(0,-2))<.00001,'endpoint support retains the compiled tangent grade');
 assert.equal(grade.applyStructureTerrainCuts(10,50,base(10,50)),base(10,50),'the existing outer grading extent remains bounded');
});
test('unreviewed and elevated roads retain their existing grading ownership',()=>{
 const r=road();
 // The model is immutable; an ordinary copy deliberately has no accepted survey.
 r.transportSurfaceModel={...r.transportSurfaceModel,reviewedSurfacePhase:undefined};
 const grade=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:[r]}}),y=plane(6,50)-4;assert.ok(grade.applyStructureTerrainCuts(6,50,y)<plane(6,50)-.1);
 const high={...road(),structureSemantics:{terrainMode:'elevated'}};assert.equal(createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:[high]}}).applyStructureTerrainCuts(6,50,y),y);
});
