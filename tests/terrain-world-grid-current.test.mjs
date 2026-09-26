import test from 'node:test';
import assert from 'node:assert/strict';
import {setTerrainWorldGrid,terrainGridInterval} from '../app/js/terrain/world-grid.js';
import {createPavementTerrainPartition} from '../app/js/world/pavement-terrain-partition.js';
function mesh(minX,maxX,minZ,maxZ,segments=1){
 const array=new Float32Array((segments+1)**2*3);
 const position={array,setX:(i,v)=>array[i*3]=v,setZ:(i,v)=>array[i*3+2]=v};
 setTerrainWorldGrid(position,segments,{x:minX,z:minZ},{x:maxX,z:minZ},{x:minX,z:maxZ});
 return {visible:true,position:{x:0,y:0,z:0},userData:{isTerrainMesh:true},geometry:{parameters:{widthSegments:segments},attributes:{position}}};
}
test('captured San Francisco overlap is rejected; shared world-frame boundary conserves its pavement area',()=>{
 // Largest failing triangle from sf-startup-partition-triangles.json. Two
 // independently rounded tile frames placed the shared edge at these values.
 const triangle=[376,0,-164,372.701,0,-168,373.201,0,-164];
 const old=createPavementTerrainPartition([mesh(370,373.94281005859375,-170,-160),mesh(373.9427795410156,380,-170,-160)]);
 assert.equal(old(triangle,()=>0),null);assert.ok(old.lastCoverage.difference>7e-5);old.dispose();
 const boundary=(373.94281005859375+373.9427795410156)/2;
 const fixed=createPavementTerrainPartition([mesh(370,boundary,-170,-160),mesh(boundary,380,-170,-160)]);
 assert.ok(fixed(triangle,()=>0));assert.ok(Math.abs(fixed.lastCoverage.difference)<1e-10);fixed.dispose();
});
for(const origin of [-20000.123,373.942795,15000.003])test(`adjacent world grids share every boundary station at ${origin}`,()=>{
 const boundary=origin+781.234567,n=16;
 const a=mesh(origin,boundary,-417.126,391.819,n),b=mesh(boundary,boundary+781.237,-417.126,391.819,n);
 for(let row=0;row<=n;row++){
  const ai=(row*(n+1)+n)*3,bi=row*(n+1)*3;
  assert.equal(a.geometry.attributes.position.array[ai],b.geometry.attributes.position.array[bi]);
  assert.equal(a.geometry.attributes.position.array[ai+2],b.geometry.attributes.position.array[bi+2]);
 }
});
test('contact interval follows nonuniform Float32 stations on both axes',()=>{
 const n=16,m=mesh(20000.123,20001.123,-20001.123,-20000.123,n),a=m.geometry.attributes.position.array;
 for(const [step,component] of [[3,0],[(n+1)*3,2]])for(let i=0;i<n;i++){
  const lo=a[i*step+component],hi=a[(i+1)*step+component];
  assert.equal(terrainGridInterval(a,n,step,component,lo),i);
  assert.equal(terrainGridInterval(a,n,step,component,hi-1e-8),i);
 }
});
