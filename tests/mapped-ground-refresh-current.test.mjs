import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {currentMappedGroundIndex} from '../app/js/terrain/mapped-ground-evidence.js';
import {applyMappedSemanticVertexTints,resetTerrainSurfaceProfileCache} from '../app/js/terrain/surface-profiles.js';

class Attribute {
  constructor(array,itemSize,normalized=false){Object.assign(this,{array,itemSize,normalized,count:array.length/itemSize,version:0});}
  set needsUpdate(value){if(value)this.version++;}
  getX(i){return this.array[i*this.itemSize];}
  getZ(i){return this.array[i*this.itemSize+2];}
}
globalThis.THREE={BufferAttribute:Attribute};
test('actual terrain publication reapplies mapped cover after baseline reset and a same-count world change',()=>{
  const land=(type)=>({type,pts:[{x:-2,z:-2},{x:2,z:-2},{x:2,z:2},{x:-2,z:2}],bounds:{minX:-2,maxX:2,minZ:-2,maxZ:2}});
  Object.assign(ctx,{LOC:{lat:39,lon:-76},landuses:[land('forest')],worldToLatLon:()=>({lat:39,lon:-76})});
  resetTerrainSurfaceProfileCache();
  const geometry={attributes:{position:new Attribute(new Float32Array([0,0,0]),3)},setAttribute(name,value){this.attributes[name]=value;}};
  const mesh={geometry,position:{x:0,z:0},material:{},userData:{}};
  assert.equal(applyMappedSemanticVertexTints(mesh,null),1);
  assert.equal(geometry.attributes.terrainSurfaceMixA.array[2],255);
  geometry.attributes.terrainSurfaceMixA.array.fill(0);
  geometry.attributes.terrainSurfaceMixA.needsUpdate=true;
  assert.equal(applyMappedSemanticVertexTints(mesh,null),1);
  assert.equal(geometry.attributes.terrainSurfaceMixA.array[2],255,'cached lookup must reapply erased weights');
  ctx.landuses[0]=land('sand');ctx.LOC={lat:20,lon:8};
  applyMappedSemanticVertexTints(mesh,null);
  assert.equal(geometry.attributes.terrainSurfaceMixA.array[1],255,'same-size reused collection must not retain old-world forest');
  assert.equal(geometry.attributes.terrainSurfaceMixA.array[2],0);
  const previousIndex=currentMappedGroundIndex(ctx);
  resetTerrainSurfaceProfileCache();
  assert.notEqual(currentMappedGroundIndex(ctx),previousIndex);
  applyMappedSemanticVertexTints(mesh,null);
  assert.equal(geometry.attributes.terrainSurfaceMixA.array[1],255);
});
