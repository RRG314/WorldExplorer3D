import test from 'node:test';
import assert from 'node:assert/strict';
import {compileEngineeredWaterfront,publishEngineeredWaterfront,engineeredWaterfrontFor,clearEngineeredWaterfront} from '../app/js/world/engineered-waterfront.js';
import {waterTerrainBedY} from '../app/js/terrain/water-terrain-mask.js';
import * as THREE from 'three';
import {publishWaterfrontWalls} from '../app/js/world/waterfront-visual.js';
import {applyTerrainPortalMasksForContext,terrainHeightWithPortalCuts} from '../app/js/terrain/structure-terrain-portals.js';
const area=(x0,x1)=>({pts:[{x:x0,z:0},{x:x1,z:0},{x:x1,z:100},{x:x0,z:100}],holes:[]});
const reviewed=()=>({lat:39.285,lon:-76.61});
test('natural shorelines retain their bank and internal water tile seams never become walls',()=>{
 const a=area(0,100),b=area(100,200);
 assert.equal(compileEngineeredWaterfront({areas:[a,b]}).segments.length,0);
 const quay=compileEngineeredWaterfront({areas:[a,b],worldToLatLon:reviewed});
 assert.ok(quay.segments.length>0);
 assert.equal(quay.segments.some(s=>s.a.x===100&&s.b.x===100),false);
 assert.equal(quay.bedDepthAt(a,50,50),0);
 assert.ok(quay.bedDepthAt(a,1,50)>2.9);
});
test('mapped quays outside the reviewed harbor get treatment only on the mapped edge',()=>{
 const a=area(0,100),quay=compileEngineeredWaterfront({areas:[a],facilities:[{id:'quay',type:'quay',geometry:{kind:'line',points:[{x:0,z:0},{x:100,z:0}]}}]});
 assert.equal(quay.segments.length,5);
 assert.ok(quay.segments.every(s=>s.a.z===0&&s.b.z===0));
 assert.ok(quay.segments.every(s=>s.nz<0));
});
test('world reset releases the old waterfront owner',()=>{
 const ctx={waterAreas:[area(0,100)],worldToLatLon:reviewed};
 publishEngineeredWaterfront(ctx);assert.ok(engineeredWaterfrontFor(ctx));
 clearEngineeredWaterfront(ctx);assert.equal(engineeredWaterfrontFor(ctx),null);
});
test('a quay removes the coarse wet-side bank without changing dry land or tunnel cuts',()=>{
 globalThis.THREE=THREE;
 const a={...area(0,100),surfaceY:0},scene=new THREE.Scene();
 const tunnel={x:200,z:200,tangentX:1,tangentZ:0,halfWidth:4,halfDepth:10,roadY:-2,cutHeight:8};
 const ctx={waterAreas:[a],worldToLatLon:reviewed,elevationWorldYAtWorldXZ:()=>2,streetFurnitureMeshes:[],dynamicBuildingColliders:[],structureTerrainPortalDescriptors:[tunnel],addEarthWorldObject:m=>scene.add(m)};
 publishEngineeredWaterfront(ctx);publishWaterfrontWalls(ctx,THREE);
 assert.ok(ctx.structureTerrainPortalDescriptors.includes(tunnel));
 assert.equal(terrainHeightWithPortalCuts(ctx.structureTerrainPortalDescriptors,50,2,1),-3);
 assert.equal(terrainHeightWithPortalCuts(ctx.structureTerrainPortalDescriptors,50,-2,2),2);
 assert.equal(terrainHeightWithPortalCuts(ctx.structureTerrainPortalDescriptors,200,200,1),-2);
 const n=ctx.structureTerrainPortalDescriptors.length;
 applyTerrainPortalMasksForContext(ctx,ctx.structureTerrainPortalDescriptors);assert.equal(ctx.structureTerrainPortalDescriptors.length,n);
 applyTerrainPortalMasksForContext(ctx,[tunnel]);assert.equal(ctx.structureTerrainPortalDescriptors.length,n,'Later tunnel/terrain publication preserves quay cuts');
 assert.ok(waterTerrainBedY(a,50,2,1,2,undefined,3)<-2.9);
 clearEngineeredWaterfront(ctx);applyTerrainPortalMasksForContext(ctx,[tunnel]);assert.deepEqual(ctx.structureTerrainPortalDescriptors,[tunnel]);
 scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});delete globalThis.THREE;
});
