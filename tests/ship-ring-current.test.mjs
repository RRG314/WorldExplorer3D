import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SHIP_DECKS} from '../app/js/expedition/ship-layout.js';
import {ringRoute,pointInRoom,polar} from '../app/js/expedition/ship-ring-plan.js';
import {buildRingDeck} from '../app/js/expedition/ship-ring-scene.js';
import {createBuildingCollisionQuery} from '../app/js/physics/building-collision.js';
import {podBayCycle} from '../app/js/expedition/pod-bay-cycle.js';

for(const deck of SHIP_DECKS)test(`${deck.id}: real rendered walls admit room-to-room routes and block closed doors`,()=>{
 const surface=new THREE.MeshBasicMaterial();
 const state=buildRingDeck(THREE,deck,{
  surface:()=>surface,material:()=>surface,accent:()=>0xffffff,label:()=>null,details:()=>{},propColliders:()=>{},
  box(group,size,p,material,name){const mesh=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z),material);mesh.position.set(p.x,p.y,p.z);mesh.name=name;group.add(mesh);return mesh;}
 });
 const ctx={dynamicBuildingColliders:state.colliders,pointInPolygon:(x,z,pts)=>pointInRoom({x,z},{polygon:pts})};
 const collision=createBuildingCollisionQuery(ctx);
 const blocked=p=>collision(p.x,p.z,.32,{actorBaseY:0,actorHeight:1.8}).collision;
 for(const a of deck.rooms)for(const b of deck.rooms){
  const route=ringRoute(a.center,b.center,a,b);
  for(let i=1;i<route.length;i++){
   const start=route[i-1],end=route[i],steps=Math.ceil(Math.hypot(end.x-start.x,end.z-start.z)/.15);
   for(let j=0;j<=steps;j++){
    const p={x:start.x+(end.x-start.x)*j/steps,z:start.z+(end.z-start.z)*j/steps};
    assert.equal(blocked(p),false,`${a.id} → ${b.id}: ${JSON.stringify(p)}`);
   }
  }
 }
 for(const door of state.doorStates){
  ctx.dynamicBuildingColliders=[...state.colliders,door.collider];
  assert.equal(blocked(door),true,door.id);
 }
 ctx.dynamicBuildingColliders=state.colliders;
 assert.equal(blocked(polar(39,Math.PI/8)),true,'pressure hull');
 state.group.traverse(o=>o.geometry?.dispose());surface.dispose();
});
test('launch interlock opens the exterior door only after sealing and atmosphere recovery',()=>{
 assert.equal(podBayCycle(0).id,'boarding');
 assert.equal(podBayCycle(2).id,'sealing');
 assert.equal(podBayCycle(4).doorFraction,0);
 assert.equal(podBayCycle(6).doorFraction,.5);
 assert.equal(podBayCycle(7.5).complete,false);
 assert.equal(podBayCycle(8).complete,true);
});
