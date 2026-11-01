import test from 'node:test';
import assert from 'node:assert/strict';
import {streetRoadSegments} from '../app/js/world/compiler/street-carriageway.js';
import {meshCarriagewayTile} from '../app/js/world/compiler/street-carriageway-mesh.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
import {sampleRaceSegmentY} from '../app/js/racing/course-rules.js';
const road={pts:[{x:0,z:0},{x:0,z:10}],width:8,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'}},
 tile={key:'controlled',bounds:{minX:-8,maxX:8,minZ:0,maxZ:10},segments:[...streetRoadSegments(road)],joins:[]},base=(x,z)=>10+.03*x+.02*z;
const rows=height=>[[0,0],[2,height],[8,height],[10,0]].map(([z,cap])=>({z,cap,points:[{x:3.3,z,lift:0},{x:3.3+cap/.15,z,lift:cap},{x:4,z,lift:cap}]}));
function faces(height=.06){const list=[],stations=rows(height);for(let i=1;i<stations.length;i++)for(let j=1;j<3;j++){
 const a=stations[i-1].points[j-1],b=stations[i-1].points[j],c=stations[i].points[j-1],d=stations[i].points[j];
 for(const points of[[a,c,b],[b,c,d]])list.push({points:points.map(p=>({...p})),color:i%2?[160,32,24]:[204,199,185]});
 }return list;}
const partition=(vertices,sample)=>Float32Array.from(vertices.map((v,i)=>i%3===1?sample(vertices[i-1],vertices[i+1]):v));
const mesh=data=>({geometry:{attributes:{position:{array:data.positions}},getIndex:()=>({array:data.indices})},userData:{terrainMode:'at_grade'}});
const area=data=>{let total=0;for(let i=0;i<data.indices.length;i+=3){const [a,b,c]=[...data.indices.slice(i,i+3)].map(p=>p*3),p=data.positions;total+=Math.abs((p[b]-p[a])*(p[c+2]-p[a+2])-(p[b+2]-p[a+2])*(p[c]-p[a]))/2;}return total;};

test('the carriageway owner publishes one banked top, including its raised edge and both entry ramps',()=>{
 const input=faces(),before=JSON.stringify({tile,input}),data=meshCarriagewayTile(tile,base,partition,{edgeFaces:input});
 assert.ok(data.edgeBands?.positions.length>0);
 const contacts=createRoadContactIndex([mesh(data),mesh(data.edgeBands)]);
 try{
  const profile={a:{x:0,y:10,z:0},b:{x:0,y:10.2,z:10},heightSampleSpanMeters:1.2,heightSamples:rows(.06).map(({z,cap})=>({t:z/10,y:base(0,z),leftY:base(-1.2,z),rightY:base(1.2,z),lateralSamples:[{offsetMeters:-4,y:base(-4,z)},{offsetMeters:0,y:base(0,z)},{offsetMeters:3.3,y:base(3.3,z)},{offsetMeters:3.3+cap/.15,y:base(3.3+cap/.15,z)+cap},{offsetMeters:4,y:base(4,z)+cap}]}))};
  for(const z of[.5,1,2,3,5,8,9,9.5])for(const x of[-3,0,3.2,3.35,3.4,3.6,3.9]){
   const actual=contacts.sampleAt(x,z,base(x,z),'at_grade'),expected=sampleRaceSegmentY(profile,z/10,x);
   assert.ok(Math.abs(actual-expected)<.00001,`${x},${z}: ${actual} vs ${expected}`);
  }
  assert.ok(Math.abs(contacts.sampleAt(3.9,5,base(3.9,5))-base(3.9,5)-.06)<.00001,'the flat asphalt has been removed underneath the raised band');
  assert.ok(Math.abs(area(data)+area(data.edgeBands)-80)<.001,'no overlapping or missing horizontal road coverage');
  assert.equal(data.edgeBands.colors.length,data.edgeBands.positions.length);
  assert.equal(JSON.stringify({tile,input}),before,'off-scene compilation cannot mutate source facts');
 }finally{contacts.dispose();}
});
test('overlapping band faces resolve to one continuous lower surface in either input order',()=>{
 const a=faces(),b=faces(.03),outputs=[];
 for(const input of[[...a,...b],[...b,...a]]){
  const data=meshCarriagewayTile(tile,base,partition,{edgeFaces:input}),contacts=createRoadContactIndex([mesh(data),mesh(data.edgeBands)]);
  try{outputs.push([.5,1,2,5,9].flatMap(z=>[3.35,3.4,3.6,3.9].map(x=>contacts.sampleAt(x,z,base(x,z)))));assert.ok(Math.abs(area(data)+area(data.edgeBands)-80)<.001);}
  finally{contacts.dispose();}
 }
 assert.ok(Math.abs(outputs[0][7]-base(3.9,1)-.015)<.00001,'the lower tapered roof owns the overlap');
 outputs[0].forEach((y,i)=>assert.ok(Math.abs(y-outputs[1][i])<.00001));
});
test('damaged or excessive band input fails before replacing the existing road top',()=>{
 for(const change of[p=>p[0].points[0].lift=NaN,p=>p[0].points[0].lift=-.01,p=>p[0].points[0].lift=.16,p=>p[0].color=[256,0,0]]){
  const input=faces();change(input);assert.throws(()=>meshCarriagewayTile(tile,base,partition,{edgeFaces:input}),/edge_band/);
 }
 assert.throws(()=>meshCarriagewayTile(tile,base,partition,{edgeFaces:Array(4097).fill(faces()[0])}),/edge_band/);
});

test('raised bands retain the existing published terrain crease rather than bridging it with a new base plane',async()=>{
 const {createPavementTerrainPartition}=await import('../app/js/world/pavement-terrain-partition.js'),ground=(x,z)=>base(x,z)+Math.max(0,z-5)*.03,
  positions=Float32Array.from([0,5,10].flatMap(z=>[-8,0,8].flatMap(x=>[x,ground(x,z),z]))),
  terrain={position:{x:0,y:0,z:0},userData:{isTerrainMesh:true},geometry:{parameters:{widthSegments:2},attributes:{position:{array:positions}}}},partitioned=createPavementTerrainPartition([terrain]);
 try{
  const data=meshCarriagewayTile(tile,ground,partitioned,{edgeFaces:faces()}),contacts=createRoadContactIndex([mesh(data),mesh(data.edgeBands)]);
  try{
   for(const z of[.5,1,2,4.9,5,5.1,7,8,9,9.5])for(const x of[0,3.2,3.35,3.4,3.6,3.9]){
    const lift=x<3.3?0:Math.min(.06,z*.03,(10-z)*.03,(x-3.3)*.15);
    assert.ok(Math.abs(contacts.sampleAt(x,z,ground(x,z))-ground(x,z)-lift)<.00001);
   }
   assert.ok(Math.abs(area(data)+area(data.edgeBands)-80)<.001);
  }finally{contacts.dispose();}
 }finally{partitioned.dispose();}
});
