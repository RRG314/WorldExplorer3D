import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wallDirections} from '../app/js/reality-capture/orientation.js';
import {exteriorPhotoGeometry} from '../functions/exterior-photo-geometry.mjs';
const pts=[{x:-5,z:-3},{x:5,z:-3},{x:5,z:3},{x:-5,z:3}];
test('canonical east/south frame labels walls without changing identity',()=>{
 const copy=structuredClone(pts);assert.deepEqual(wallDirections(pts).map(x=>x.compass),['N','E','S','W']);assert.deepEqual(pts,copy);
});
test('reversed provider winding still points outward',()=>{
 assert.deepEqual(wallDirections([...pts].reverse()).map(x=>x.compass),['S','E','N','W']);
});
test('rotated footprint produces rotated bearings, not rectangle assumptions',()=>{
 const a=Math.PI/4,rotated=pts.map(p=>({x:p.x*Math.cos(a)-p.z*Math.sin(a),z:p.x*Math.sin(a)+p.z*Math.cos(a)}));
 assert.deepEqual(wallDirections(rotated).map(x=>x.compass),['NE','SE','SW','NW']);
});
test('V2 image-left is screen-left from outside for every wall and both windings',()=>{
 for(const ring of [pts,[...pts].reverse()])for(const d of wallDirections(ring)){
   const g=exteriorPhotoGeometry(ring,6,{wall:d.wall,region:[.1,0,.9,1],orientationVersion:2});
   const screenX=i=>g.positions[i*3]*d.normal.z-g.positions[i*3+2]*d.normal.x;
   const left=screenX(0)<screenX(1)?0:1,right=1-left;
   assert.equal(g.uv[left*2],0);assert.equal(g.uv[right*2],1);
 }
});
test('legacy approved geometry remains unchanged without opt-in V2',()=>{
 const g=exteriorPhotoGeometry(pts,6,{wall:0,region:[0,0,1,1]});
 assert.deepEqual(g.uv,[0,0,1,0,1,1,0,1]);
});
