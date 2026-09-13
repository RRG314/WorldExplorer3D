import test from 'node:test';
import assert from 'node:assert/strict';
import {indexPavementPositions} from '../app/js/world/pavement-indexed-mesh.js';
import {createPavementBaseSampler} from '../app/js/world/pavement-height-sampler.js';

test('indexed pavement preserves every rendered triangle and reduces a dense grid about one third of flat position bytes',()=>{
 const vertices=[];
 for(let x=0;x<64;x++)for(let z=0;z<64;z++)for(const [dx,dz] of [[0,0],[0,1],[1,0],[1,0],[0,1],[1,1]])vertices.push(x+dx,(x+dx)*.2+(z+dz)*.1,z+dz);
 const flat=new Float32Array(vertices),indexed=indexPavementPositions(flat);
 assert.equal(indexed.positions.byteLength,65*65*3*4);
 assert.equal(indexed.indices.byteLength,64*64*6*2);
 assert.ok(indexed.positions.byteLength+indexed.indices.byteLength<flat.byteLength*.35);
 assert.deepEqual(new Float32Array([...indexed.indices].flatMap(i=>Array.from(indexed.positions.slice(i*3,i*3+3)))),flat);
 assert.throws(()=>indexPavementPositions([0,Infinity,0]),/Invalid/);
});

test('near and overview height contract clears at-grade road edges and ignores elevated decks',()=>{
 const ground=(x,z)=>x*.1+z*.2,calls=[];
 const segments=[{a:{x:0,z:0},b:{x:64,z:0},wa:8,wb:8,road:{surfaceBias:.18}}];
 const contact={sampleAt(x,z,y,mode){calls.push(mode);return ground(x,z)+.4;}};
 const near=createPavementBaseSampler({segments,ground,roadContactIndex:contact});
 const overview=createPavementBaseSampler({segments,ground,roadContactIndex:contact});
 for(const z of [4,6,8,12])assert.equal(near(32,z),overview(32,z));
 assert.ok(Math.abs(near(32,4)-(ground(32,4)+.4))<1e-10);
 assert.ok(calls.every(mode=>mode==='at_grade'));
 const onlyElevated={sampleAt(x,z,y,mode){return mode==='at_grade'?null:100;}};
 const fallback=createPavementBaseSampler({segments,ground,roadContactIndex:onlyElevated});
 assert.ok(fallback(32,4)<ground(32,4)+1);
});

test('frontage refinement reduces triangles at a terrain fold without increasing sampled error',async()=>{
 const {conformRoadTriangles}=await import('../app/js/terrain/road-surface-geometry.js');
 for(const width of [.02,.2,1,4]){
  const sample=(x,z)=>.2*x+.1*z+.3*Math.max(0,x-1.7),results=[];
  for(const edgeRefinement of [false,true]){
   const vertices=[0,sample(0,0),0,4,sample(4,0),0,4,sample(4,width),width],indices=[0,2,1];
   conformRoadTriangles(vertices,indices,sample,0,{maxDepth:3,tolerance:.03,edgeRefinement});
   let error=0;
   for(let i=0;i<indices.length;i+=3)for(const weights of [[.5,.5,0],[.5,0,.5],[0,.5,.5],[1/3,1/3,1/3],[.2,.3,.5]]){
    const p=[0,0,0];for(let j=0;j<3;j++)for(let k=0;k<3;k++)p[k]+=vertices[indices[i+j]*3+k]*weights[j];
    error=Math.max(error,Math.abs(p[1]-sample(p[0],p[2])));
   }
   results.push({triangles:indices.length/3,error});
  }
  assert.ok(results[1].triangles<results[0].triangles);assert.ok(results[1].error<=.0300001);
 }
});
