import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import * as THREE from 'three';
import {applyRoadCreaseNormals} from '../app/js/terrain/road-crease-normals.js';
import {createDaytonaPavementSection} from './fixtures/daytona-pavement-section.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
const geometry=(positions,indices)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setIndex(new THREE.BufferAttribute(indices,1));return g;};
test('a sharp road crease has separate normals while every triangle and contact witness retains its exact values',()=>{
 const p=Float32Array.from([0,0,0,10,0,0,0,0,10,0,6,20,10,6,20,10,0,10]),i=Uint16Array.from([0,2,1,1,2,5,2,3,5,5,3,4]),g=geometry(p,i),colors=Uint8Array.from(p,(_,j)=>j*13),base=Float32Array.from({length:p.length/3},(_,j)=>p[j*3+1]-.18);g.setAttribute('color',new THREE.BufferAttribute(colors,3,true));g.setAttribute('roadBaseY',new THREE.BufferAttribute(base,1));
 const result=applyRoadCreaseNormals(g,undefined,THREE);assert.ok(result.vertices>result.sourceVertices);assert.equal(result.triangles,i.length/3);
 for(let corner=0;corner<i.length;corner++){const source=i[corner],target=g.index.array[corner];for(let k=0;k<3;k++){assert.equal(g.attributes.position.array[target*3+k],p[source*3+k]);assert.equal(g.attributes.color.array[target*3+k],colors[source*3+k]);}assert.equal(g.attributes.roadBaseY.array[target],base[source]);}
 const flat=g.attributes.normal.array,at=(corner,k)=>flat[g.index.array[corner]*3+k];assert.ok(at(1,1)>.99);assert.ok(at(6,1)<.9,'the raised bank cannot borrow the flat apron normal');assert.equal(g.attributes.color.normalized,true);g.dispose();
});
test('native Daytona render creases preserve the exact road/contact triangles without multiplying the whole mesh',async()=>{
 const f=await createDaytonaPavementSection({fetchImpl:async url=>({ok:true,text:()=>fs.readFile(new URL('..'+url,import.meta.url),'utf8')})}),before=[],after=[];
 try{for(const b of f.batches){const g=geometry(b.positions,b.indices),source=g.attributes.position.array,index=g.index.array,result=applyRoadCreaseNormals(g,undefined,THREE);assert.ok(result.vertices<result.sourceVertices*1.15);for(let corner=0;corner<index.length;corner++)for(let k=0;k<3;k++)assert.equal(g.attributes.position.array[g.index.array[corner]*3+k],source[index[corner]*3+k]);before.push({geometry:geometry(source,index),userData:{terrainMode:'at_grade'}});after.push({geometry:g,userData:{terrainMode:'at_grade'}});}
 const a=createRoadContactIndex(before),b=createRoadContactIndex(after);try{const p=f.road.pts[34],q=f.road.pts[35],dx=q.x-p.x,dz=q.z-p.z,length=Math.hypot(dx,dz);for(let t=.1;t<1;t+=.1)for(let offset=-11;offset<=2;offset+=.25){const x=p.x+dx*t-dz/length*offset/1.11,z=p.z+dz*t+dx/length*offset/1.11;assert.equal(b.sampleAt(x,z),a.sampleAt(x,z));}}finally{a.dispose();b.dispose();}
 }finally{for(const m of [...before,...after])m.geometry.dispose();}
});
