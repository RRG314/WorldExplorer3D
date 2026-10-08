import test from 'node:test';
import assert from 'node:assert/strict';
import {distanceToWaterBoundary} from '../app/js/world/water-surface-registry.js';

const rectangle=(x0,z0,x1,z1)=>[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}];
test('shoreline pruning preserves outer banks, island banks, corners and land exclusion',()=>{
  const body={shape:'area',pts:rectangle(-100,-80,100,80),holes:[rectangle(-10,-10,10,10)]};
  for(const [x,z,expected] of [[0,0,0],[101,0,0],[95,0,5],[0,75,5],[12,0,2],[13,14,5],[30,0,20],[-12,-10,2]]) {
    assert.equal(distanceToWaterBoundary(body,x,z),expected);
  }
  body.pts.splice(1,0,{...body.pts[0]});assert.equal(distanceToWaterBoundary(body,13,14),5,'A zero-length edge does not change clearance');
  assert.equal(distanceToWaterBoundary(body,NaN,0),0);
});

test('detailed coastlines retain exact clearance while distant edges avoid redundant hypot calls',()=>{
  const pts=[];
  for(let i=0;i<1000;i++)pts.push({x:100*Math.cos(i*Math.PI/500),z:100*Math.sin(i*Math.PI/500)});
  const body={shape:'area',pts},x=99,z=0;
  const hypot=Math.hypot;let calls=0;
  let expected=Infinity;
  for(let i=0;i<pts.length;i++){
    const a=pts[i],b=pts[(i+1)%pts.length],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    expected=Math.min(expected,hypot(x-a.x-dx*t,z-a.z-dz*t));
  }
  try{
    Math.hypot=(...values)=>{calls++;return hypot(...values);};
    assert.ok(Math.abs(distanceToWaterBoundary(body,x,z)-expected)<1e-12);
  }finally{Math.hypot=hypot;}
  assert.ok(calls<20,`${calls} distance evaluations for a 1000-segment shoreline`);
});
