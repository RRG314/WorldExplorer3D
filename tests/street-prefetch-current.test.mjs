import test from 'node:test';
import assert from 'node:assert/strict';
import {streetMotion,streetPrefetch} from '../app/js/world/street-prefetch.js';
const bounds={minX:-384,maxX:384,minZ:-384,maxZ:384};
test('slow motion keeps overlap while a long build starts ahead of a fast driver',()=>{
 assert.equal(streetPrefetch({x:100,z:0},{vx:2,vz:0},bounds,13000).needsBuild,false);
 const next=streetPrefetch({x:100,z:0},{vx:30,vz:0},bounds,13000);
 assert.equal(next.needsBuild,true);assert.equal(next.focus.x,292);assert.equal(next.focus.z,0);
 assert.equal(streetPrefetch({x:0,z:0},{vx:30,vz:0},bounds,13000).needsBuild,false);
});
test('prediction follows direction, is bounded, and does not extrapolate teleports or stale samples',()=>{
 const a=streetMotion(null,{x:0,z:0},0,1);
 const b=streetMotion(a,{x:-6,z:8},200,1);assert.equal(b.vx,-30);assert.equal(b.vz,40);
 const next=streetPrefetch({x:-100,z:0},b,bounds,13000);
 assert.ok(Math.hypot(next.focus.x+100,next.focus.z)<=192.00001);
 for(const [point,time,sequence] of [[{x:999,z:0},400,1],[{x:0,z:0},5000,1],[{x:0,z:0},400,2]]){
  const motion=streetMotion(b,point,time,sequence);assert.equal(motion.vx,0);assert.equal(motion.vz,0);
 }
 assert.equal(streetPrefetch({x:100,z:0},{vx:-30,vz:0},bounds,13000).needsBuild,false);
 assert.equal(streetPrefetch({x:100,z:0},{vx:.1,vz:40},bounds,13000).needsBuild,false);
});
test('arrival and stopped movement retain the existing boundary rule at any coordinates',()=>{
 assert.equal(streetPrefetch({x:257,z:0},{vx:0,vz:0},bounds).needsBuild,true);
 assert.equal(streetPrefetch({x:0,z:0},{vx:0,vz:0},bounds).needsBuild,false);
 assert.equal(streetPrefetch({x:0,z:0},null,null).needsBuild,true);
 const shifted={minX:9616,maxX:10384,minZ:-10384,maxZ:-9616};
 const p=streetPrefetch({x:10100,z:-10000},{vx:30,vz:0},shifted,13000);
 assert.equal(p.needsBuild,true);assert.equal(p.focus.x,10292);
});
