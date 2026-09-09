import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wallDirections} from '../app/js/reality-capture/orientation.js';
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
