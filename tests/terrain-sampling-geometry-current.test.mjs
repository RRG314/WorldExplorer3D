import test from 'node:test';
import assert from 'node:assert/strict';
import { pointInMappedWaterArea, pointInMappedLandArea, pointInLonLatRing } from '../app/js/terrain/far-field-mapped-context.js';
import { createStreetFrontagePolicy } from '../app/js/world/compiler/street-frontage-policy.js';

test('mapped water and land preserve islands, bounds and malformed-edge handling', () => {
  const outer = [[-10,-10],[10,-10],[10,10],[-10,10],[-10,-10]];
  const area = { outer, holes: [[[-2,-2],[2,-2],[2,2],[-2,2],[-2,-2]]],
    bounds: { minLon:-10,maxLon:10,minLat:-10,maxLat:10 } };
  for (const contains of [pointInMappedWaterArea, pointInMappedLandArea]) {
    assert.equal(contains(5,0,area), true);
    assert.equal(contains(0,0,area), false);
    assert.equal(contains(11,0,area), false);
    assert.equal(contains(0,0,{outer}), true);
    assert.equal(contains(0,0,{}), false);
  }
  assert.equal(pointInLonLatRing(0,0,[[NaN,0], ...outer]), true);
});

test('frontage point and segment queries preserve exact distance and crossing cases', () => {
  const policy = createStreetFrontagePolicy([{pts:[{x:-10,z:-10},{x:10,z:-10},{x:10,z:10},{x:-10,z:10}]}],1);
  try {
    assert.equal(policy.query({x:0,z:0},undefined,9).length,0);
    assert.equal(policy.query({x:0,z:0},undefined,10).length,4);
    assert.equal(policy.query({x:0,z:-12},undefined,2).length,1);
    assert.equal(policy.query({x:0,z:-12},undefined,1.99).length,0);
    assert.equal(policy.query({x:-20,z:0},{x:20,z:0}).length,2);
    assert.equal(policy.query({x:20,z:0},{x:-20,z:0}).length,2);
    assert.equal(policy.query({x:10,z:10},undefined,0).length,2);
  } finally { policy.dispose(); }
});
