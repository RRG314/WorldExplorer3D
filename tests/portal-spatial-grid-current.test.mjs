import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPortalSpatialGrid} from '../app/js/terrain/portal-spatial-grid.js';
import {terrainPointRemovedByPortal} from '../app/js/terrain/structure-terrain-portals.js';
function candidates(grid,p){
 const x=Math.floor(p.x/grid.cellSize)-grid.minX,z=Math.floor(p.z/grid.cellSize)-grid.minZ;
 if(x<0||z<0||x>=grid.width||z>=grid.height)return [];
 const cell=(z*grid.width+x)*4,start=grid.lookup[cell],count=grid.lookup[cell+1];
 return Array.from({length:count},(_,i)=>grid.references[(start+i)*4]);
}
test('spatial candidates preserve rotated, sloped and overlapping aperture decisions',()=>{
 const masks=Array.from({length:160},(_,i)=>({x:(i%16)*151-1100,z:Math.floor(i/16)*173-900,tangentX:Math.cos(i),tangentZ:Math.sin(i),roadY:i%7,grade:.13,halfWidth:8,halfDepth:30,cutHeight:6}));
 const grid=buildPortalSpatialGrid(masks);
 assert.ok(grid.maxCount<10,'separated openings must not scan the whole city');
 for(const m of masks)for(const along of [-30,-29,0,29,30])for(const across of [-8,-7,0,7,8])for(const y of [0,4,12]){
  const p={x:m.x+along*m.tangentX-across*m.tangentZ,z:m.z+along*m.tangentZ+across*m.tangentX,y};
  assert.equal(candidates(grid,p).some(i=>terrainPointRemovedByPortal(masks[i],p)),masks.some(a=>terrainPointRemovedByPortal(a,p)));
 }
 const coincident=Array.from({length:80},()=>masks[0]),dense=buildPortalSpatialGrid(coincident);
 assert.equal(candidates(dense,masks[0]).length,80,'no former 32-opening truncation');
});
test('wide geographic bounds coarsen without losing apertures and empty maps stay valid',()=>{
 const masks=[-1e6,1e6].map(x=>({x,z:x,tangentX:1,tangentZ:0,roadY:0,halfWidth:4,halfDepth:5,cutHeight:6}));
 const grid=buildPortalSpatialGrid(masks);assert.ok(grid.width<=512&&grid.height<=512);
 for(let i=0;i<2;i++)assert.ok(candidates(grid,masks[i]).includes(i));
 assert.deepEqual(candidates(buildPortalSpatialGrid([]),{x:0,z:0}),[]);
});
