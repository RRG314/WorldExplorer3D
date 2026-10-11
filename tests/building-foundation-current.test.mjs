import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBuildingFoundation} from '../app/js/world/building-foundation.js';
import * as THREE from 'three';
import {createBuildingGroundPatch} from '../app/js/engine/materials-runtime.js';
const foundation=values=>resolveBuildingFoundation({elevationValues:values,medianElevation:values[Math.floor((values.length-1)/2)]||0,height:32,footprintWidth:40,footprintDepth:40});
test('steep accepted relief has no unsupported downhill gap and retains the high-side floor',()=>{
 for(const relief of [4,12,20,30]){
  const f=foundation([100,100,100+relief/2,100+relief,100+relief]);
  assert.ok(Math.abs(f.baseElevationRaw-f.minElevation-.03)<1e-9);
  assert.ok(Math.abs(f.baseElevationRaw+f.terrainFoundationRise-f.maxElevation-.03)<1e-9);
  assert.equal(f.terrainFoundationRise,relief);
 }
});
test('flat ground gains no new layer; outliers retain the existing robust envelope',()=>{
 const flat=foundation([100,100,100,100]);assert.equal(flat.terrainFoundationRise,0);assert.equal(flat.baseElevationRaw,100);
 const noisy=foundation([-999,99,100,100,100,100,101,999]);assert.ok(noisy.slopeRange<=36);
});
test('rendered building ground computes an omitted footprint area in either winding',()=>{
 const previous=globalThis.THREE;globalThis.THREE=THREE;
 const points=[{x:0,z:0},{x:20,z:0},{x:20,z:10},{x:0,z:10}];
 const context={appCtx:{terrainMeshHeightAt:()=>0},state:{pbrTexturesLoaded:{}}};
 const meshes=[];
 try{
  for(const footprint of [points,[...points].reverse()]){
   const inferred=createBuildingGroundPatch(context,footprint,0,{allowApron:true});
   const explicit=createBuildingGroundPatch(context,footprint,0,{allowApron:true,footprintArea:200});
   meshes.push(...[].concat(inferred,explicit));
   const geometry=root=>{const list=[];for(const mesh of [].concat(root))mesh.traverse(o=>{if(o.geometry)list.push([...o.geometry.attributes.position.array]);});return list;};
   assert.deepEqual(geometry(inferred),geometry(explicit));
  }
 }finally{for(const root of meshes)root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});if(previous===undefined)delete globalThis.THREE;else globalThis.THREE=previous;}
});
