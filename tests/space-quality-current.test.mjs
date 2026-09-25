import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from 'three';
import {projectCatalogStar} from '../app/js/space/observer-sky.js';
import {BRIGHT_STARS,CONSTELLATION_STAR_IDS} from '../app/js/sky/catalog.js';
import {roomBulkheadSpan,SHIP_DECKS} from '../app/js/expedition/ship-layout.js';
import {resolveSpaceControlInput} from '../app/js/space/runtime.js';

test('aircraft controls rotate the nose down for forward input and up for back input',()=>{
  for(const [keys,shared,sign] of [[{arrowup:true},{},-1],[{arrowdown:true},{},1],[{},{move:1},-1],[{},{move:-1},1]]) {
    const {pitch}=resolveSpaceControlInput(keys,shared);
    const forward=new Vector3(0,1,0),up=new Vector3(0,0,1);
    const axis=new Vector3().crossVectors(forward,up).normalize();
    const moved=forward.clone().applyQuaternion(new Quaternion().setFromAxisAngle(axis,pitch*.1));
    assert.equal(Math.sign(moved.dot(up)),sign);
  }
});
test('catalog projects Earth patterns unchanged and shifts both direction and brightness at a new observer',()=>{
  const star={ra:0,dec:0,dist:10,mag:1};
  assert.deepEqual(projectCatalogStar(star,{x:0,y:0,z:0},1),{x:1,y:0,z:0,distanceLy:10,magnitude:1});
  const nearby=projectCatalogStar(star,{x:5,y:0,z:0},1);
  assert.equal(nearby.distanceLy,5);assert.ok(nearby.magnitude<1);
  const shifted=projectCatalogStar(star,{x:0,y:10,z:0},1);
  assert.ok(shifted.y<-.7);assert.ok(shifted.x>.7);
  assert.equal(projectCatalogStar({...star,dist:null},{x:1,y:0,z:0}),null);
  assert.equal(projectCatalogStar(star,{x:10,y:0,z:0}),null);
});
test('all 88 line figures reference measured HIP stars with a single identity per point',()=>{
  const ids=new Set(BRIGHT_STARS.map(s=>s.hip));assert.equal(ids.size,BRIGHT_STARS.length);
  assert.equal(Object.keys(CONSTELLATION_STAR_IDS).length,88);
  for(const segments of Object.values(CONSTELLATION_STAR_IDS)) for(const pair of segments) for(const id of pair) assert.ok(ids.has(id));
  const elnath=BRIGHT_STARS.find(s=>s.name==='Elnath');
  assert.ok(elnath.ra>5.4&&elnath.ra<5.5);assert.ok(elnath.dec>28&&elnath.dec<29);
});
test('every corridor room wall meets its transverse bulkheads with no open corner seams',()=>{
  for(const deck of SHIP_DECKS) for(const side of ['port','starboard']) {
    const rooms=deck.rooms.filter(r=>r.side===side).sort((a,b)=>a.minZ-b.minZ);
    let previous;
    for(const room of rooms) {
      const span=roomBulkheadSpan(room);
      assert.ok(span.minZ<=room.minZ&&span.maxZ>=room.maxZ);
      if(previous) assert.equal(previous.maxZ,span.minZ,`${deck.id}/${side}/${room.id}`);
      previous=span;
    }
  }
});
