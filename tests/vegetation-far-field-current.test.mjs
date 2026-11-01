import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {semanticForestWeightAt,terrainVegetationBounds} from '../app/js/world/vegetation-spatial.js';

function fixture(){
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute([100,0,200,120,0,200,100,0,220,120,0,220,110,0,210],3));
 geometry.setAttribute('terrainSurfaceMixA',new T.BufferAttribute(new Uint8Array([0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,0]),4,true));
 const point=i=>({x:geometry.attributes.position.getX(i),y:0,z:geometry.attributes.position.getZ(i),vertexIndex:i}),
  grid={xValues:[100,120],zValues:[200,220],worldYs:new Float32Array(4),boundaryTriangles:new Map([[0,[[0,2,4],[2,3,4],[3,1,4],[1,0,4]].map(ids=>ids.map(point))]]),detailedCoverage:[]},
  mesh={geometry,position:{x:0,y:0,z:0},userData:{isFarTerrainClipmap:true}};
 return {geometry,mesh,grid};
}
test('far semantic forest reads the published irregular field instead of requiring PlaneGeometry parameters',()=>{
 const {geometry,mesh,grid}=fixture();
 assert.deepEqual(terrainVegetationBounds(mesh,grid),{minX:100,maxX:120,minZ:200,maxZ:220});
 assert.equal(semanticForestWeightAt(mesh,100,200,grid),1);
 assert.equal(semanticForestWeightAt(mesh,110,210,grid),0,'the actual adaptive centre clearing cannot be replaced by the four old corner values');
 assert.equal(semanticForestWeightAt(mesh,90,200,grid),0);
 geometry.dispose();
});
test('detailed holes and unavailable triangle identity cannot plant a far-field forest',()=>{
 const {geometry,mesh,grid}=fixture();
 grid.detailedCoverage=[{minX:100,maxX:120,minZ:200,maxZ:220}];assert.equal(semanticForestWeightAt(mesh,100,200,grid),0);
 grid.detailedCoverage=[];grid.boundaryTriangles.get(0).splice(1);assert.equal(semanticForestWeightAt(mesh,119,201,grid),0,'no corner fallback through a partial detailed-tile hole');
 for(const p of grid.boundaryTriangles.get(0)[0])delete p.vertexIndex;
 assert.equal(semanticForestWeightAt(mesh,101,205,grid),0);assert.equal(semanticForestWeightAt(mesh,100,200),0);
 geometry.dispose();
});
test('unrefined far cells use the published triangle split rather than bilinear forest coverage',()=>{
 const {geometry,mesh,grid}=fixture();grid.boundaryTriangles.clear();geometry.attributes.terrainSurfaceMixA.array[14]=0;
 assert.equal(semanticForestWeightAt(mesh,105,205,grid),1);assert.equal(semanticForestWeightAt(mesh,115,215,grid),.5);geometry.dispose();
});
