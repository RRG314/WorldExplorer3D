import test from 'node:test';
import assert from 'node:assert/strict';
import * as bundle from '../app/vendor/clipper/index.js';
import {streetPolygonKernel as clip} from '../app/js/world/compiler/street-polygon-kernel.js';
const C=bundle.default||globalThis.ClipperLib;
const rectangle=(x,z,w,h)=>[[[x,z],[x+w,z],[x+w,z+h],[x,z+h],[x,z]]];
const area=polygons=>polygons.reduce((sum,poly)=>sum+poly.reduce((n,ring,i)=>{
 let a=0;for(let j=1;j<ring.length;j++)a+=ring[j-1][0]*ring[j][1]-ring[j][0]*ring[j-1][1];
 return n+(i?-1:1)*Math.abs(a/2);
},0),0);
function reference(subject,other,type){
 const paths=polygons=>polygons.flatMap(poly=>poly.map((ring,i)=>{
  const pts=ring.slice(0,-1).map(([x,z])=>({X:x*1000,Y:z*1000}));if(C.Clipper.Orientation(pts)!==(i===0))pts.reverse();return pts;
 }));
 const engine=new C.Clipper(),tree=new C.PolyTree();engine.StrictlySimple=true;
 engine.AddPaths(paths(subject),C.PolyType.ptSubject,true);engine.AddPaths(paths(other),type==='union'?C.PolyType.ptSubject:C.PolyType.ptClip,true);
 engine.Execute({union:C.ClipType.ctUnion,difference:C.ClipType.ctDifference,intersection:C.ClipType.ctIntersection}[type],tree,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero);
 return C.JS.PolyTreeToExPolygons(tree).map(p=>[p.outer,...p.holes].map(r=>{const pts=r.map(p=>[p.X/1000,p.Y/1000]);return pts.concat([pts[0]]);}));
}
const contains=(polygons,x,z)=>polygons.some(poly=>poly.every((ring,i)=>{
 const p=ring.slice(0,-1).map(([X,Y])=>({X,Y})),inside=C.Clipper.PointInPolygon({X:x,Y:z},p)!==0;return i?!inside:inside;
}));
test('nested holes, islands and touching components retain their topology',()=>{
 const outer=rectangle(0,0,100,100),hole=rectangle(10,10,80,80)[0],island=rectangle(20,20,60,60),islandHole=rectangle(30,30,40,40)[0];
 const result=clip.union([outer.concat([hole]),island.concat([islandHole]),rectangle(100,100,10,10)]);
 assert.equal(area(result),5700);
 assert.equal(contains(result,5,5),true);assert.equal(contains(result,15,15),false);assert.equal(contains(result,25,25),true);assert.equal(contains(result,35,35),false);assert.equal(contains(result,105,105),true);
});
test('flat result reconstruction agrees with Clipper PolyTree over deterministic intersecting blocks',()=>{
 let seed=9183;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let trial=0;trial<12;trial++){
  const subject=Array.from({length:12},()=>rectangle(random()%40,random()%40,4+random()%16,4+random()%16));
  const other=Array.from({length:7},()=>rectangle(random()%40,random()%40,4+random()%16,4+random()%16));
  for(const type of ['union','difference','intersection']){
   const actual=type==='union'?clip.union(subject,other):clip[type](subject,other),expected=reference(subject,other,type);
   assert.ok(Math.abs(area(actual)-area(expected))<1e-6,`${type} changed area in trial ${trial}`);
   for(let x=1;x<56;x+=5)for(let z=1;z<56;z+=5)assert.equal(contains(actual,x+.125,z+.125),contains(expected,x+.125,z+.125),`${type} changed containment at ${x},${z}`);
  }
 }
});
