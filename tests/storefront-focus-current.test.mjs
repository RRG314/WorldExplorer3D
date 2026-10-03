import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {storefrontLayout} from '../app/js/world/storefront-layout.js';
import {publishBuildingExteriorDetails,updateBuildingExteriorFocus,clearBuildingExteriorDetails} from '../app/js/world/building-exterior-details.js';
globalThis.THREE=THREE;
const profile={familyId:'mixed_use_storefront',materialId:'brick',windowStyle:'sash',doorStyle:'commercial',storefrontStyle:'canvas_awning',material:{surfacePattern:'brick'},window:{bayWidth:3.4,width:.55,height:.56,floorHeight:3.2},door:{width:1.8},storefront:{glazing:.8},details:['storefront_awning','masonry_cornice']};
function world(){let focus={x:0,z:0};const scene=new THREE.Scene();const meshes=[0,400].map((x,i)=>({position:{y:2},material:{userData:{buildingExterior:true}},userData:{lodTier:i?'mid':'near',sourceBuildingId:`shop${i}`,buildingFootprint:[{x:x-6,z:0},{x:x+6,z:0},{x:x+6,z:-8},{x:x-6,z:-8}],exteriorProfile:profile,bodyHeightMeters:12,levels:3,buildingSeed:i}}));return {scene,c:{_worldLoadSequence:1,buildingMeshes:meshes,buildingEntranceByBuilding:new Map(),addEarthWorldObject:o=>scene.add(o),getEnv:()=> 'EARTH',activeEarthActorPosition:()=>focus},move:p=>{focus=p}};}
test('shop bays share fitted floor elevation, reserve the real entrance and reject inappropriate facades',()=>{
 const p=storefrontLayout({length:12,height:12,levels:3,foundation:1.4,profile,doorAlong:0});assert.ok(p.bays.length>0);assert.ok(p.bays.every(b=>Math.abs(b.along)>b.width/2+1.1));assert.equal(p.foundation,1.4);assert.ok(p.awningY>=3.75);assert.ok(p.bays.every(b=>b.top<1.4+p.floorHeight));
 assert.equal(storefrontLayout({length:12,height:12,profile:{...profile,storefront:{glazing:0}}}),null);assert.equal(storefrontLayout({length:12,height:12,profile:{...profile,material:{surfacePattern:'glass'}}}),null);
});
test('details follow the walker after base batching, replace atomically and leave collision authority unchanged',()=>{
 const {c,scene,move}=world();const colliders=[{}];c.dynamicBuildingColliders=colliders;const frames=[];globalThis.requestAnimationFrame=f=>{frames.push(f);return frames.length};globalThis.cancelAnimationFrame=()=>{};
 publishBuildingExteriorDetails(c);const old=[...c.buildingExteriorDetailMeshes];assert.ok(c.buildingExteriorDetailPublication.modules.shopfront_bay>0);assert.ok(old.length<=6);c.buildingMeshes=[];move({x:400,z:0});updateBuildingExteriorFocus(c);assert.deepEqual(c.buildingExteriorDetailMeshes,old);
 while(frames.length)frames.shift()();assert.equal(c.buildingExteriorDetailPublication.focus.x,400);assert.ok(c.buildingExteriorDetailPublication.modules.fitted_window_frame>0);assert.ok(old.every(m=>!m.parent));assert.equal(c.dynamicBuildingColliders,colliders);assert.ok(scene.children.length<=6);
 move({x:800,z:0});updateBuildingExteriorFocus(c);clearBuildingExteriorDetails(c);while(frames.length)frames.shift()();assert.equal(scene.children.length,0);assert.equal(c.buildingExteriorDetailPublication,null);
});
test('low tier stays empty and world reset cancels an unfinished replacement',()=>{
 const {c,scene,move}=world(),frames=[];globalThis.requestAnimationFrame=f=>{frames.push(f);return frames.length};
 assert.equal(publishBuildingExteriorDetails(c,{tier:'low'}).addedDrawCalls,0);assert.equal(scene.children.length,0);
 publishBuildingExteriorDetails(c);const old=[...scene.children];move({x:400,z:0});updateBuildingExteriorFocus(c);c._worldLoadSequence++;while(frames.length)frames.shift()();assert.deepEqual(scene.children,old);clearBuildingExteriorDetails(c);
});
