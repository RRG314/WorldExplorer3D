import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {vegetationModelKind} from '../app/js/world/vegetation-models.js';
import {nearbyVegetationObstacles} from '../app/js/world/vegetation-obstacle-index.js';
import {terrainSurfaceClassForWorldCover,terrainSurfaceMixForClass,TERRAIN_SURFACE_CLASS} from '../app/js/terrain/surface-material-blend.js';
test('mapped foliage and cold forests choose matching forms, wetlands are not forest',()=>{
 assert.equal(vegetationModelKind({leafType:'needleleaved'},'temperate-forest'),'pine');
 assert.equal(vegetationModelKind({leafType:'broadleaved'},'temperate-forest'),'broadleaf');
 assert.equal(vegetationModelKind({},'boreal-forest'),'pine');
 assert.equal(vegetationModelKind({source:'worldcover'},'tundra'),'shrub');
 assert.equal(vegetationModelKind({landuseType:'scrub'}),'shrub');
 assert.equal(terrainSurfaceClassForWorldCover('wetland'),TERRAIN_SURFACE_CLASS.wetland);
 assert.equal(vegetationModelKind({landuseType:'wetland',scale:.77}),'shrub');
 assert.equal(terrainSurfaceClassForWorldCover('mangrove'),TERRAIN_SURFACE_CLASS.forest);
 const moss=terrainSurfaceMixForClass(terrainSurfaceClassForWorldCover('moss'));
 assert.equal(moss.mixA[2],0);assert.equal(moss.mixA[3]+moss.mixB[0],1);
});
test('curated trunk dimensions feed existing index; soft plants do not block movement',()=>{
 const ctx={vegetationFeatures:[{x:0,z:0,baseY:2,trunkRadius:.2,trunkHeight:3},{x:4,z:0,baseY:2,trunkRadius:0}]};
 const obstacles=nearbyVegetationObstacles(ctx,0,0,8);
 assert.equal(obstacles.length,1);assert.equal(obstacles[0].minX,-.2);assert.equal(obstacles[0].maxY,5);
});
test('local GLBs are self-contained, bounded, and distant geometry actually has fewer triangles',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../app/assets/models/nature/asset-manifest.json',import.meta.url)));
 const io=new NodeIO();
 for(const asset of manifest.assets) {
  const counts=[];
  for(const suffix of (['pine','broadleaf'].includes(asset.id) ? ['', '-lod'] : [''])) {
   const bytes=await readFile(new URL(`../app/assets/models/nature/${asset.id}${suffix}.glb`,import.meta.url));
   assert.ok(bytes.length<1200000);
   const doc=await io.readBinary(bytes);
   counts.push(doc.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((s,p)=>s+p.getIndices().getCount()/3,0),0));
   assert.ok(doc.getRoot().listTextures().every(t=>t.getImage()?.length>0));
  }
  if(counts.length===2) assert.ok(counts[1]<counts[0],`${asset.id} requires actual lower detail`);
 }
});
