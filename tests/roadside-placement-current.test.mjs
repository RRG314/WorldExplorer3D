import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoadsidePlacementResolver, isGroundRoad } from '../app/js/world/roadside-placement.js';
const road = (a,b,width=10,extra={}) => ({pts:[a,b],width,driveable:true,...extra});
const eastWest=road({x:-100,z:0},{x:100,z:0});
const northSouth=road({x:0,z:-100},{x:0,z:100});
test('intersection fixtures clear both roads, keep semantic center and reserve personal space',()=>{
 const resolver=createRoadsidePlacementResolver([eastWest,northSouth]);
 const placements=[];
 for(let i=0;i<4;i++){
  const p=resolver.resolve({x:0,z:0});assert.ok(p);
  assert.ok(Math.abs(p.x)>=6.1&&Math.abs(p.z)>=6.1,JSON.stringify(p));
  assert.equal(resolver.roadBlocked(p),false);resolver.reserve(p);placements.push(p);
 }
 for(let i=0;i<placements.length;i++)for(let j=i+1;j<placements.length;j++)assert.ok(Math.hypot(placements[i].x-placements[j].x,placements[i].z-placements[j].z)>=2.2);
});
test('mapped clear positions stay exact; mapped centerline nodes are relocated to a valid roadside',()=>{
 const resolver=createRoadsidePlacementResolver([eastWest]);
 const original={x:25,z:8};const p=resolver.resolve(original,{preferOriginal:true});assert.equal(p.x,25);assert.equal(p.z,8);
 const moved=resolver.resolve({x:25,z:0},{preferOriginal:true});assert.ok(moved);assert.equal(resolver.roadBlocked(moved),false);
});
test('obstacles reject placement, junction search can use the other verge, no unsafe fallback',()=>{
 const oneSide=createRoadsidePlacementResolver([eastWest],{blocked:(_x,z)=>z>0});assert.ok(oneSide.resolve({x:0,z:0}).z<0);
 const occupied=createRoadsidePlacementResolver([eastWest],{blocked:()=>true});assert.equal(occupied.resolve({x:0,z:0}),null);
});
test('grade-separated roads do not create ground fixtures; road coordinate scale is respected',()=>{
 assert.equal(isGroundRoad({...eastWest,bridge:'yes'}),false);
 assert.equal(isGroundRoad({...eastWest,tunnel:'no'}),true);
 const resolver=createRoadsidePlacementResolver([{...eastWest,bridge:'yes'}]);assert.equal(resolver.resolve({x:0,z:0}),null);assert.equal(resolver.resolve({x:0,z:6},{preferOriginal:true}),null);
 const scaled=createRoadsidePlacementResolver([road({x:-100,z:0},{x:100,z:0},5,{metersPerWorldUnit:2,resolvedCrossSection:{sourceWidthMeters:10}})]);
 const p=scaled.resolve({x:0,z:0});assert.ok(Math.abs(p.z)>3.5&&Math.abs(p.z)<5);
});
