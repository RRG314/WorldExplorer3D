import test from 'node:test';
import assert from 'node:assert/strict';
import {frontageHit,splitFrontageIntervals} from '../app/js/world/compiler/street-frontage-geometry.js';
import {prepareStreetPavement,compilePavementTile} from '../app/js/world/compiler/street-pavement.js';
import {createStreetFrontageGrading} from '../app/js/terrain/street-frontage-grading.js';
const edge={a:{x:0,z:-8},b:{x:10,z:-12}};
const source={a:{x:0,z:0},b:{x:10,z:0},wa:8,wb:8};
const insideRing=(x,z,ring)=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [a,b]=ring[i],[c,d]=ring[j];if((b>z)!==(d>z)&&x<(c-a)*(z-b)/(d-b)+a)yes=!yes;}return yes;};
const inside=(x,z,polys)=>polys.some(p=>insideRing(x,z,p[0])&&!p.slice(1).some(r=>insideRing(x,z,r)));

test('visible angled facade is measured geometrically',()=>{
  assert.equal(frontageHit({x:5,z:0},0,-1,[edge],5.8,11)?.distance,10);
});
test('near wall occludes rear wall regardless of angle or facade eligibility',()=>{
  const rear={a:{x:0,z:-10},b:{x:10,z:-10}};
  for(const facadeEligible of [true,false]){
    const front={a:{x:4,z:-4},b:{x:6,z:-6},facadeEligible};
    assert.equal(frontageHit({x:5,z:0},0,-1,[rear,front],5.8,11),null);
    assert.equal(frontageHit({x:5,z:0},0,-1,[front,rear],5.8,11),null);
  }
});
test('frontage reach crossing partitions eligible portion instead of dropping interval',()=>{
  const parts=splitFrontageIntervals(source,[edge],{nx:0,nz:-1,minimumA:5.8,maximumA:11});
  assert.ok(parts.some(p=>Math.abs(p.b.x-7.5)<1e-10));
  assert.equal(parts[0].a.x,0);assert.equal(parts.at(-1).b.x,10);
});
test('overlapping footprint visibility changes produce exact source intervals',()=>{
  const other={a:{x:0,z:-12},b:{x:10,z:-8}};
  const parts=splitFrontageIntervals(source,[edge,other],{nx:0,nz:-1,minimumA:5.8,maximumA:14});
  assert.ok(parts.some(p=>Math.abs(p.b.x-5)<1e-10));
  for(const p of parts){const mid={x:(p.a.x+p.b.x)/2,z:0};assert.equal(frontageHit(mid,0,-1,[edge,other],5.8,14)?.distance,Math.min(8+.4*mid.x,12-.4*mid.x));}
});
for(const chunkSize of [16,32,64])for(const angle of [0,.6,1.57])test(`pavement and grading agree for angled frontage, tile ${chunkSize}, rotation ${angle}`,()=>{
  const scale=1.11,c=Math.cos(angle),s=Math.sin(angle),transform=p=>({x:1000+(p.x*c-p.z*s)/scale,z:-800+(p.x*s+p.z*c)/scale});
  const road={pts:[{x:0,z:0},{x:10,z:0}].map(transform),width:8/scale,type:'residential',tags:{sidewalk:'left'},metersPerWorldUnit:scale};
  const buildings=[{pts:[edge.a,edge.b,{x:10,z:-17},{x:0,z:-13}].map(transform)}];
  const plan=prepareStreetPavement({roads:[road],buildings,metersPerWorldUnit:scale,chunkSize});
  const polygons=plan.tiles.flatMap(t=>compilePavementTile(t,scale).polygons);
  const grading=createStreetFrontageGrading(buildings,scale,[road]);
  for(const x of [1,3,5,7,8.5,9.5]){
    const expected=x<=7.5?8+.4*x:5.8;
    const sample=transform({x,z:-5});
    assert.ok(Math.abs(grading.outerDistance(road,{segIndex:0,t:x/10},sample.x,sample.z,4/scale)*scale-expected)<1e-6);
    const interior=transform({x,z:-expected+.03}),outside=transform({x,z:-expected-.03});
    assert.ok(inside(interior.x,interior.z,polygons),`missing frontage at ${x}`);
    assert.ok(!inside(outside.x,outside.z,polygons),`unsupported extension at ${x}`);
  }
  grading.dispose();
});

test('small walls remain occluders but do not by themselves imply an urban sidewalk',async()=>{
  const {createStreetFrontagePolicy}=await import('../app/js/world/compiler/street-frontage-policy.js');
  const policy=createStreetFrontagePolicy([{pts:[{x:0,z:-5},{x:2,z:-5},{x:2,z:-7},{x:0,z:-7}]}],1);
  assert.equal(policy.edges.length,4);
  assert.equal(policy.section({pts:[{x:0,z:0},{x:20,z:0}],type:'residential'}).left.presence,'unknown');
  policy.dispose();
});

test('visibility barriers use exactly the rendered curved and tapered road footprint',async()=>{
  const {createStreetCarriagewayBarriers,frontageBlocked}=await import('../app/js/world/compiler/street-carriageway-barriers.js');
  const {prepareCarriagewayTiles,unionCarriageway}=await import('../app/js/world/compiler/street-carriageway.js');
  const road={pts:[{x:0,z:0},{x:20,z:0},{x:27,z:15}],width:8,type:'residential',metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'},resolvedCrossSection:{sourceWidthMeters:8,segmentWidthsMeters:[4,8],constrainedSegmentCount:1,segmentProfiles:[[{startT:.3,endT:.6,widthMeters:4}],[]]}};
  const polygons=prepareCarriagewayTiles([road]).flatMap(t=>unionCarriageway(t));
  const barriers=createStreetCarriagewayBarriers([road]);
  // Rays from outside through independently classified interior points must
  // cross a barrier, including the outside of the corner join.
  let checked=0;
  for(let x=-5;x<34;x+=.7)for(let z=-7;z<23;z+=.7)if(inside(x,z,polygons)){
    const origin={x:x-60,z},edges=barriers.query(origin,61);
    assert.ok(frontageBlocked(origin,1,0,60.00001,edges),`missing boundary before ${x},${z}`);checked++;
  }
  assert.ok(checked>300);barriers.dispose();
});
