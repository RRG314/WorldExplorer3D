import test from 'node:test';
import assert from 'node:assert/strict';
import { pointInMappedWaterArea, pointInMappedLandArea, pointInLonLatRing, retainFarWaterRing } from '../app/js/terrain/far-field-mapped-context.js';
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

test('compiled geographic rings preserve exact coastal crossings and independent source ownership',()=>{
 for(const n of [4,65,1000]){
  const source=Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2,r=8+Math.sin(i*1.87)*2;return [Math.cos(a)*r,Math.sin(a)*r];});
  source.push(source[0]);const retained=retainFarWaterRing(source);assert.notEqual(retained,source);assert.ok(Object.isFrozen(retained));
  for(let i=0;i<4000;i++){const x=((i*7919)%2400)/100-12,y=((i*1543)%2400)/100-12;assert.equal(pointInLonLatRing(x,y,retained),pointInLonLatRing(x,y,source));}
  for(const [x,y]of source)assert.equal(pointInLonLatRing(x,y,retained),pointInLonLatRing(x,y,source));
  const before=pointInLonLatRing(0,0,retained);source[0][0]=1000;assert.equal(pointInLonLatRing(0,0,retained),before);
 }
});
