import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleDistrictGroundMeters, sampleDistrictGroundElevationMeters} from '../app/js/world/compiler/district-ground-model.js';
import {createHeightCache} from '../app/js/terrain/height-cache.js';
import {mappedWaterBedMetersAt,createMappedWaterBedSampler} from '../app/js/terrain/mapped-water-bed.js';

const model=(encoded=true)=>{
 const ground=Float64Array.from([3.1,7.2,14.3,8.4,19.5,23.6,16.7,21.8,30.9]);
 const raw=Float64Array.from(ground,n=>n+25),samplesByKey={};
 for(let y=0;y<3;y++)for(let x=0;x<3;x++)samplesByKey[`${x-1}:${y-1}`]={key:`${x-1}:${y-1}`,groundElevationMeters:ground[y*3+x],rawElevationMeters:raw[y*3+x],confidence:.8};
 return {type:'DistrictGroundModel',status:'accepted',grid:{spacingMeters:10,minColumn:-1,maxColumn:1,minRow:-1,maxRow:1},samplesByKey,encodedSamples:encoded?{groundElevationMeters:ground,rawElevationMeters:raw,shared:{confidence:.8}}:null};
};
test('numeric and diagnostic ground queries preserve bilinear heights, edges, metadata and missing cells',()=>{
 for(const encoded of [true,false]){
  const m=model(encoded);
  for(let y=-10;y<=10;y+=.25)for(let x=-10;x<=10;x+=.25){
   const detailed=sampleDistrictGroundMeters(m,x,y),scalar=sampleDistrictGroundElevationMeters(m,x,y);
   assert.equal(scalar,detailed.groundElevationMeters);
   assert.ok(Math.abs(detailed.rawElevationMeters-scalar-25)<1e-12);
   assert.equal(detailed.confidence,.8);assert.equal(detailed.sampleKeys.length,4);assert.ok(Object.isFrozen(detailed));
  }
  // Independently calculated midpoint of the four first observations.
  assert.equal(sampleDistrictGroundElevationMeters(m,-5,-5),3.1+(7.2-3.1)*.5+((8.4+(19.5-8.4)*.5)-(3.1+(7.2-3.1)*.5))*.5);
  for(const [x,y] of [[-10.1,0],[0,20.1],[21,21]])assert.ok(Number.isNaN(sampleDistrictGroundElevationMeters(m,x,y)));
 }
 const m=model(false);delete m.samplesByKey['0:0'];assert.ok(Number.isNaN(sampleDistrictGroundElevationMeters(m,-5,-5)));
 assert.equal(sampleDistrictGroundMeters(m,-5,-5).reason,'missing-cell');
 assert.throws(()=>sampleDistrictGroundElevationMeters(model(),NaN,1),/finite/);
});
test('numeric cache retains exact double coordinates through collisions, eviction and release',()=>{
 const cache=createHeightCache(128);
 for(let cycle=0;cycle<20;cycle++){
  cache.clear();
  for(let i=0;i<128;i++)cache.set(i/100000+cycle,i%7-3,i+.125);
  for(let i=0;i<128;i++)assert.equal(cache.get(i/100000+cycle,i%7-3),i+.125);
  cache.set(1e20,1e-20,42);assert.ok(cache.size<=128);assert.equal(cache.get(1e20,1e-20),42);
 }
 cache.clear();cache.set(-0,0,3);assert.equal(cache.get(0,-0),3);
 cache.set(0,0,4);assert.equal(cache.size,1);assert.equal(cache.get(-0,-0),4);
 cache.set(1,1,NaN);assert.equal(cache.get(1,1),undefined);
 cache.clear();assert.equal(cache.get(0,0),undefined);assert.equal(cache.size,0);
});
test('indexed water beds preserve exact selection, holes, broad polygons and mutable surface height',()=>{
 const areas=Array.from({length:300},(_,i)=>({bounds:{minLon:(i%30)/10,maxLon:(i%30)/10+.08,minLat:Math.floor(i/30)/10,maxLat:Math.floor(i/30)/10+.08},surfaceMeters:i%13}));
 areas.push({bounds:{minLon:-10,maxLon:10,minLat:-10,maxLat:10},surfaceMeters:-5,kind:'ocean'});
 areas.push({surfaceMeters:8});
 let calls=0;
 const contains=(x,y,a)=>{calls++;const b=a.bounds;return !b || x>=b.minLon&&x<=b.maxLon&&y>=b.minLat&&y<=b.maxLat&&!(x>b.minLon+.02&&x<b.minLon+.04&&y>b.minLat+.02&&y<b.minLat+.04);};
 const indexed=createMappedWaterBedSampler(areas,contains);
 let indexedCalls=0,referenceCalls=0;
 for(let i=0;i<2000;i++){
  const x=((i*7919)%3100)/1000-.05,y=((i*1543)%1100)/1000-.05;
  calls=0;const actual=indexed(x,y,100);indexedCalls+=calls;
  calls=0;assert.equal(actual,mappedWaterBedMetersAt(x,y,100,areas,contains));referenceCalls+=calls;
 }
 assert.ok(indexedCalls<referenceCalls/20);
 areas[0].surfaceMeters=-100;
 assert.equal(indexed(.01,.01,100),mappedWaterBedMetersAt(.01,.01,100,areas,contains));
});
