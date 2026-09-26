import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
const mesh = (positions, terrainMode, surfaceRanges) => ({geometry:{attributes:{position:{array:new Float32Array(positions)}}},userData:{terrainMode,surfaceRanges}});

test('packed contacts preserve stacked layers, reference height, batch ranges and decal planes',()=>{
  const triangle=y=>[0,y,0,0,y,10,10,y,0];
  const index=createRoadContactIndex([mesh([...triangle(3),...triangle(12)],undefined,[{start:0,count:3,terrainMode:'at_grade'},{start:3,count:3,terrainMode:'elevated'}])]);
  assert.equal(index.sampleAt(2,2),12);assert.equal(index.sampleAt(2,2,4),3);
  assert.equal(index.sampleAt(2,2,NaN,'at_grade'),3);assert.equal(index.sampleAt(2,2,NaN,'elevated'),12);
  const projected=index.projectTriangle([{x:1,z:1},{x:2,z:1},{x:1,z:2}],.02,'at_grade');
  assert.equal(projected.length,9);for(let i=1;i<projected.length;i+=3)assert.ok(Math.abs(projected[i]-3.02)<1e-12);
  assert.equal(index.stats().recordBytes,56);assert.equal(index.stats().bucketBytes,(index.stats().cellReferences+index.stats().cells)*4);
  index.dispose();assert.equal(index.sampleAt(2,2),null);assert.deepEqual(index.projectTriangle([{x:1,z:1},{x:2,z:1},{x:1,z:2}]),[]);
  assert.equal(index.stats().recordBytes,0);assert.equal(index.stats().bucketBytes,0);
});

for(const city of ['sf','monaco'])test(`packed contacts agree with captured ${city} rendered triangle interiors`,()=>{
  const capture=JSON.parse(readFileSync(new URL(`../docs/streets/audit-2026-09-13/${city}-unioned-roads-surfaces.json`,import.meta.url),'utf8'));
  const triangles=capture.surfaces.filter(s=>s.family==='road').flatMap(s=>s.triangles);
  const index=createRoadContactIndex([mesh(triangles.flatMap(t=>t.flatMap(p=>[p.x,p.y,p.z])),'at_grade')]);
  let checked=0;
  for(const [a,b,c] of triangles){
    const area=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));if(area<1e-7)continue;
    for(const w of [[.2,.3,.5],[.6,.2,.2]]) {
      const x=a.x*w[0]+b.x*w[1]+c.x*w[2],z=a.z*w[0]+b.z*w[1]+c.z*w[2],y=a.y*w[0]+b.y*w[1]+c.y*w[2];
      const actual=index.sampleAt(x,z,y,'at_grade');
      assert.ok(actual!==null&&Math.abs(actual-y)<1e-5,`surface contact mismatch ${actual} versus ${y}`);checked++;
    }
  }
  assert.ok(checked>900);index.dispose();
});

test('bounded support retains intersecting triangle planes and allocates only selected records',()=>{
 const triangles=[];
 for(let x=0;x<1000;x+=10)triangles.push(x,2,0,x,2,8,x+8,2,0);
 const source=mesh(triangles,'at_grade');
 const full=createRoadContactIndex([source]);
 const local=createRoadContactIndex([source],16,{bounds:{minX:1,maxX:7,minZ:1,maxZ:7}});
 assert.equal(local.stats().triangles,1);assert.equal(local.stats().recordBytes,28);
 assert.equal(local.sampleAt(2,2),full.sampleAt(2,2));assert.equal(local.sampleAt(992,2),null);
 const points=[{x:1,z:1},{x:3,z:1},{x:1,z:3}];assert.deepEqual(local.projectTriangle(points),full.projectTriangle(points));
 full.dispose();local.dispose();
});

test('many disjoint cells share one bucket buffer without losing negative coordinates or edge contacts',()=>{
 const positions=[];
 for(let i=-5000;i<5000;i++)positions.push(i*32,7,0,i*32+8,7,0,i*32,7,8);
 const index=createRoadContactIndex([mesh(positions,'at_grade')]);
 assert.equal(index.stats().cells,10000);
 assert.equal(index.stats().bucketAllocations,1);
 for(let i=-5000;i<5000;i+=17){
   assert.equal(index.sampleAt(i*32,0),7);
   assert.equal(index.sampleAt(i*32+2,2),7);
   assert.equal(index.sampleAt(i*32+15,15),null);
 }
 index.dispose();assert.equal(index.stats().bucketAllocations,0);
});
