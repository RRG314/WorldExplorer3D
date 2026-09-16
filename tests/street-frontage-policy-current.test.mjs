import test from 'node:test';
import assert from 'node:assert/strict';
import {createStreetFrontagePolicy,streetScaleForWorld} from '../app/js/world/compiler/street-frontage-policy.js';
import {createStreetFrontageGrading} from '../app/js/terrain/street-frontage-grading.js';
import {prepareStreetPavement,compilePavementTile} from '../app/js/world/compiler/street-pavement.js';
const rect=(x,z,w,h)=>({pts:[{x,z},{x:x+w,z},{x:x+w,z:z+h},{x,z:z+h}]});
const area=polys=>polys.reduce((sum,poly)=>sum+poly.reduce((s,r,i)=>{
  // Subtract a local origin to avoid cancellation at large map coordinates.
  const [ox,oz]=r[0];let a=0;for(let j=1;j<r.length;j++)a+=(r[j-1][0]-ox)*(r[j][1]-oz)-(r[j][0]-ox)*(r[j-1][1]-oz);
  return s+Math.abs(a)/2*(i?-1:1);
},0),0);
for(const scale of [0.5,1,1.11,2])for(const angle of [0,Math.PI/3,Math.PI/2])test(`shared street rules survive scale ${scale}, rotation ${angle}`,()=>{
  const transform=p=>({x:10000+(p.x*Math.cos(angle)-p.z*Math.sin(angle))/scale,z:-8000+(p.x*Math.sin(angle)+p.z*Math.cos(angle))/scale});
  const buildings=[rect(0,-15,10,5),rect(10,-15,10,5)].map(b=>({pts:b.pts.map(transform)}));
  const road={pts:[{x:0,z:0},{x:20,z:0}].map(transform),width:8/scale,type:'residential',tags:{}};
  const policy=createStreetFrontagePolicy(buildings,scale);
  assert.equal(policy.section(road).left.presence,'present');
  assert.equal(policy.edges.filter(e=>e.extendedFrontage>0).length,8);
  const grading=createStreetFrontageGrading(buildings,scale),sample=transform({x:5,z:-5});
  assert.ok(Math.abs(grading.outerDistance(road,{segIndex:0,t:.25},sample.x,sample.z,4/scale)*scale-10)<1e-7);
  const plan=prepareStreetPavement({roads:[road],buildings,metersPerWorldUnit:scale});
  for(const tile of plan.tiles)for(const segment of tile.segments)assert.deepEqual(segment.section,policy.section(road));
  const total=plan.tiles.reduce((sum,t)=>sum+area(compilePavementTile(t,scale).polygons),0)*scale*scale;
  // 20 m of 6 m frontage sidewalk plus 1.8 m on the opposite side.
  assert.ok(Math.abs(total-156)<.3,`physical pavement area ${total}`);
  grading.dispose();policy.dispose();
});
test('same source segment resolves consistently beyond the local facade and across tiles',()=>{
  const buildings=[rect(0,-10,8,4)],road={pts:[{x:0,z:0},{x:160,z:0}],width:8,type:'residential'};
  const policy=createStreetFrontagePolicy(buildings,1),grading=createStreetFrontageGrading(buildings,1);
  const plan=prepareStreetPavement({roads:[road],buildings,metersPerWorldUnit:1});
  for(const tile of plan.tiles)for(const segment of tile.segments)assert.deepEqual(segment.section,policy.section(road));
  assert.equal(grading.outerDistance(road,{segIndex:0,t:.9},144,-5,4),5.8);
});
test('explicit absence, separate mapping and structures override nearby buildings',()=>{
  for(const tags of [{sidewalk:'no'},{sidewalk:'separate'},{bridge:'yes'},{tunnel:'yes'}]){
    const road={pts:[{x:0,z:0},{x:20,z:0}],width:8,type:'residential',tags};
    const grading=createStreetFrontageGrading([rect(0,-10,20,5)],1);
    assert.equal(grading.outerDistance(road,{segIndex:0,t:.5},10,-5,4),4);
  }
});
test('reversal swaps left and right without changing physical frontage',()=>{
  const buildings=[rect(0,-10,20,5)],grading=createStreetFrontageGrading(buildings,1);
  const a={pts:[{x:0,z:0},{x:20,z:0}],type:'residential',tags:{sidewalk:'left'}};
  const b={...a,pts:[...a.pts].reverse(),tags:{sidewalk:'right'}};
  assert.equal(grading.outerDistance(a,{segIndex:0,t:.5},10,-5,4),grading.outerDistance(b,{segIndex:0,t:.5},10,-5,4));
});
test('invalid and passage footprints cannot create frontage evidence',()=>{
  const buildings=[{...rect(0,-10,20,5),allowsPassageBelow:true},{pts:[{x:NaN,z:0},{x:0,z:0},{x:1,z:1}]}];
  const policy=createStreetFrontagePolicy(buildings,1);
  assert.equal(policy.edges.length,0);
  assert.equal(policy.section({pts:[{x:0,z:0},{x:20,z:0}],type:'residential'}).left.presence,'unknown');
});
test('world scale has one authority and rejects unusable values',()=>{
  assert.equal(streetScaleForWorld({}),1.11);
  assert.equal(streetScaleForWorld({WORLD_UNITS_PER_METER:2}),.5);
  assert.equal(streetScaleForWorld({METERS_PER_WORLD_UNIT:1.11,WORLD_UNITS_PER_METER:1}),1.11);
  for(const scale of [0,-1,Infinity,NaN])assert.throws(()=>createStreetFrontagePolicy([],scale),RangeError);
});
test('placement offsets move both grading edges with the pavement',()=>{
  const road={pts:[{x:0,z:0},{x:20,z:0}],type:'residential',tags:{sidewalk:'both'},transportRecord:{crossSection:{placement:{centerlineOffsetMeters:2}}}};
  const grading=createStreetFrontageGrading([],1);
  assert.equal(grading.outerDistance(road,{segIndex:0,t:.5},10,-5,4),3.8);
  assert.equal(grading.outerDistance(road,{segIndex:0,t:.5},10,5,4),7.8);
});
test('semantic grade separation excludes frontage even with missing source tags',()=>{
  for(const structureSemantics of [{terrainMode:'elevated'},{gradeSeparated:true},{rampCandidate:true}]){
    const road={pts:[{x:0,z:0},{x:20,z:0}],type:'residential',tags:{sidewalk:'both'},structureSemantics};
    assert.equal(createStreetFrontagePolicy([],1).section(road).left.presence,'absent');
    assert.equal(createStreetFrontageGrading([],1).outerDistance(road,{segIndex:0,t:.5},10,-5,4),4);
  }
});
