import test from 'node:test';
import assert from 'node:assert/strict';
import { pointInMappedWaterArea, pointInMappedLandArea, pointInLonLatRing, retainFarWaterRing, retainMappedLandArea } from '../app/js/terrain/far-field-mapped-context.js';
import { createStreetFrontagePolicy } from '../app/js/world/compiler/street-frontage-policy.js';
import {createNumericPublicationStore} from '../app/js/structure-semantics/numeric-publication.js';
import {createGeographicRingIndex} from '../app/js/terrain/geographic-ring-index.js';

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

test('regional ring pages preserve crossings after adjacent publications and allocator retirement',()=>{
 const store=createNumericPublicationStore({pageBytes:16384}),ranges=[],queries=[];
 const storage={allocate(bytes){const range=store.allocate(bytes);ranges.push({...range,bytes});return range;}};
 for(let i=0;i<240;i++){
  // Concave coasts, invalid edges, and repeated long crossings exercise both
  // latitude bins and the bounded flat-scan fallback.
  const ring=i%3===0?Array.from({length:400},(_,j)=>[j/10,j%2?10:-10]):
   Array.from({length:21},(_,j)=>{const a=j/20*Math.PI*2,r=3+Math.sin(j*1.87);return [i+Math.cos(a)*r,Math.sin(a)*r];});
  if(i%7===0)ring[3]=[NaN,3];
  queries.push({indexed:createGeographicRingIndex(ring,storage),reference:structuredClone(ring)});
  ring.length=0;
 }
 store.release();
 // A new generation cannot overwrite the retired generation's live views.
 new Uint8Array(store.allocate(16384).buffer).fill(255);store.release();
 for(const {indexed,reference} of queries)for(let i=0;i<180;i++){
  const x=(i*73)%250-5,y=(i*19)%30-15;
  assert.equal(indexed(x,y),pointInLonLatRing(x,y,reference));
 }
 const buffers=new Set(ranges.map(r=>r.buffer));
 assert.ok(buffers.size<ranges.length/3,'rings should share bounded pages');
 for(let i=1;i<ranges.length;i++)if(ranges[i].buffer===ranges[i-1].buffer)
  assert.ok(ranges[i].byteOffset>=ranges[i-1].byteOffset+ranges[i-1].bytes);
});


test('regional land queries use indexed geometry without materializing duplicate point arrays', () => {
  for (const count of [4, 65, 1000]) {
    const ring = Array.from({length:count}, (_,i) => {
      const angle=i/count*Math.PI*2, radius=8+Math.sin(i*1.87)*2;
      return [Math.cos(angle)*radius,Math.sin(angle)*radius];
    });
    ring.push(ring[0]);
    const hole=[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]];
    const expected={outer:retainFarWaterRing(ring),holes:[retainFarWaterRing(hole)]};
    const area=retainMappedLandArea([ring,hole],{mode:'farmland',sourceFeatureId:'fixture'});
    let reads=0;
    for(const key of ['outer','holes']){
      const descriptor=Object.getOwnPropertyDescriptor(area,key);
      Object.defineProperty(area,key,{...descriptor,get(){reads++;return descriptor.get.call(this);}});
    }
    for(let i=0;i<4000;i++){
      const x=((i*7919)%2400)/100-12,y=((i*1543)%2400)/100-12;
      assert.equal(pointInMappedLandArea(x,y,area),pointInMappedLandArea(x,y,expected));
    }
    for(const [x,y] of ring)assert.equal(pointInMappedLandArea(x,y,area),pointInMappedLandArea(x,y,expected));
    assert.equal(reads,0,'sampling must not expand the coordinate views');
    ring[0][0]=1000;hole[0][0]=1000;
    assert.deepEqual(area.outer,expected.outer);
    assert.deepEqual(area.holes,expected.holes);
    assert.ok(Object.isFrozen(area.outer));assert.ok(area.outer.every(Object.isFrozen));
    assert.equal(area.outer,area.outer,'inspection keeps stable immutable coordinates');
    const clone=structuredClone(area);
    assert.deepEqual(clone.outer,expected.outer);assert.deepEqual(clone.holes,expected.holes);
    assert.equal(clone.mode,'farmland');assert.equal(clone.sourceFeatureId,'fixture');
  }
});

test('regional land geometry preserves explicit replacements and mutable hole lists', () => {
  const square=[[-10,-10],[10,-10],[10,10],[-10,10],[-10,-10]];
  const hole=[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]];
  const area=retainMappedLandArea([square]);
  assert.equal(pointInMappedLandArea(0,0,area),true);
  area.holes.push(hole);assert.equal(pointInMappedLandArea(0,0,area),false);
  area.holes.pop();assert.equal(pointInMappedLandArea(0,0,area),true);
  area.holes=[hole];assert.equal(pointInMappedLandArea(0,0,area),false);
  area.holes=undefined;assert.equal(pointInMappedLandArea(0,0,area),true);
  area.outer=hole;assert.equal(pointInMappedLandArea(5,0,area),false);
  assert.equal(pointInMappedLandArea(0,0,area),true);
  area.outer=undefined;assert.equal(pointInMappedLandArea(0,0,area),false);
  const frozen=Object.freeze(retainMappedLandArea([square]));
  assert.throws(()=>{frozen.outer=hole;},TypeError);
  assert.throws(()=>{frozen.holes=[hole];},TypeError);
});

test('regional land views preserve source types and survive numeric publication retirement', () => {
  for(const ring of [
    [['0','0'],['4','0'],['4','4'],['0','4']],
    [[0,0,15],[4,0,16],[4,4,17],[0,4,18]],
    [[0,0],[4,0],[NaN,2],[4,4],[0,4]]
  ]){
    const area=retainMappedLandArea([ring]);
    assert.deepEqual(area.outer,retainFarWaterRing(ring));
    assert.equal(pointInMappedLandArea(2,2,area),true);
  }
  assert.equal(retainMappedLandArea([[[0,0],[1,1]]]),null);
  const flat=retainMappedLandArea([[[0,0],[1,0],[2,0]]]);
  assert.equal(pointInMappedLandArea(1,0,flat),false);
  assert.deepEqual(flat.outer,[[0,0],[1,0],[2,0],[0,0]]);
  const storage=createNumericPublicationStore({pageBytes:16384}),areas=[];
  for(let i=0;i<100;i++)areas.push(retainMappedLandArea([[[i,0],[i+1,0],[i+1,1],[i,1]]],{},storage));
  storage.release();new Uint8Array(storage.allocate(16384).buffer).fill(255);storage.release();
  for(let i=0;i<areas.length;i++){
    assert.equal(pointInMappedLandArea(i+.5,.5,areas[i]),true);
    assert.deepEqual(areas[i].outer,[[i,0],[i+1,0],[i+1,1],[i,1],[i,0]]);
  }
});
