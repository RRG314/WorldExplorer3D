import test from 'node:test';import assert from 'node:assert/strict';
import {frontageHit} from '../app/js/world/compiler/street-frontage-geometry.js';
import {frontageBlocked} from '../app/js/world/compiler/street-carriageway-barriers.js';
// Original unpruned predicates, retained as an independent result oracle.
function legacyHit(point,nx,nz,edges,minimum,maximum){let best=null;for(const edge of edges){const {a,b}=edge,dx=b.x-a.x,dz=b.z-a.z,den=nx*dz-nz*dx;if(Math.abs(den)<1e-8)continue;const ax=a.x-point.x,az=a.z-point.z,distance=(ax*dz-az*dx)/den,t=(ax*nz-az*nx)/den;if(t>=-1e-7&&t<=1+1e-7&&distance>=-1e-7&&(!best||distance<best.distance))best={edge,distance:Math.max(0,distance),maximum:Math.max(maximum,minimum)};}return best&&best.edge.facadeEligible!==false&&best.distance>=minimum-1e-7&&best.distance<=best.maximum+1e-7?best:null;}
function legacyBlocked(point,nx,nz,distance,barriers,exclude){for(const {a,b,road}of barriers){if(exclude&&road===exclude)continue;const dx=b.x-a.x,dz=b.z-a.z,den=nx*dz-nz*dx;if(Math.abs(den)<1e-10)continue;const x=a.x-point.x,z=a.z-point.z,ray=(x*dz-z*dx)/den,t=(x*nz-z*nx)/den;if(ray>1e-6&&ray<distance-1e-6&&t>=-1e-7&&t<=1+1e-7)return true;}return false;}
test('frontage bounds preserve visibility and blockage across dense, translated and boundary rays',()=>{
 let seed=781;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const owner={},other={};
 for(const offset of [0,8192,-1e8])for(let i=0;i<1200;i++){
  const point={x:offset+random()*200-100,z:offset+random()*200-100},angle=random()*Math.PI*2,nx=Math.cos(angle),nz=Math.sin(angle),minimum=random()*5,maximum=random()*40;
  const edges=Array.from({length:24},(_,j)=>({a:{x:offset+random()*300-150,z:offset+random()*300-150},b:{x:offset+random()*300-150,z:offset+random()*300-150},road:j%2?owner:other,facadeEligible:j%5!==0}));
  const distance=i%17===0?Infinity:maximum;
  assert.deepEqual(frontageHit(point,nx,nz,edges,minimum,distance),legacyHit(point,nx,nz,edges,minimum,distance));
  assert.equal(frontageBlocked(point,nx,nz,distance,edges,owner),legacyBlocked(point,nx,nz,distance,edges,owner));
 }
 for(const direction of [-1,1])for(const edgeX of [-1e-8,0,1e-8,3,3+1e-8,3+1e-6]){
  const edges=[{a:{x:direction*edgeX,z:-1e7},b:{x:direction*edgeX,z:1e7},facadeEligible:true}];
  assert.deepEqual(frontageHit({x:0,z:0},direction,0,edges,0,3),legacyHit({x:0,z:0},direction,0,edges,0,3));
 }
 const occluder={a:{x:2,z:-1},b:{x:2,z:1},facadeEligible:false},rear={a:{x:4,z:-1},b:{x:4,z:1},facadeEligible:true};
 assert.equal(frontageHit({x:0,z:0},1,0,[occluder,rear],1,10),null);
});
