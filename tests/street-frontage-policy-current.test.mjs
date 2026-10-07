import test from 'node:test';
import assert from 'node:assert/strict';
import {createStreetFrontagePolicy,streetScaleForWorld} from '../app/js/world/compiler/street-frontage-policy.js';
import {createStreetFrontageGrading} from '../app/js/terrain/street-frontage-grading.js';
import {prepareStreetPavement,compilePavementTile} from '../app/js/world/compiler/street-pavement.js';
import {resolveStreetSection} from '../app/js/world/compiler/street-section.js';
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
test('frontage broad phase preserves near-contact tolerance and source edge order',()=>{
  const policy=createStreetFrontagePolicy([rect(10,0,32,32)],1);
  const p={x:10-0.5e-8,z:16};
  assert.deepEqual(policy.query(p,p,0),[policy.edges[3]]);
  const outside={x:10-2e-8,z:16};
  assert.deepEqual(policy.query(outside,outside,0),[]);
  const a={x:0,z:16},b={x:50,z:16};
  assert.deepEqual(policy.query(a,b,0),[policy.edges[1],policy.edges[3]]);
});
test('translated diagonal and degenerate frontage queries retain exact contacts',()=>{
  for(const shift of [-1e9,0,1e9]){
    const p=(x,z)=>({x:x+shift,z:z+shift});
    const policy=createStreetFrontagePolicy([{pts:[p(0,0),p(32,32),p(0,32)]}],1);
    assert.deepEqual(policy.query(p(16,16),p(16,16),0),[policy.edges[0]]);
    assert.deepEqual(policy.query(p(16,-1),p(16,33),0),[policy.edges[0],policy.edges[1]]);
  }
});


test('repeated bucket candidates never cache exact hits or survive disposal',()=>{
  const policy=createStreetFrontagePolicy([rect(10,0,8,8)],1);
  const near={x:9,z:4},far={x:2,z:4};
  assert.deepEqual(policy.query(near,near,2),[policy.edges[3]]);
  assert.deepEqual(policy.query(far,far,2),[],'different points in the same buckets require a fresh exact distance');
  assert.deepEqual(policy.query(near,near,2),[policy.edges[3]]);
  for(let i=0;i<300;i++)policy.query({x:i*128,z:i*128},undefined,2);
  assert.deepEqual(policy.query(near,near,2),[policy.edges[3]],'eviction cannot alter accepted edge order');
  policy.dispose();assert.deepEqual(policy.query(near,near,2),[]);
});

test('squared broad comparison agrees with hypot at random and rounding-boundary reaches',()=>{
  function pointDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l)):0;return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);}
  const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
  const distance=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0?0:Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
  let seed=7139;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
  for(const shift of [0,1e9,-1e9]){
    const point=()=>({x:shift+random()*140,z:shift+random()*140});
    const policy=createStreetFrontagePolicy(Array.from({length:12},()=>({pts:[point(),point(),point()]})),1);
    for(let i=0;i<200;i++){
      const a=point(),b=i%2?a:point(),target=policy.edges[i%policy.edges.length];
      const threshold=distance(a,b,target.a,target.b);
      for(const pad of [random()*30,Math.max(0,threshold-1e-8),Math.max(0,threshold-1e-8+1e-13)]){
        const expected=policy.edges.filter(e=>distance(a,b,e.a,e.b)<=pad+1e-8).map(e=>policy.edges.indexOf(e));
        const actual=policy.query(a,b,pad).map(e=>policy.edges.indexOf(e)).sort((x,y)=>x-y);
        assert.deepEqual(actual,expected);
      }
    }
    policy.dispose();
  }
});

test('repeated street sections share immutable values without conflating source evidence',()=>{
  const policy=createStreetFrontagePolicy([],1),sections=new Set();
  for(let i=0;i<5000;i++){
    const tags={sidewalk:i%2?'left':'both','sidewalk:width':String(1.5+i%4)};
    const road={type:'residential',tags,pts:[{x:0,z:i},{x:20,z:i}]};
    const section=policy.section(road);
    assert.deepEqual(section,resolveStreetSection({...tags,highway:road.type}));
    assert.ok(Object.isFrozen(section)&&Object.isFrozen(section.left)&&Object.isFrozen(section.right));
    sections.add(section);
  }
  assert.equal(sections.size,4,'equal source semantics must not retain per-road duplicates');
  const road={type:'residential',tags:{sidewalk:'left'},pts:[{x:0,z:0},{x:20,z:0},{x:40,z:0}]};
  const before=policy.section(road,0);
  road.tags.sidewalk='right';
  assert.equal(policy.section(road,1).right.presence,'present','new segments resolve the current tags');
  assert.equal(before.left.presence,'present');
  assert.throws(()=>{before.left={presence:'absent'}},TypeError);
  const bridge={...road,structureSemantics:{terrainMode:'elevated'}};
  assert.equal(policy.section(bridge).left.source,'excluded-structure');
  assert.equal(policy.section(bridge).right.presence,'absent');
  policy.dispose();
  assert.equal(policy.section(road,0).right.presence,'present','retired segment caches are released');
});

test('semantic section pool eviction preserves widths and inferred-versus-mapped evidence',()=>{
  const policy=createStreetFrontagePolicy([rect(0,-10,20,5)],1);
  for(let i=0;i<400;i++){
    const tags={sidewalk:'both','sidewalk:width':String(.1+i/25)};
    const road={type:'residential',tags,pts:[{x:0,z:0},{x:20,z:0}]};
    assert.deepEqual(policy.section(road),resolveStreetSection({...tags,highway:'residential'},{urban:true}));
  }
  const inferred=policy.section({type:'residential',pts:[{x:0,z:0},{x:20,z:0}]});
  const mapped=policy.section({type:'residential',tags:{sidewalk:'both'},pts:[{x:0,z:0},{x:20,z:0}]});
  assert.equal(inferred.left.source,'inferred-urban-road');
  assert.equal(mapped.left.source,'mapped-tag');
  assert.notEqual(inferred,mapped);
  policy.dispose();
});
