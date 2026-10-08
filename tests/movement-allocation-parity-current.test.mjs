import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestPointOnPolygon,nearestPointOnPolyline,segmentDistanceInfo} from '../app/js/boat-mode/water-geometry.js';
import {opaqueFrontToBack} from '../app/js/engine/opaque-order.js';

const referenceNearest=(x,z,pts,closed)=>{
 let best=null;
 for(let i=0;i<pts.length-(closed?0:1);i++){
  const a=pts[i],b=pts[(i+1)%pts.length],next=segmentDistanceInfo(x,z,a.x,a.z,b.x,b.z);
  if(!best||next.dist<best.dist)best=next;
 }
 return best;
};

test('shoreline selection preserves exact points, tangents, ties and independent results',()=>{
 let seed=392;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const rings=[[],[{x:0,z:0}],[{x:-5,z:0},{x:5,z:0},{x:5,z:0},{x:5,z:10},{x:-5,z:10}],
  Array.from({length:2000},(_,i)=>({x:Math.cos(i*Math.PI/1000)*(300+random()),z:Math.sin(i*Math.PI/1000)*(300+random())}))];
 for(const closed of [false,true])for(const pts of rings)for(const actor of [{x:0,z:5},{x:5,z:0},...Array.from({length:60},()=>({x:(random()-.5)*10000,z:(random()-.5)*10000}))]){
  const query=closed?nearestPointOnPolygon:nearestPointOnPolyline;
  const result=query(actor.x,actor.z,pts);
  assert.deepEqual(result,referenceNearest(actor.x,actor.z,pts,closed));
  if(result){const saved=structuredClone(result);query(actor.x+10,actor.z+10,pts);assert.deepEqual(result,saved);}
 }
 const tiny=[{x:1,z:1},{x:1+1e-8,z:1},{x:2,z:2}];
 assert.deepEqual(nearestPointOnPolyline(1,1,tiny),referenceNearest(1,1,tiny,false));
 tiny[0].x=-3;assert.deepEqual(nearestPointOnPolyline(1,1,tiny),referenceNearest(1,1,tiny,false),'same-array edits remain visible');
});

test('opaque comparator preserves every existing layer, tie and stable render order',()=>{
 const baseline=(a,b)=>a.groupOrder-b.groupOrder||a.renderOrder-b.renderOrder||a.z-b.z||a.material.id-b.material.id||a.id-b.id;
 const items=Array.from({length:4000},(_,i)=>({id:i,groupOrder:i%3,renderOrder:i%7,z:Math.sin(i)*100,material:{id:i%13}}));
 assert.deepEqual([...items].sort(opaqueFrontToBack),[...items].sort(baseline));
 for(const x of [-Infinity,-1,-0,0,.0001,1,Infinity,NaN])for(const y of [-Infinity,-1,-0,0,.0001,1,Infinity,NaN]){
  const a={id:3,groupOrder:0,renderOrder:0,z:x,material:{id:0}},b={...a,id:4,z:y};
  assert.equal(Math.sign(opaqueFrontToBack(a,b)),Math.sign(baseline(a,b)));
 }
 const a={id:1,groupOrder:0,renderOrder:0,z:.15,material:{id:1}},b={...a,id:2,z:.35};
 assert.equal(opaqueFrontToBack(a,b),-1);
});
