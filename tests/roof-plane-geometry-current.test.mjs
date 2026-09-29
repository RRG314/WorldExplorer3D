import test from 'node:test';
import assert from 'node:assert/strict';
import {roofPlaneTriangles} from '../app/js/world/roof-plane-geometry.js';
const rectangle=[{x:-8,z:-4},{x:8,z:-4},{x:8,z:4},{x:-8,z:4}];
const axis={x:1,z:0};
const vertices=p=>Array.from({length:p.length/3},(_,i)=>({x:p[i*3],y:p[i*3+1],z:p[i*3+2]}));
test('mapped roof forms have distinct bounded silhouettes',()=>{
 const all={};
 for(const shape of ['gabled','hipped','half-hipped','gambrel','mansard']){
  const p=roofPlaneTriangles(rectangle,shape,3,axis);all[shape]=p;
  assert.ok(p.length>=18);assert.ok(p.every(Number.isFinite));
  const v=vertices(p);assert.ok(Math.abs(Math.max(...v.map(p=>p.y))-3)<1e-6);
  assert.ok(v.every(p=>p.y>=0&&p.y<=3.000001&&Math.abs(p.x)<=8.000001&&Math.abs(p.z)<=4.000001));
 }
 assert.equal(new Set(Object.values(all).map(JSON.stringify)).size,5);
 const hip=vertices(all.hipped);assert.ok(hip.some(p=>Math.abs(p.x)<8&&p.y>2.99));
 assert.ok(!hip.some(p=>Math.abs(p.x)>7.999&&p.y>1e-6));
 assert.ok(vertices(all['half-hipped']).some(p=>Math.abs(p.x)>7.999&&Math.abs(p.y-1.5)<1e-6));
 assert.ok(vertices(all.gambrel).some(p=>Math.abs(p.y-2.1)<1e-6));
 const mansard=vertices(all.mansard);assert.ok(mansard.filter(p=>p.y>2.99).some(p=>Math.abs(p.z)>1));
});
test('rotated and reversed convex footprints retain finite surfaces and measured roof height',()=>{
 for(const points of [rectangle,[{x:0,z:0},{x:15,z:0},{x:9,z:7},{x:1,z:5}]]){
  for(const reverse of [false,true]){
   const angle=.7,c=Math.cos(angle),s=Math.sin(angle);
   const rotated=points.map(p=>({x:p.x*c-p.z*s+500,z:p.x*s+p.z*c-250}));if(reverse)rotated.reverse();
   for(const shape of ['gabled','hipped','mansard','gambrel','half-hipped']){
    const v=vertices(roofPlaneTriangles(rotated,shape,2,{x:c,z:s}));
    assert.ok(v.length>0);assert.ok(v.every(p=>Number.isFinite(p.y)&&p.y>=0&&p.y<=2.00001));
    assert.ok(Math.abs(Math.max(...v.map(p=>p.y))-2)<1e-5);
   }
  }
 }
});
