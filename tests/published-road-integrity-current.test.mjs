import assert from 'node:assert/strict';
import test from 'node:test';
import { measurePublishedRoadTriangles } from '../app/js/terrain/published-road-integrity.js';
test('measures upward, reversed and collapsed published triangles', () => {
  const p=new Float32Array([0,0,0,0,0,1,1,0,0]);
  assert.deepEqual(measurePublishedRoadTriangles(p,[0,1,2,0,2,1,0,0,2]),{surfaceTriangles:3,downwardFacingTriangles:1,zeroFootprintTriangles:1,invalidTriangles:0});
});
test('measures Float32 collapse rather than assuming construction arrays remain valid', () => {
  const p=[1e8,0,0,1e8,0,1,1e8+1,0,0];
  assert.equal(measurePublishedRoadTriangles(p,[0,1,2]).zeroFootprintTriangles,0);
  assert.equal(measurePublishedRoadTriangles(new Float32Array(p),[0,1,2]).zeroFootprintTriangles,1);
});
test('invalid indices and nonfinite heights are counted as failures', () => {
  assert.equal(measurePublishedRoadTriangles([0,NaN,0,0,0,1,1,0,0],[0,1,2]).invalidTriangles,1);
  assert.equal(measurePublishedRoadTriangles([0,0,0],[0,1,2,0,-1,0,0,0]).invalidTriangles,3);
});

import { normalizePublishedRoadIndices } from '../app/js/terrain/published-road-integrity.js';
test('normalizes uploaded tops without changing surviving footprints or surface modes', () => {
  const positions = new Float32Array([0,0,0,0,0,1,1,0,0, 1e8,0,0,1e8,0,1,1e8+1,0,0]);
  const before = positions.slice();
  const result = normalizePublishedRoadIndices(positions, new Uint16Array([0,2,1,3,4,5,0,1,2]),
    [{start:0,count:6,terrainMode:'at_grade'},{start:6,count:3,terrainMode:'bridge'}]);
  assert.deepEqual(positions,before);
  assert.deepEqual([...result.indices],[0,1,2,0,1,2]);
  assert.deepEqual(result.surfaceRanges,[{start:0,count:3,terrainMode:'at_grade'},{start:3,count:3,terrainMode:'bridge'}]);
  assert.equal(result.removedZeroFootprintTriangles,1);
  assert.equal(result.correctedDownwardTriangles,1);
  assert.deepEqual(measurePublishedRoadTriangles(positions,result.indices),
    {surfaceTriangles:2,downwardFacingTriangles:0,zeroFootprintTriangles:0,invalidTriangles:0});
});
test('rejects corrupt geometry or range coverage instead of silently deleting it', () => {
  const p = new Float32Array([0,0,0,0,0,1,1,0,0]);
  assert.throws(()=>normalizePublishedRoadIndices(p,new Uint16Array([0,1,99]),[{start:0,count:3}]),/Invalid published/);
  assert.throws(()=>normalizePublishedRoadIndices(p,new Uint16Array([0,1,2]),[]),/do not cover/);
  assert.throws(()=>normalizePublishedRoadIndices(p,new Uint16Array([0,1,2]),[{start:1,count:3}]),/Invalid road surface range/);
});

import {roadSourceCoordinateTolerance} from '../app/js/terrain/published-road-integrity.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
test('precision-distance audit finds a rounded edge across a contact-index cell boundary', () => {
  const p = new Float32Array([16,3,0,16,3,1,17,3,0]);
  const contacts = createRoadContactIndex([{geometry:{attributes:{position:{array:p}}},userData:{terrainMode:'at_grade'}}]);
  const x = 16-0.0003, z = 0.4, tolerance = roadSourceCoordinateTolerance(x,z,0.001);
  assert.equal(contacts.sampleAt(x,z,NaN,'at_grade'),null);
  const nearest = contacts.nearestSurfaceAt(x,z,tolerance,'at_grade');
  assert.ok(nearest && Math.abs(nearest.distance-0.0003)<1e-12);
  assert.equal(nearest.y,3);
  assert.equal(contacts.nearestSurfaceAt(x,z,tolerance,'bridge'),null);
  assert.equal(contacts.nearestSurfaceAt(15.99,z,tolerance,'at_grade'),null);
  assert.equal(contacts.sampleAt(x,z,NaN,'at_grade'),null,'audit must not expand physical collision');
  contacts.dispose();
});
test('precision bounds follow compiler grid and Float32 scale rather than road width', () => {
  assert.ok(roadSourceCoordinateTolerance(1,1,0.001)<0.00071);
  assert.ok(roadSourceCoordinateTolerance(12000,12000,0.001)<0.0014);
  assert.ok(roadSourceCoordinateTolerance(20000,20000,0.001)<0.0021);
  assert.throws(()=>roadSourceCoordinateTolerance(NaN,0,0.001),/Invalid road precision/);
});
