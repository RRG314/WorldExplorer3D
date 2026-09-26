import test from 'node:test';
import assert from 'node:assert/strict';
import {indexPavementPositions} from '../app/js/world/pavement-indexed-mesh.js';
import {createPavementBaseSampler} from '../app/js/world/pavement-height-sampler.js';
import {serializeStreetPavementFingerprint} from '../app/js/world/compiler/street-pavement-fingerprint.js';

test('pavement cache keys retain geometry and shared road ownership without expanding each edge owner',()=>{
 const road={auditIndex:7,type:'residential',tags:{sidewalk:'both'},pts:Array.from({length:1000},(_,i)=>({x:i,z:i*.1})),resolvedCrossSection:{placementOffset:1}};
 const tile={key:'0:0',segments:[{road,a:{x:0,z:0},b:{x:10,z:1}}],joins:[{road,point:{x:5,z:.5}}],frontageBarriers:Array.from({length:1000},(_,i)=>({a:{x:i,z:0},b:{x:i+1,z:1},road}))};
 const before=JSON.stringify(tile),key=serializeStreetPavementFingerprint(tile,1.11),snapshot=JSON.parse(key);
 assert.equal(JSON.stringify(tile),before,'fingerprinting must not mutate compilation input');
 assert.equal(snapshot.roads.length,1);
 assert.deepEqual(snapshot.roads[0],road);
 assert.equal(snapshot.tile.segments[0].road.roadIndex,snapshot.tile.frontageBarriers[999].road.roadIndex);
 assert.ok(key.length<before.length*.02,'shared road point lists must not grow once per visibility edge');
 assert.equal(serializeStreetPavementFingerprint(structuredClone(tile),1.11),key);
 const change=mutate=>{const copy=structuredClone(tile);mutate(copy);assert.notEqual(serializeStreetPavementFingerprint(copy,1.11),key);};
 change(t=>{t.frontageBarriers[0].a.x+=.001;});
 change(t=>{t.segments[0].road.tags.sidewalk='no';});
 change(t=>{t.segments[0].road.resolvedCrossSection.placementOffset=2;});
 change(t=>{t.segments[0].road.pts[500].z+=1;});
 change(t=>{t.frontageBarriers[0].road=structuredClone(t.frontageBarriers[0].road);});
 assert.notEqual(serializeStreetPavementFingerprint(tile,1),key);
});

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

test('pavement clearance stays continuous when the nearest unequal-width street changes',()=>{
 const ground=()=>0;
 const segments=[{a:{x:0,z:0},b:{x:20,z:0},wa:2,wb:2,road:{surfaceBias:.18}},{a:{x:0,z:10},b:{x:20,z:10},wa:4,wb:4,road:{surfaceBias:.18}}];
 const sample=createPavementBaseSampler({segments,ground,roadContactIndex:{sampleAt:()=>.18}});
 assert.ok(Math.abs(sample(10,4.99999)-sample(10,5.00001))<1e-5);
 assert.ok(Math.abs(sample(10,1)-.18)<1e-9);assert.ok(Math.abs(sample(10,8)-.18)<1e-9);
 const reverse=createPavementBaseSampler({segments:[...segments].reverse(),ground,roadContactIndex:{sampleAt:()=>.18}});
 for(let z=1;z<=8;z+=.01){assert.ok(Math.abs(sample(10,z)-reverse(10,z))<1e-10);assert.ok(Math.abs(sample(10,z+.001)-sample(10,z))/.001<.08);}
});

test('pavement clearance uses the placed carriageway and physical shoulder distance',()=>{
 const sample=createPavementBaseSampler({segments:[{a:{x:0,z:0},b:{x:20,z:0},wa:4,wb:4,offset:2,road:{surfaceBias:.18,metersPerWorldUnit:2}}],ground:()=>0});
 assert.equal(sample(10,4),.18);
 assert.ok(Math.abs(sample(10,6)-.09)<1e-10);
 assert.equal(sample(10,8),.018);
});

test('indexing drops render-precision collapse while preserving vertical curbs and thin valid faces',()=>{
 const input=[
  1000000,0,0,1000000.001,0,0,1000000,0,1,
  0,0,0,0,1,0,0,1,1,
  0,0,0,1,0,0,1,0,.000001
 ];
 const mesh=indexPavementPositions(input);
 assert.equal(mesh.collapsedTriangles,1);assert.equal(mesh.indices.length,6);
 assert.deepEqual([...mesh.indices].flatMap(i=>[...mesh.positions.slice(i*3,i*3+3)]),[...new Float32Array(input.slice(9))]);
 assert.throws(()=>indexPavementPositions([0,0,0]),/Invalid pavement triangle/);
});
