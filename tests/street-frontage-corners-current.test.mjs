import test from 'node:test';
import assert from 'node:assert/strict';
import {frontageCornerRegions} from '../app/js/world/compiler/street-frontage-corners.js';
import {pavementPartitionDifference} from '../scripts/verification/street-layout-replay.mjs';
const rect=(x,z,w,h)=>[[[x,z],[x+w,z],[x+w,z+h],[x,z+h],[x,z]]];
const wall=rect(-20,-20,20,20);
const paving=[rect(-20,0,20,5),rect(0,-20,5,20)];
const curbs=[{a:{x:-25,z:5},b:{x:15,z:5}},{a:{x:5,z:-25},b:{x:5,z:15}}];
const area=polys=>polys.reduce((sum,p)=>sum+Math.abs(p[0].slice(1).reduce((s,v,i)=>s+p[0][i][0]*v[1]-v[0]*p[0][i][1],0))/2,0);
test('a corner joins two supported facades to their actual curbs',()=>{
 const corners=frontageCornerRegions([wall],paving,curbs,1);
 assert.equal(corners.length,1);assert.equal(area(corners),25);
});
test('missing facade paving or curb evidence cannot invent a corner plaza',()=>{
 assert.equal(frontageCornerRegions([wall],paving.slice(0,1),curbs,1).length,0);
 assert.equal(frontageCornerRegions([wall],paving,curbs.slice(0,1),1).length,0);
 assert.equal(frontageCornerRegions([wall],[],curbs,1).length,0);
});
test('corner construction survives ring reversal, rotation and physical scale',()=>{
 for(const angle of [0,.7,2.3])for(const scale of [.5,1,2]){
  const point=([x,z])=>[1000+(x*Math.cos(angle)-z*Math.sin(angle))/scale,-800+(x*Math.sin(angle)+z*Math.cos(angle))/scale];
  const poly=p=>p.map(r=>r.map(point));
  const edges=curbs.map(e=>{const a=point([e.a.x,e.a.z]),b=point([e.b.x,e.b.z]);return {a:{x:a[0],z:a[1]},b:{x:b[0],z:b[1]}};});
  for(const reverse of [false,true]){
   const building=poly(wall);if(reverse)building[0].reverse();
   const corners=frontageCornerRegions([building],paving.map(poly),edges,scale);
   assert.equal(corners.length,1);assert.ok(Math.abs(area(corners)*scale*scale-25)<1e-7);
  }
 }
});
test('partition checker distinguishes rounding from a real missing strip or hole',()=>{
 const square=rect(0,0,10,10);
 assert.equal(pavementPartitionDifference([square],[rect(.001,0,10,10)]).beyondRoundingArea,0);
 assert.ok(pavementPartitionDifference([square],[rect(.02,0,10,10)]).beyondRoundingArea>.1);
 const withHole=[square[0],...rect(4,4,2,2)];
 assert.ok(pavementPartitionDifference([square],[withHole]).beyondRoundingArea>3.9);
});
