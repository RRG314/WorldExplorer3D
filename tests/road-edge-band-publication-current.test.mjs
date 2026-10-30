import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {appendRoadEdgeBands} from '../app/js/terrain/transport-detail-compiler.js';
import {createSpatialRoadBatches} from '../app/js/terrain/spatial-road-batches.js';
import {createPortalSurfaceClipper} from '../app/js/terrain/portal-surface-clip.js';
import {createTransportCellFacts,transportFromCellFacts,encodeWorldCellFacts,decodeWorldCellFacts} from '../app/js/earth-core/world-cell-facts.js';
import {buildIndexedBatchMesh,createRoadEdgeBandMaterial} from '../app/js/road-render.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';

const red=[160,32,24],white=[204,199,185];
const bands={baseY:Float32Array.from([-4,0,4,0,-4,10,4,10,4,0,-4,10].reduce((a,n,i,v)=>{if(i%2===0)a.push(1.95+.001*n+.001*v[i+1]);return a;},[])),positions:Float32Array.from([-4,2,0,4,2,0,-4,2,10,4,2,10,4,2,0,-4,2,10]),indices:Uint32Array.from([0,2,1,3,4,5]),colors:Uint8Array.from([...red,...red,...red,...white,...white,...white])};
test('edge paint survives portal cuts, portable cell interchange, render normalization and contact retirement',t=>{
 const prior=globalThis.THREE;globalThis.THREE=THREE;t.after(()=>globalThis.THREE=prior);
 const builder=createSpatialRoadBatches(),clip=createPortalSurfaceClipper([{x:0,z:5,tangentX:0,tangentZ:1,halfWidth:1,halfDepth:1,roadY:0,grade:0,cutHeight:5}]);
 appendRoadEdgeBands(builder,bands,clip);builder.finish();
 const packet={key:'0:0',bounds:{minX:0,maxX:1024,minZ:0,maxZ:1024},keys:['0:0'],roadIndices:[0],batches:builder.batches.map(b=>({positions:Float32Array.from(b.verts),indices:Uint32Array.from(b.indices),colors:Uint8Array.from(b.colors),baseY:Float32Array.from(b.baseY),material:b.material}))};
 const facts=createTransportCellFacts(packet,{requestId:'controlled',frame:{id:'controlled'},roads:[{sourceFeatureId:'controlled-road'}]});
 packet.batches[0].colors.fill(0);
 const restored=transportFromCellFacts(decodeWorldCellFacts(encodeWorldCellFacts(facts)));
 const scene=new THREE.Group(),meshes=[],material=createRoadEdgeBandMaterial();t.after(()=>{for(const m of meshes)m.geometry.dispose();material.dispose();});
 assert.equal(material.vertexColors,true);assert.equal(material.depthWrite,true);
 for(const b of restored.batches){
  assert.equal(b.material,'edge-band');assert.ok(b.colors instanceof Uint8Array);
  buildIndexedBatchMesh({scene,targetList:meshes,material,verts:b.positions,indices:b.indices,colors:b.colors,baseY:b.baseY,userData:{isRoadBatch:true,terrainMode:'at_grade',surfaceRanges:[{start:0,count:b.indices.length,terrainMode:'at_grade'}]}});
 }
 assert.ok(meshes.length>0);
 for(const mesh of meshes){
  const base=mesh.geometry.getAttribute('roadBaseY'),position=mesh.geometry.getAttribute('position');assert.ok(base);for(let i=0;i<base.count;i++)assert.ok(Math.abs(base.array[i]-(1.95+.001*position.getX(i)+.001*position.getZ(i)))<.000001,'a portal-created vertex retains the same base plane');
  const a=mesh.geometry.getAttribute('color');assert.equal(a.normalized,true);assert.equal(a.count,mesh.geometry.getAttribute('position').count);
  const ids=mesh.geometry.getIndex().array;
  for(let i=0;i<ids.length;i+=3){const color=Array.from(a.array.slice(ids[i]*3,ids[i]*3+3));assert.ok([red,white].some(c=>c.every((n,j)=>n===color[j])));for(let j=1;j<3;j++)assert.deepEqual(Array.from(a.array.slice(ids[i+j]*3,ids[i+j]*3+3)),color);}
 }
 const contact=createRoadContactIndex(meshes);assert.equal(contact.sampleAt(0,5),null,'portal has no invisible raised floor');assert.equal(contact.sampleAt(2,5),2);assert.ok(Math.abs(contact.sampleProfileAt(2,5).baseY-1.957)<.000001);
 contact.dispose();assert.equal(contact.stats().triangles,0);
});
test('asphalt and coloured physical bands retain separate bounded batches without changing spatial keys',()=>{
 const b=createSpatialRoadBatches({maxVertices:3});
 b.append([0,0,0,1,0,0,0,0,1],[0,2,1],'at_grade');
 for(let i=0;i<2;i++)b.append([0,1,0,1,1,0,0,1,1],[0,2,1],'at_grade',{material:'edge-band',colors:Uint8Array.from([...red,...red,...red]),baseY:Float32Array.from([.9,.9,.9])});
 assert.equal(b.batches.length,3);assert.equal(b.batches[0].colors,undefined);assert.ok(b.batches.every(v=>v.spatialKey==='0:0'));
 assert.throws(()=>b.append([0,0,0],[0],'at_grade',{material:'unknown'}),/material/);
 assert.throws(()=>b.append([0,0,0],[0],'at_grade',{material:'edge-band',colors:[1,2,999]}),/material/);
 b.finish();
});
