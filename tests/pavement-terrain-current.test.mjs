import test from 'node:test';
import assert from 'node:assert/strict';
import { conformPavementMesh, conformPavementMeshCooperatively } from '../app/js/world/pavement-terrain-conformance.js';
import { createPavementTerrainPartition } from '../app/js/world/pavement-terrain-partition.js';
import { createRoadContactIndex } from '../app/js/terrain/road-contact-index.js';

function supportFor(ground, segments=16) {
  const array=new Float32Array((segments+1)**2*3);
  for(let row=0;row<=segments;row++)for(let col=0;col<=segments;col++)array.set([col*4/segments,ground(col*4/segments,row*4/segments),row*4/segments],(row*(segments+1)+col)*3);
  return createPavementTerrainPartition([{visible:true,userData:{isTerrainMesh:true},position:{x:0,y:0,z:0},geometry:{parameters:{widthSegments:segments},attributes:{position:{array}}}}]);
}

function meshFor(ground) {
  const p=[0,ground(0,0)+.12,0],q=[4,ground(4,0)+.12,0];
  const a=[0,ground(0,4)+.12,4],b=[4,ground(4,4)+.12,4];
  const lowP=[0,p[1]-.12,0],lowQ=[4,q[1]-.12,0];
  return {vertices:[...p,...a,...b,...p,...b,...q],curbVertices:[...p,...lowP,...lowQ,...p,...lowQ,...q]};
}

test('planar sidewalks are cut only at the published diagonal on a steep slope',()=>{
  const ground=(x,z)=>3000+x*.5-z*.3,mesh=meshFor(ground);
  const partitionSurface=supportFor(ground,1);
  conformPavementMesh(mesh,ground,(x,z)=>ground(x,z)+.12,{partitionSurface});
  partitionSurface.dispose();
  assert.equal(mesh.vertices.length,36);assert.equal(mesh.curbVertices.length,18);
});
for(const direction of [1,-1])test(`curved terrain ${direction>0?'rise':'hollow'} refines paving and curb with matching support`,()=>{
  const sampled=x=>direction*Math.sin(x*Math.PI/4)*1.5;
  // Interpolate the actual published grid, not an unrendered analytic curve.
  const ground=x=>{const a=Math.min(15,Math.floor(x*4)),t=x*4-a;return sampled(a/4)*(1-t)+sampled((a+1)/4)*t;};
  const partitionSurface=supportFor(ground);
  const mesh=meshFor(ground);
  assert.ok(conformPavementMesh(mesh,ground,(x,z)=>ground(x,z)+.12,{partitionSurface})>0);
  assert.ok(mesh.curbVertices.length>18);
  const index=createRoadContactIndex([{geometry:{attributes:{position:{array:new Float32Array(mesh.vertices)}}}}],4);
  for(let x=.1;x<4;x+=.2)for(let z=.1;z<4;z+=.4){
    assert.ok(Math.abs(index.sampleAt(x,z)-(ground(x,z)+.12))<.035);
    assert.ok(index.sampleAt(x,z)>ground(x,z));
  }
  for(let i=0;i<mesh.curbVertices.length;i+=18){
    const v=mesh.curbVertices;
    assert.ok(Math.abs(index.sampleAt(v[i],v[i+2])-v[i+1])<1e-6);
  }
  partitionSurface.dispose();index.dispose();assert.equal(index.sampleAt(2,2),null);
});


test('missing or incomplete support cannot silently publish an approximate sidewalk',()=>{
  for(const partitionSurface of [undefined,()=>null]) {
    const mesh=meshFor(()=>0),before=structuredClone(mesh);
    assert.throws(()=>conformPavementMesh(mesh,()=>0,()=>.12,{partitionSurface}),/requires a published|incomplete or overlapping/);
    assert.deepEqual(mesh,before,'rejected build must preserve the staged geometry for disposal');
  }
});

test('pavement continues onto published far terrain and rejects overlapping support',()=>{
  const array=new Float32Array([0,0,0,4,2,0,0,0,4,4,2,4]);
  const far={visible:true,userData:{isFarTerrainClipmap:true},geometry:{attributes:{position:{array}},getIndex:()=>({array:new Uint16Array([0,2,1,1,2,3])})}};
  const ground=x=>x*.5,mesh=meshFor(ground);
  const partitionSurface=createPavementTerrainPartition([far],{includeFarTerrain:true});
  conformPavementMesh(mesh,ground,x=>ground(x)+.12,{partitionSurface});
  assert.equal(mesh.vertices.length,36);
  partitionSurface.dispose();
  const overlap=createPavementTerrainPartition([far,far],{includeFarTerrain:true});
  assert.throws(()=>conformPavementMesh(mesh,ground,x=>ground(x)+.12,{partitionSurface:overlap}),/overlapping terrain support/);
  overlap.dispose();
});


test('cooperative terrain conformance preserves exact geometry while yielding within a dense cell',async()=>{
 const ground=(x,z)=>x*.5-z*.2;
 const original=meshFor(ground);
 original.vertices=Array.from({length:32},()=>original.vertices).flat();
 original.curbVertices=Array.from({length:32},()=>original.curbVertices).flat();
 const sync=structuredClone(original),cooperative=structuredClone(original);
 const partitionSurface=supportFor(ground,8);
 const expected=conformPavementMesh(sync,ground,(x,z)=>ground(x,z)+.12,{partitionSurface});
 let time=0,yields=0;
 const actual=await conformPavementMeshCooperatively(cooperative,ground,(x,z)=>ground(x,z)+.12,{
  partitionSurface,now:()=>time+=4,yieldWork:async()=>{yields++;}
 });
 assert.ok(yields>1);assert.equal(actual,expected);assert.deepEqual(cooperative,sync);partitionSurface.dispose();
});

test('cancelled cooperative terrain work never mutates its input mesh',async()=>{
 const mesh=meshFor(()=>0),before=structuredClone(mesh),partitionSurface=supportFor(()=>0);
 let active=true;
 await assert.rejects(conformPavementMeshCooperatively(mesh,()=>0,()=>.12,{
  partitionSurface,budgetMs:0,current:()=>active,yieldWork:async()=>{active=false;}
 }),/superseded/);
 assert.deepEqual(mesh,before);partitionSurface.dispose();
});

test('yield boundaries do not change the existing whole-cell area validation budget',async()=>{
 const near={visible:true,userData:{isTerrainMesh:true},position:{x:0,y:0,z:0},geometry:{parameters:{widthSegments:1},attributes:{position:{array:new Float32Array([0,0,0,100,0,0,0,0,100,100,0,100])}}}};
 // A deliberately tiny support overlap concentrates numerical area error in
 // the first few triangles. Acceptance must use the unchanged whole cell.
 const far={visible:true,userData:{isFarTerrainClipmap:true},geometry:{attributes:{position:{array:new Float32Array([.1,0,.1,.12,0,.1,.1,0,.11])}}}};
 const partitionSurface=createPavementTerrainPartition([near,far],{includeFarTerrain:true});
 const small=[0,0,0,0,0,2,2,0,0];
 const vertices=[...Array.from({length:8},()=>small).flat(),0,0,0,0,0,100,100,0,100,0,0,0,100,0,100,100,0,0];
 const sync={vertices:vertices.slice(),curbVertices:[]},cooperative=structuredClone(sync);
 conformPavementMesh(sync,()=>0,()=>.12,{partitionSurface});
 const expectedCoverage={...partitionSurface.lastCoverage};let yields=0;
 await conformPavementMeshCooperatively(cooperative,()=>0,()=>.12,{partitionSurface,budgetMs:0,yieldWork:async()=>{yields++;}});
 assert.ok(yields>=10);assert.deepEqual(cooperative,sync);assert.deepEqual(partitionSurface.lastCoverage,expectedCoverage);
 assert.ok(expectedCoverage.difference>1e-5);partitionSurface.dispose();
});

test('bounded cooperative support matches full partition and cancels during the source scan',async()=>{
 const {createPavementTerrainPartitionCooperatively}=await import('../app/js/world/pavement-terrain-partition.js');
 const triangles=[];for(let x=0;x<3000;x+=4)triangles.push(x,0,0,x,0,4,x+4,0,0,x+4,0,0,x,0,4,x+4,0,4);
 const far={visible:true,userData:{isFarTerrainClipmap:true},geometry:{attributes:{position:{array:new Float32Array(triangles)}}}};
 const options={includeFarTerrain:true,bounds:{minX:0,maxX:4,minZ:0,maxZ:4},budgetMs:0};
 let yields=0;
 const part=await createPavementTerrainPartitionCooperatively([far],{...options,yieldWork:async()=>{yields++;}});
 assert.ok(yields>10);const full=createPavementTerrainPartition([far],{includeFarTerrain:true});
 const vertices=meshFor(()=>0).vertices;
 assert.deepEqual(part(vertices,()=>.12),full(vertices,()=>.12));part.dispose();full.dispose();
 let active=true;
 await assert.rejects(createPavementTerrainPartitionCooperatively([far],{...options,current:()=>active,yieldWork:async()=>{active=false;}}),/superseded/);
});
