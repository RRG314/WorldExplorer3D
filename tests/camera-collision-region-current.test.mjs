import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {createBuildingCollisionQuery} from '../app/js/physics/building-collision.js';
import {resolveThirdPersonCameraCollision} from '../app/js/walking/camera-collision.js';
import {getNearbyBuildings,addBuildingToSpatialIndex,clearBuildingSpatialIndex} from '../app/js/world/building-spatial-index.js';

const wall=(id,x,z,minY=0,maxY=4)=>({id,minX:x-.3,maxX:x+.3,minZ:z-3,maxZ:z+3,minY,maxY,pts:[{x:x-.3,z:z-3},{x:x+.3,z:z-3},{x:x+.3,z:z+3},{x:x-.3,z:z+3}]});

test('camera region preserves sampled collision across cell boundaries, heights, doors and guardrails',()=>{
 const names=['buildings','dynamicBuildingColliders','transportStructureColliders','activeShipInterior','isLocalBuildingSuppressed'];
 const saved=Object.fromEntries(names.map(n=>[n,ctx[n]]));
 try{
  clearBuildingSpatialIndex();ctx.activeShipInterior=false;ctx.isLocalBuildingSuppressed=()=>false;
  ctx.buildings=[wall('west',-120,0),wall('east',120,0),wall('upper',0,0,8,12),wall('replaced',5,20)];
  ctx.buildings[3].collisionReplacedByVenue=true;
  for(const b of ctx.buildings)addBuildingToSpatialIndex(b);
  const door={...wall('door',4,0),isInteriorCollider:true},rail={...wall('rail',-4,0),buildingType:'bridge_guardrail'};
  ctx.dynamicBuildingColliders=[door,rail];
  const query=createBuildingCollisionQuery({buildings:ctx.buildings,dynamicBuildingColliders:ctx.dynamicBuildingColliders,getNearbyBuildings});
  const ordinary=(...args)=>query(...args);
  let samples=0;
  for(const doorOpen of [false,true])for(const x of [-126,-114,-10,0,10,114,126])for(const y of [1.5,9.5,15])for(const dx of [-16,16]){
   door.collisionDisabled=doorOpen;
   const input={anchor:{x,y,z:0},target:{x:x+dx,y:y+.75,z:1}};
   const expected=resolveThirdPersonCameraCollision({...input,checkBuildingCollision:ordinary});
   assert.deepEqual(resolveThirdPersonCameraCollision({...input,checkBuildingCollision:query}),expected);
   samples++;
  }
  assert.equal(samples,84);
  const obstructed=resolveThirdPersonCameraCollision({anchor:{x:114,y:1.5,z:0},target:{x:126,y:1.5,z:0},checkBuildingCollision:query});
  assert.equal(obstructed.collided,true);assert.ok(obstructed.x<120);
  const ignoredRail=resolveThirdPersonCameraCollision({anchor:{x:-10,y:1.5,z:0},target:{x:-1,y:1.5,z:0},checkBuildingCollision:query});
  assert.equal(ignoredRail.collided,false);
 }finally{clearBuildingSpatialIndex();Object.assign(ctx,saved);}
});

test('a camera pass searches its neighborhood once and observes dynamic changes on the next pass',()=>{
 let queries=0;
 const door=wall('door',4,0);door.collisionDisabled=true;
 const app={buildings:[],dynamicBuildingColliders:[door],getNearbyBuildings(){queries++;return [];}};
 const query=createBuildingCollisionQuery(app);
 const input={anchor:{x:0,y:1.5,z:0},target:{x:12,y:1.5,z:0}};
 const old=resolveThirdPersonCameraCollision({...input,checkBuildingCollision:(...args)=>query(...args)});
 const originalQueries=queries;assert.ok(originalQueries>8);
 queries=0;const current=resolveThirdPersonCameraCollision({...input,checkBuildingCollision:query});
 assert.deepEqual(current,old);assert.equal(queries,1);
 door.collisionDisabled=false;
 assert.equal(resolveThirdPersonCameraCollision({...input,checkBuildingCollision:query}).collided,true);
 app.dynamicBuildingColliders=[];
 assert.equal(resolveThirdPersonCameraCollision({...input,checkBuildingCollision:query}).collided,false);
});

test('region leases release scene references on nested queries, out-of-range probes and exceptions',()=>{
 const near=wall('near',0,0),far=wall('far',200,0);const buffers=new Set();
 const query=createBuildingCollisionQuery({buildings:[near,far],getNearbyBuildings(x,z,r,buffer){buffers.add(buffer);return [near,far];}});
 let retained;
 const hit=query.withRegion(0,0,5,probe=>{
  retained=probe;
  assert.equal(query.withRegion(200,0,5,inner=>inner(200,0,.2)).building,far);
  assert.equal(probe(200,0,.2).building,far,'A probe outside the region uses its own query');
  return probe(0,0,.2);
 });
 assert.equal(hit.building,near);
 assert.throws(()=>retained(0,0,.2),/released/);
 assert.throws(()=>query.withRegion(0,0,5,probe=>probe(0,0,.2,{acceptCollision(){throw new Error('caller failed');}})),/caller failed/);
 for(const b of buffers){assert.equal(b.count,0);assert.ok(b.items.every(item=>item===null));}
 assert.equal(query(0,0,.2).building,near);
});


test('region sampling preserves tree contact and isolates interior camera obstacles',()=>{
 const wallOutside=wall('outside',8,0),door={...wall('inside-door',4,0),isInteriorCollider:true};
 const app={buildings:[wallOutside],dynamicBuildingColliders:[door],vegetationFeatures:[{id:'tree',x:2,z:0,baseY:0,trunkRadius:.6,trunkHeight:3}]};
 const query=createBuildingCollisionQuery(app),ordinary=(...args)=>query(...args);
 const input={anchor:{x:0,y:1.5,z:0},target:{x:12,y:1.5,z:0}};
 const compare=()=>{const a=resolveThirdPersonCameraCollision({...input,checkBuildingCollision:query});assert.deepEqual(a,resolveThirdPersonCameraCollision({...input,checkBuildingCollision:ordinary}));return a;};
 assert.ok(compare().x<2,'Outdoor tree remains solid');
 app.activeInterior={environmentKind:'expedition-ship'};
 assert.ok(compare().x>2,'Outdoor tree does not leak into the interior');
 assert.ok(compare().x<4,'Interior closed door still blocks the camera');
 door.collisionDisabled=true;assert.equal(compare().collided,false,'The opened interior door reveals no cached outdoor wall');
});
