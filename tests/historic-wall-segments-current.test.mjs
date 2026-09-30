import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleHistoricWallSegments,historicWallCollision} from '../app/js/world/historic-wall-segments.js';
test('historic walls follow intermediate ridges with vertical faces',()=>{
 const ground=(x)=>20*Math.sin(Math.PI*x/80);
 const segments=sampleHistoricWallSegments([{x:0,z:0},{x:80,z:0}],ground,6);
 assert.equal(segments.length,10);
 for(const s of segments){
  assert.ok(s.length<=8);
  assert.ok(Math.abs(s.y-3-s.dy/2-ground(s.x-s.dx/2))<1e-10);
  assert.ok(Math.abs(s.y-3+s.dy/2-ground(s.x+s.dx/2))<1e-10);
 }
 assert.ok(segments.some(s=>s.y>22));
});
test('invalid terrain produces no nonfinite instances and excessive spans are rejected',()=>{
 assert.deepEqual(sampleHistoricWallSegments([{x:0,z:0},{x:80,z:0}],()=>NaN,6),[]);
 assert.deepEqual(sampleHistoricWallSegments([{x:0,z:0},{x:2000,z:0}],()=>0,6),[]);
});

test('wall collision encloses the rendered uphill and downhill endpoints',()=>{
 const segments=sampleHistoricWallSegments([{x:0,z:0},{x:16,z:0}],x=>x,6);
 for(const segment of segments){
  const c=historicWallCollision(segment,4,6);
  assert.equal(c.baseY,segment.x-segment.dx/2);
  assert.equal(c.baseY+c.height,segment.x+segment.dx/2+6);
  assert.deepEqual(c.footprint.map(p=>p.z),[-2,-2,2,2]);
 }
});
