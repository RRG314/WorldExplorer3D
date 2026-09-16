import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareStreetPavement,compilePavementTile,meshPavementTile} from '../app/js/world/compiler/street-pavement.js';
import {streetPolygonKernel as clip} from '../app/js/world/compiler/street-polygon-kernel.js';
const area=polys=>polys.reduce((sum,p)=>sum+p.reduce((total,r,i)=>total+(i?-1:1)*Math.abs(r.slice(1).reduce((s,b,j)=>s+r[j][0]*b[1]-b[0]*r[j][1],0))/2,0),0);
const rectangle=(x,z,w,h)=>[{x,z},{x:x+w,z},{x:x+w,z:z+h},{x,z:z+h}];
const source={metersPerWorldUnit:1,coverageBounds:{minX:0,maxX:128,minZ:0,maxZ:128},landuses:[{pts:rectangle(10,10,108,108),tags:{'area:highway':'pedestrian'}}]};
function polygons(input){return prepareStreetPavement(input).tiles.flatMap(t=>compilePavementTile(t,1).polygons);}
test('changing output chunks preserves the accepted pedestrian area and its hole',()=>{
  const input={...source,buildings:[{pts:rectangle(55,55,18,18)}]};
  const reference=polygons({...input,chunkSize:64});
  for(const chunkSize of [16,32,48,128]){
    const actual=polygons({...input,chunkSize});
    assert.ok(Math.abs(area(actual)-(108**2-18**2))<1e-6);
    assert.ok(area(clip.difference(reference,actual))+area(clip.difference(actual,reference))<1e-6);
  }
});
test('packaging several regions cannot turn their internal boundaries into curbs',()=>{
  const plan=prepareStreetPavement({...source,chunkSize:128});
  assert.equal(plan.tiles.length,1);
  const tile=plan.tiles[0],result=compilePavementTile(tile,1);
  const mesh=meshPavementTile(tile,result.polygons,()=>0);
  let curbLength=0;
  for(let i=0;i<mesh.curbVertices.length;i+=18){
    const a=mesh.curbVertices.slice(i,i+3),b=mesh.curbVertices.slice(i+15,i+18);
    assert.ok([10,118].some(v=>Math.abs(a[0]-v)<1e-8&&Math.abs(b[0]-v)<1e-8)||[10,118].some(v=>Math.abs(a[2]-v)<1e-8&&Math.abs(b[2]-v)<1e-8),'only the actual outside perimeter is a curb');
    curbLength+=Math.hypot(a[0]-b[0],a[2]-b[2]);
  }
  assert.ok(Math.abs(curbLength-432)<1e-6);
});
test('a partial output window crops an accepted region without discarding the boundary cells',()=>{
  const coverageBounds={minX:17,maxX:95,minZ:21,maxZ:83};
  for(const chunkSize of [32,64,128]){
    const result=polygons({...source,coverageBounds,chunkSize});
    assert.ok(Math.abs(area(result)-78*62)<1e-6);
    for(const p of result)for(const ring of p)for(const [x,z] of ring){assert.ok(x>=17&&x<=95);assert.ok(z>=21&&z<=83);}
  }
});

test('cropping a narrow accepted triangle does not round away its half-width intersection',()=>{
  const input={metersPerWorldUnit:1,coverageBounds:{minX:0,maxX:64,minZ:0,maxZ:64},landuses:[{pts:[{x:0,z:0},{x:64,z:.001},{x:64,z:.002}],tags:{'area:highway':'pedestrian'}}]};
  const expected=area(polygons({...input,chunkSize:64}));
  assert.ok(expected>.03,'the accepted narrow triangle must exist');
  for(const chunkSize of [16,32])assert.ok(Math.abs(area(polygons({...input,chunkSize}))-expected)<1e-8,'packaging may not collapse the sloping outline on a second millimetre rounding');
});
