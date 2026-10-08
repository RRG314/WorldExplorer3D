import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {createBuildingCollisionQuery} from '../app/js/physics/building-collision.js';
import {getNearbyBuildings,addBuildingToSpatialIndex,removeBuildingsFromSpatialIndex,clearBuildingSpatialIndex} from '../app/js/world/building-spatial-index.js';

const box=(id,x=0)=>({id,minX:x-2,maxX:x+2,minZ:-2,maxZ:2,minY:0,maxY:4});

test('nested acceptance callbacks preserve the outer candidate order and independent results',()=>{
  const first=box('first'),second=box('second'),remote=box('remote',200);
  const app={buildings:[first,second,remote],dynamicBuildingColliders:[second]};
  const query=createBuildingCollisionQuery(app),seen=[];
  let nested;
  const result=query(0,0,.4,{actorBaseY:1,acceptCollision(hit){
    seen.push(hit.building.id);
    nested=query(200,0,.4,{actorBaseY:1});
    return hit.building===second;
  }});
  assert.deepEqual(seen,['first','second']);
  assert.equal(result.building,second);assert.equal(nested.building,remote);
  query(1000,1000);assert.equal(result.building,second);assert.equal(nested.building,remote);
  assert.throws(()=>query(0,0,.4,{acceptCollision(){throw new Error('caller failed');}}),/caller failed/);
  app.buildings=[remote];app.dynamicBuildingColliders=[];
  assert.equal(query(0,0).collision,false);assert.equal(query(200,0).building,remote);
});

test('candidate reuse keeps vegetation priority, vertical floors, dynamic replacement and closed doors',()=>{
  const ground=box('ground'),upper={...box('upper'),minY:8,maxY:12};
  const door={...box('door',10),collisionDisabled:true};
  const app={vegetationFeatures:[{id:'tree',x:0,z:0,baseY:0,trunkRadius:.4,trunkHeight:3}],buildings:[ground,upper],dynamicBuildingColliders:[door]};
  const query=createBuildingCollisionQuery(app);
  assert.equal(query(0,0,.2,{actorBaseY:0}).building.kind,'vegetation_trunk');
  assert.equal(query(0,0,.2,{actorBaseY:9}).building,upper);
  assert.equal(query(10,0,.2).collision,false);
  door.collisionDisabled=false;assert.equal(query(10,0,.2).building,door);
  app.activeInterior={environmentKind:'expedition-ship'};
  assert.equal(query(0,0,.2).collision,false);
  assert.equal(query(10,0,.2).building,door);
  app.dynamicBuildingColliders=[];assert.equal(query(10,0,.2).collision,false);
});

test('scratch storage releases scene references on success, no hit and a caller exception',()=>{
  const obstacle=box('wall');let scratch;
  const query=createBuildingCollisionQuery({buildings:[obstacle],getNearbyBuildings(x,z,r,target){scratch=target;return [obstacle];}});
  const assertReleased=()=>{
    assert.ok(scratch);assert.equal(scratch.count,0);
    assert.ok(scratch.items.every(value=>value===null),'No scratch slot retains a disposed world object');
  };
  const hit=query(0,0,.4);assertReleased();assert.equal(hit.building,obstacle);
  query(100,100);assertReleased();
  assert.throws(()=>query(0,0,.4,{acceptCollision(){throw new Error('rejected');}}),/rejected/);assertReleased();
});

test('the spatial index keeps public snapshots independent and observes suppression, insertion and removal',()=>{
  const names=['buildings','dynamicBuildingColliders','transportStructureColliders','activeShipInterior','isLocalBuildingSuppressed'];
  const saved=Object.fromEntries(names.map(name=>[name,ctx[name]]));
  try{
    clearBuildingSpatialIndex();ctx.activeShipInterior=false;
    const a={...box('a'),sourceBuildingId:'a'},b=box('b'),far=box('far',1000);
    const suppressed=new Set();ctx.isLocalBuildingSuppressed=id=>suppressed.has(id);
    ctx.buildings=[a,b,far];ctx.dynamicBuildingColliders=[];
    for(const item of ctx.buildings)addBuildingToSpatialIndex(item);
    const query=createBuildingCollisionQuery({buildings:ctx.buildings,dynamicBuildingColliders:[],getNearbyBuildings});
    const initial=getNearbyBuildings(0,0,20);
    assert.deepEqual(initial,[a,b]);assert.equal(query(0,0,.4).building,a);
    suppressed.add('a');assert.equal(query(0,0,.4).building,b);
    assert.deepEqual(initial,[a,b],'An earlier public snapshot is never overwritten');
    removeBuildingsFromSpatialIndex([b]);assert.equal(query(0,0,.4).collision,false);
    addBuildingToSpatialIndex(b);assert.equal(query(0,0,.4).building,b);
    initial.length=0;assert.deepEqual(getNearbyBuildings(0,0,20),[b]);
  }finally{clearBuildingSpatialIndex();Object.assign(ctx,saved);}
});
