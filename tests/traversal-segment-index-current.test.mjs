import test from 'node:test';
import assert from 'node:assert/strict';
import {createTraversalSegmentIndex} from '../app/js/world/traversal-segment-index.js';
import {ctx} from '../app/js/shared-context.js?v=55';
import {findNearestTraversalFeature,invalidateTraversalNetworks} from '../app/js/world/traversal.js';

const segment=(x,z,dx=10,dz=0,kind='footway',penalty=1)=>({p1:{x,z},p2:{x:x+dx,z:z+dz},feature:{kind},penalty,length:Math.hypot(dx,dz),sourceTStart:0,sourceTEnd:1,segIndex:0,fromId:0,toId:1});
const distance=(s,x,z)=>{
  const dx=s.p2.x-s.p1.x,dz=s.p2.z-s.p1.z;
  const t=Math.max(0,Math.min(1,((x-s.p1.x)*dx+(z-s.p1.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-s.p1.x-dx*t,z-s.p1.z-dz*t);
};
test('broad phase retains every exact-distance candidate across cell edges and long regional segments',()=>{
  let seed=9;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const segments=Array.from({length:2500},()=>segment((random()-.5)*30000,(random()-.5)*30000,(random()-.5)*500,(random()-.5)*500));
  segments.push(segment(-20000,0,40000,0),segment(64,64,0,0),segment(-64,-64,10,10));
  const index=createTraversalSegmentIndex(segments);
  for(const [x,z,r]of [[64,64,0],[-64,-64,0],[0,0,16],[0,0,1e6],...Array.from({length:100},()=>[(random()-.5)*30000,(random()-.5)*30000,random()*260])]){
    const ids=index.query(x,z,r),found=new Set(ids);
    assert.deepEqual(ids,[...ids].sort((a,b)=>a-b));
    for(let id=0;id<segments.length;id++)if(distance(segments[id],x,z)<=r)assert.ok(found.has(id),`lost segment ${id} at ${x},${z} radius ${r}`);
  }
  assert.deepEqual(index.query(NaN,0,16),[]);
  assert.throws(()=>createTraversalSegmentIndex([],0),/cell size/);
});

test('nearest traversal preserves weighting, exact range, road exclusion and original-order ties',()=>{
  const original=ctx.traversalNetworks;
  const first=segment(-10,2,20,0,'footway',.92),tie=segment(-10,-2,20,0,'footway',.92),road=segment(-10,1.8,20,0,'road',1.08);
  const segments=[first,tie,road,segment(10000,10000)];
  try{
    ctx.traversalNetworks={walk:{segments},drive:{segments}};
    assert.equal(findNearestTraversalFeature(0,0,{mode:'walk'}).feature,first.feature);
    assert.equal(findNearestTraversalFeature(0,0,{mode:'drive'}).feature,road.feature);
    assert.equal(findNearestTraversalFeature(0,0,{mode:'drive',excludeRoads:true}).feature,first.feature);
    assert.equal(findNearestTraversalFeature(0,100,{maxDistance:4}),null);
    segments.push(segment(-10,0,20,0));
    assert.equal(findNearestTraversalFeature(0,0,{maxDistance:4}).feature,segments[4].feature,'an appended segment invalidates the cached index');
    segments[4].p1={x:1000,z:1000};segments[4].p2={x:1020,z:1000};
    invalidateTraversalNetworks();
    ctx.traversalNetworks={walk:{segments},drive:{segments}};
    assert.equal(findNearestTraversalFeature(0,0,{maxDistance:4}).feature,first.feature,'world invalidation retires the old spatial lookup');
  }finally{invalidateTraversalNetworks();ctx.traversalNetworks=original;}
});

test('a local walk lookup examines a bounded subset of a large published regional network',()=>{
  const segments=Array.from({length:30000},(_,i)=>segment((i%200)*64,Math.floor(i/200)*64));
  const index=createTraversalSegmentIndex(segments);
  const local=index.query(1000,1000,16);
  assert.ok(local.length<20,`local candidate count was ${local.length}`);
  for(let id=0;id<segments.length;id++)if(distance(segments[id],1000,1000)<=16)assert.ok(local.includes(id));
});
