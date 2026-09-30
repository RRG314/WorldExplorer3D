import test from 'node:test';
import assert from 'node:assert/strict';
import {createProvisionalProfileCompiler} from '../scripts/verification/provisional-profile-experiment.mjs';
import {updateFeatureSurfaceProfile} from '../app/js/structure-semantics.js';
const feature = mode => ({pts:[{x:0,z:0},{x:20,z:3},{x:45,z:12}],width:8,surfaceBias:.18,structureSemantics:{terrainMode:mode},subdivideMaxDist:2});
const ground = (x,z) => 12 + x*.03 + Math.sin(z*.2);

test('unread initial profiles are replaced without running the provisional compiler', () => {
 let calls=0;
 const prepare=createProvisionalProfileCompiler((...args)=>{calls++;return updateFeatureSurfaceProfile(...args);});
 const actual=feature('at_grade');prepare(actual,ground);
 assert.equal(calls,0);
 actual.ordinaryStreetAnchors=[{distance:0,targetSurfaceY:13}];
 updateFeatureSurfaceProfile(actual,ground);
 const expected=feature('at_grade');expected.ordinaryStreetAnchors=actual.ordinaryStreetAnchors;
 updateFeatureSurfaceProfile(expected,ground);
 assert.deepEqual(actual,expected);assert.equal(calls,0);
});

test('every provisional surface field materializes the exact original profile once', () => {
 for(const mode of ['at_grade','elevated','subgrade'])for(const field of ['transportSurfaceModel','surfaceDistances','surfaceHeights','surfaceOffsets','structureSurfaceMinY','structureSurfaceMaxY','retainingSkirtDepth']){
  let calls=0;const prepare=createProvisionalProfileCompiler((...args)=>{calls++;return updateFeatureSurfaceProfile(...args);});
  const actual=feature(mode),expected=updateFeatureSurfaceProfile(feature(mode),ground);
  prepare(actual,ground);
  assert.deepEqual(actual[field],expected[field]);assert.equal(calls,1);
  assert.deepEqual(actual,expected);assert.equal(calls,1);
 }
});

test('later annotations cannot rewrite an initial profile and legacy writes preserve siblings', () => {
 const prepare=createProvisionalProfileCompiler(updateFeatureSurfaceProfile);
 const actual=feature('at_grade'),expected=updateFeatureSurfaceProfile(feature('at_grade'),ground);
 prepare(actual,ground);actual.structureSemantics.terrainMode='elevated';actual.structureStackOffset=9;
 assert.deepEqual(actual.transportSurfaceModel,expected.transportSurfaceModel);
 const other=feature('at_grade');prepare(other,ground);other.structureSurfaceMinY=-99;
 assert.deepEqual(other.transportSurfaceModel,expected.transportSurfaceModel);assert.equal(other.structureSurfaceMinY,-99);
});

test('a failed provisional read remains an error and authoritative publication can still replace it', () => {
 let calls=0;
 const prepare=createProvisionalProfileCompiler(()=>{calls++;throw Error('Missing accepted ground');});
 const actual=feature('at_grade');prepare(actual,ground);
 assert.throws(()=>actual.surfaceHeights,/Missing accepted ground/);
 assert.throws(()=>actual.transportSurfaceModel,/Missing accepted ground/);
 assert.equal(calls,2);
 updateFeatureSurfaceProfile(actual,ground);
 assert.ok(actual.transportSurfaceModel.distances.length>0);
 assert.equal(calls,2);
});
