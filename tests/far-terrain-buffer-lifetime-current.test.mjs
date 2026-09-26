import test from 'node:test';
import assert from 'node:assert/strict';
import {createFarFieldGeometryPlanner,sampleFarFieldGridWorldY} from '../app/js/terrain/far-field-geometry.js';

test('far terrain seam refresh uses published geometry after construction arrays are released',async t=>{
 const old=globalThis.THREE;t.after(()=>{globalThis.THREE=old;});
 class Attribute{
  constructor(array,itemSize,normalized=false){this.array=ArrayBuffer.isView(array)?array:Float32Array.from(array);this.itemSize=itemSize;this.count=this.array.length/itemSize;this.normalized=normalized;}
  getX(i){return this.array[i*this.itemSize];}getY(i){return this.array[i*this.itemSize+1];}getZ(i){return this.array[i*this.itemSize+2];}setY(i,y){this.array[i*this.itemSize+1]=y;}
 }
 class Geometry{constructor(){this.attributes={};}setAttribute(k,v){this.attributes[k]=v;}setIndex(i){this.index=Uint32Array.from(i);}computeVertexNormals(){}computeBoundingSphere(){}}
 globalThis.THREE={BufferGeometry:Geometry,Float32BufferAttribute:Attribute,BufferAttribute:Attribute};
 const vertices=[];for(let z=0;z<=20;z+=10)for(let x=0;x<=20;x+=10)vertices.push(x,10+x*.1,z);
 const near={visible:true,userData:{isTerrainMesh:true},position:{x:0,y:0,z:0},geometry:{attributes:{position:new Attribute(vertices,3)}}};
 const planner=createFarFieldGeometryPlanner({appCtx:{terrainGroup:{children:[near]},WORLD_UNITS_PER_METER:1,TERRAIN_Y_EXAGGERATION:1},farFieldGridIntervalMeters:20,farFieldGapFillIntervalMeters:20,worldToLatLon:(x,z)=>({lat:z,lon:x}),sampleAcceptedGroundAtLatLon:()=>({status:'available',groundElevationMeters:10}),latLonToTileXY:()=>({x:0,y:0})});
 const bounds={minX:0,maxX:20,minZ:0,maxZ:20};
 const built=await planner.buildFarFieldGeometry({outer:{minX:-20,maxX:40,minZ:-20,maxZ:40},inner:bounds,detailedCoverage:[bounds]},new Map(),0,{contextZoom:0,waterAreas:[]});
 assert.ok(built.geometry.attributes.position.array.length>0);assert.ok(built.coverage.boundaryAdditionalVertices>0);
 const before=sampleFarFieldGridWorldY(-1,10,built.surfaceGrid);
 for(let i=0;i<near.geometry.attributes.position.count;i++)near.geometry.attributes.position.setY(i,near.geometry.attributes.position.getY(i)+5);
 assert.ok(built.refreshBoundaryHeights([near])>0);
 const after=sampleFarFieldGridWorldY(-1,10,built.surfaceGrid);
 assert.ok(Number.isFinite(before));assert.ok(after>before+3);
 assert.equal(built.refreshBoundaryHeights([near]),0,'unchanged seams do not rewrite geometry');
});
