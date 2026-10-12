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

test('regional land-use colors and holes agree through spatial buckets at temperate and polar latitudes',async()=>{
 const {latLonToTileXY}=await import('../app/js/terrain/tile-coordinates.js?v=1');
 for(const latitude of [39,-25,84.2])for(const spatial of [false,true]){
  const longitude=20,coordinate=(x,z)=>({lat:latitude+z*.0001,lon:longitude+x*.0001});
  const outer=[[-.00055,-.00055],[.00055,-.00055],[.00055,.00055],[-.00055,.00055]].map(([x,z])=>[longitude+x,latitude+z]);
  const hole=[[-.00005,-.00005],[.00005,-.00005],[.00005,.00005],[-.00005,.00005]].map(([x,z])=>[longitude+x,latitude+z]);
  const bounds={minLon:longitude-.00055,maxLon:longitude+.00055,minLat:latitude-.00055,maxLat:latitude+.00055};
  const area={outer,holes:[hole],bounds,tint:[64/255,128/255,192/255],mode:'forest'};
  const landAreasByTile=new Map(),landAreaSpatialByTile=new Map(),vertices=[];
  for(let z=-4;z<=4;z+=2)for(let x=-4;x<=4;x+=2){
   vertices.push(x,0,z);const p=coordinate(x,z),tile=latLonToTileXY(p.lat,p.lon,14),key=`14/${tile.x}/${tile.y}`;
   landAreasByTile.set(key,[area]);
   if(spatial)landAreaSpatialByTile.set(key,{bounds,latSpan:bounds.maxLat-bounds.minLat,lonSpan:bounds.maxLon-bounds.minLon,size:2,cells:Array.from({length:4},()=>[area])});
  }
  Object.assign(ctx,{LOC:{lat:latitude,lon:longitude},landuses:[],roads:[],buildings:[],waterAreas:[],linearFeatures:[],worldToLatLon:coordinate});resetTerrainSurfaceProfileCache();
  const geometry={attributes:{position:new Attribute(new Float32Array(vertices),3)},setAttribute(name,value){this.attributes[name]=value;}};
  const mesh={geometry,position:{x:0,z:0},material:{},userData:{}};
  assert.equal(applyMappedSemanticVertexTints(mesh,{contextZoom:14,landAreasByTile,landAreaSpatialByTile}),24);
  for(let i=0;i<25;i++){
   assert.deepEqual([...geometry.attributes.color.array.slice(i*3,i*3+3)],i===12?[255,255,255]:[64,128,192]);
   assert.equal(geometry.attributes.terrainSurfaceMixA.array[i*4+2],i===12?0:255);
  }
 }
});
