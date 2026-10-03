import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {rebalanceHiddenPedestrian} from '../app/js/living-world/population.js';
import {mappedFrontageLabel,createFrontageSigns} from '../app/js/world/storefront-signs.js';
import {shouldRenderRoadCenterMarkings} from '../app/js/terrain/rebuild.js';
const edge=(x,role='sidewalk')=>({p1:{x,y:3,z:0},p2:{x:x+20,y:3,z:0},length:20,role});
const actor=()=>({id:'a',edgeIndex:0,progress:10,visibility:1,relocationCooldown:0});
test('street population redistributes off-camera actors without moving visible, selected or nearby people',()=>{
 const graph={edges:[edge(700),edge(80)]},a=actor();
 assert.equal(rebalanceHiddenPedestrian([a],graph,{x:0,z:0},()=>.6,{canAppearAt:()=>false}),false);assert.equal(a.edgeIndex,0);
 a.promoted=true;assert.equal(rebalanceHiddenPedestrian([a],graph,{x:0,z:0},()=>.6,{canAppearAt:()=>true}),false);a.promoted=false;
 assert.equal(rebalanceHiddenPedestrian([a],graph,{x:0,z:0},()=>.6,{canAppearAt:()=>true}),true);assert.equal(a.edgeIndex,1);assert.equal(a.visibility,0);assert.ok(a.relocationCooldown>1);
});
test('repopulation rejects crossing spawns and occupied sidewalk space',()=>{
 const a=actor(),graph={edges:[edge(700),edge(80,'crossing')]};assert.equal(rebalanceHiddenPedestrian([a],graph,{x:0,z:0},()=>.6,{canAppearAt:()=>true}),false);
 graph.edges[1]=edge(80);const b={...actor(),id:'b',edgeIndex:1};assert.equal(rebalanceHiddenPedestrian([a,b],graph,{x:0,z:0},()=>.6,{canAppearAt:()=>true}),false);
});
test('mapped signs retain provenance, bound their atlas and reject generic or unnamed labels',()=>{
 assert.equal(mappedFrontageLabel('retail'),'');assert.equal(mappedFrontageLabel('  A\nNamed Place '),'A Named Place');
 const canvas={getContext:()=>({fillRect(){},strokeRect(){},measureText:s=>({width:s.length*12}),fillText(){}})};
 const mesh=createFrontageSigns(Array.from({length:40},(_,i)=>({name:i?'Mapped Library':'',length:8,sourceBuildingId:String(i),x:i*10,z:0,y:3,normalX:0,normalZ:1})),{THREE,document:{createElement:()=>canvas}});
 assert.equal(mesh.userData.labels.length,24);assert.equal(mesh.geometry.index.count,144);assert.equal(canvas.width*canvas.height,524288);assert.equal(mesh.userData.labels[0].sourceBuildingId,'1');assert.equal(mesh.material.map,mesh.material.emissiveMap);assert.equal(mesh.material.userData.ownsFrontageAtlas,true);
 mesh.geometry.dispose();mesh.material.map.dispose();mesh.material.dispose();
});
test('urban center paint requires a mapped multi-lane road and excludes elevated geometry',()=>{
 for(const type of ['secondary','tertiary']){
 assert.equal(shouldRenderRoadCenterMarkings({type}),false);assert.equal(shouldRenderRoadCenterMarkings({type,transportRecord:{crossSection:{lanes:1}}}),false);
 const road={type,transportRecord:{crossSection:{lanes:2}}};assert.equal(shouldRenderRoadCenterMarkings(road),true);assert.equal(shouldRenderRoadCenterMarkings({...road,structureSemantics:{terrainMode:'elevated'}}),false);
 }
 assert.equal(shouldRenderRoadCenterMarkings({type:'footway',transportRecord:{crossSection:{lanes:2}}}),false);
});

test('finite pedestrian graph priority includes both origin and authored district neighborhoods',async()=>{
 const {prioritizePedestrianNeighborhoods}=await import('../app/js/living-world/navigation-graphs.js');
 const segments=Array.from({length:100},(_,i)=>edge(i*10));
 const order=prioritizePedestrianNeighborhoods(segments,[{x:900,z:0}]);
 assert.ok(order.slice(0,10).some(e=>e.p1.x>850));assert.ok(order.slice(0,10).some(e=>e.p1.x<50));assert.equal(new Set(order).size,100);
});
