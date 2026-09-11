import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {indexMappedGround} from '../app/js/terrain/mapped-ground-evidence.js';
import {ensureTerrainSurfaceMixAttributes,setTerrainSurfaceMaterialMixAt,setNormalizedTerrainAttribute} from '../app/js/terrain/surface-material-blend.js';

class Attribute {
  constructor(array,itemSize,normalized=false){Object.assign(this,{array,itemSize,normalized,count:array.length/itemSize,version:0});}
  set needsUpdate(value){if(value)this.version++;}
  getX(i){return this.array[i*this.itemSize];}
  getZ(i){return this.array[i*this.itemSize+2];}
}
globalThis.THREE={BufferAttribute:Attribute};
const source=readFileSync(new URL('../app/js/terrain/surface-profiles.js',import.meta.url),'utf8');
const cacheCode=source.slice(source.indexOf('let detailedGroundCollection'),source.indexOf('const SNOW_COLOR_HEX'));
const applyCode=source.slice(source.indexOf('export function applyMappedSemanticVertexTints'),source.indexOf('function applyLoadedWorldCoverBaseline')).replace('export function','function');
test('actual terrain publication reapplies mapped cover after baseline reset and a same-count world change',()=>{
  const land=(type)=>({type,pts:[{x:-2,z:-2},{x:2,z:-2},{x:2,z:2},{x:-2,z:2}],bounds:{minX:-2,maxX:2,minZ:-2,maxZ:2}});
  const ctx={LOC:{lat:39,lon:-76},landuses:[land('forest')],worldToLatLon:()=>({lat:39,lon:-76})};
  const context=vm.createContext({appCtx:ctx,THREE:globalThis.THREE,indexMappedGround,ensureTerrainSurfaceMixAttributes,setTerrainSurfaceMaterialMixAt,setNormalizedTerrainAttribute});
  vm.runInContext(cacheCode+applyCode+';this.apply=applyMappedSemanticVertexTints;',context);
  const geometry={attributes:{position:new Attribute(new Float32Array([0,0,0]),3)},setAttribute(name,value){this.attributes[name]=value;}};
  const mesh={geometry,position:{x:0,z:0},material:{},userData:{}};
  assert.equal(context.apply(mesh,null),1);
  assert.equal(geometry.attributes.terrainSurfaceMixA.array[2],255);
  geometry.attributes.terrainSurfaceMixA.array.fill(0);
  geometry.attributes.terrainSurfaceMixA.needsUpdate=true;
  assert.equal(context.apply(mesh,null),1);
  assert.equal(geometry.attributes.terrainSurfaceMixA.array[2],255,'cached lookup must reapply erased weights');
  ctx.landuses[0]=land('sand');ctx.LOC={lat:20,lon:8};
  context.apply(mesh,null);
  assert.equal(geometry.attributes.terrainSurfaceMixA.array[1],255,'same-size reused collection must not retain old-world forest');
  assert.equal(geometry.attributes.terrainSurfaceMixA.array[2],0);
});
