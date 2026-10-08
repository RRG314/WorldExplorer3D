import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {streetSourceInput} from '../app/js/world/street-source-input.js';
import {prepareStreetPavement,compilePavementTile,meshPavementTile} from '../app/js/world/compiler/street-pavement.js';
import {publishLinearFeaturePresentation} from '../app/js/world/linear-feature-presentation.js';
import {buildFeatureRibbonEdges} from '../app/js/structure-semantics.js?v=63';
import {createConcretePavementTexture} from '../app/js/world/pavement-texture.js';
import {createMappedPavementClipper} from '../app/js/world/mapped-pavement-clip.js';
import {mappedPavementContactSources} from '../app/js/world/mapped-pavement-contact.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
import {readFileSync} from 'node:fs';
import {isMappedPedestrianArea} from '../app/js/world/compiler/pavement-footway-policy.js';
import {streetPolygonKernel} from '../app/js/world/compiler/street-polygon-kernel.js';

const bounds={minX:0,maxX:64,minZ:0,maxZ:64};
const path=(subtype='footway')=>({kind:'footway',subtype,width:2,surfaceBias:.08,pts:[{x:-10,z:10},{x:74,z:10}],structureSemantics:{terrainMode:'at_grade'}});
const compile=input=>prepareStreetPavement({...input,coverageBounds:bounds,metersPerWorldUnit:1}).tiles.flatMap(tile=>{
 const result=compilePavementTile(tile,1);
 return meshPavementTile(tile,result.polygons,()=>0).triangles;
});
const area=triangles=>triangles.reduce((s,[a,b,c])=>s+Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/2,0);
const covers=(triangles,x,z)=>triangles.some(triangle=>{
 const signs=triangle.map((a,i)=>{const b=triangle[(i+1)%3];return (b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x);});
 return signs.every(s=>s>=-1e-7)||signs.every(s=>s<=1e-7);
});
const building=(x0,z0,x1,z1)=>({pts:[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}]});

test('captured Light Street keeps concrete outside mapped plazas and preserves transport sources',()=>{
 const {input}=JSON.parse(readFileSync(new URL('./fixtures/streets/baltimore-light-street-layout.json',import.meta.url)));
 const before=JSON.stringify(input.roads),plan=prepareStreetPavement(input);
 const polygons=plan.tiles.flatMap(tile=>compilePavementTile(tile,input.metersPerWorldUnit).polygons);
 assert.ok(polygons.length>20,'the actual neighborhood retains sidewalk coverage');
 const polygonArea=ring=>Math.abs(ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);
 const overlapArea=polys=>polys.reduce((s,p)=>s+polygonArea(p[0])-p.slice(1).reduce((n,h)=>n+polygonArea(h),0),0);
 const mapped=input.landuses.filter(isMappedPedestrianArea).map(f=>[f.pts,...(f.holeRings||[])].map(r=>r.map(p=>[p.x,p.z])));
 assert.ok(mapped.length>3,'multiple surveyed paved areas are present');
 const overlap=overlapArea(streetPolygonKernel.intersection(polygons,streetPolygonKernel.union(mapped)));
 assert.ok(overlap<.05,`duplicate concrete area ${overlap}`);
 assert.equal(JSON.stringify(input.roads),before,'sidewalk publication leaves transport data untouched');
});

test('a generic routing path cannot expand into a nearby building courtyard',()=>{
 const feature=path();feature.pts=[{x:0,z:20},{x:64,z:20}];
 const triangles=compile({linearFeatures:[feature],buildings:[building(0,24,32,35),building(32,24,64,35)]});
 assert.ok(Math.abs(area(triangles)-128)<.001);
 assert.ok(covers(triangles,20,20));assert.ok(!covers(triangles,20,22));
});

test('an inferred urban sidewalk and mapped path form one curb-connected surface without paving planting',()=>{
 const road={type:'primary',width:8,pts:[{x:0,z:20},{x:64,z:20}]};
 const feature={...path(),pts:[{x:0,z:30},{x:64,z:30}]};
 const input={roads:[road],linearFeatures:[feature],buildings:[building(0,4,64,9)]};
 const triangles=compile(input);
 for(const z of [24.5,26,28,30])assert.ok(covers(triangles,20,z),`continuous curb to path at ${z}`);
 assert.ok(!covers(triangles,20,20),'carriageway remains clear');
 const grass={...building(10,26,30,29),type:'grass'};
 const planted=compile({...input,landuses:[grass]});
 assert.ok(!covers(planted,20,27),'physical planting excludes inferred connection');
 assert.ok(covers(planted,20,30),'mapped path remains beside planting');
});

test('a mapped parallel sidewalk replaces just the corresponding inferred street interval',()=>{
 const road={type:'residential',width:8,pts:[{x:0,z:20},{x:64,z:20}],tags:{sidewalk:'both'}};
 const feature={...path('sidewalk'),pts:[{x:12,z:30},{x:48,z:30}]};
 const triangles=compile({roads:[road],linearFeatures:[feature],buildings:[building(12,33,48,40)]});
 assert.ok(covers(triangles,5,25),'unmapped road interval keeps its sidewalk');
 assert.ok(!covers(triangles,25,25),'mapped interval cannot paint a second curb near the centerline');
 assert.ok(covers(triangles,25,30)&&covers(triangles,25,32),'mapped sidewalk retains its close frontage');
 assert.ok(covers(triangles,25,15),'the opposite side is independent');
});

test('an unclassified mapped path needs street-frontage evidence before replacing a sidewalk',()=>{
 const road={type:'residential',width:8,pts:[{x:0,z:20},{x:64,z:20}],tags:{sidewalk:'both'}};
 const feature={...path(),pts:[{x:12,z:30},{x:48,z:30}],sourceTags:{_sourceCompleteness:'generalized'}};
 const standalone=compile({roads:[road],linearFeatures:[feature]});
 assert.ok(covers(standalone,25,25)&&covers(standalone,25,30),'a parallel park path remains a separate path');
 const frontage=compile({roads:[road],linearFeatures:[feature],buildings:[building(12,33,48,40)]});
 assert.ok(!covers(frontage,25,25));assert.ok(covers(frontage,25,32));
});

test('crossing connections cannot suppress longitudinal sidewalks or pave the carriageway',()=>{
 const road={type:'residential',width:8,pts:[{x:0,z:20},{x:64,z:20}],tags:{sidewalk:'both'}};
 const triangles=compile({roads:[road],linearFeatures:[{...path(),pts:[{x:30,z:10},{x:30,z:30}]}]});
 assert.ok(!covers(triangles,30,20));assert.ok(covers(triangles,20,25)&&covers(triangles,40,15));
});

test('sidewalk reconciliation leaves source roads, bridges and tunnels unchanged',()=>{
 for(const terrainMode of ['at_grade','elevated','subgrade']) {
  const road={type:'residential',width:8,pts:[{x:0,z:20},{x:64,z:20}],tags:{sidewalk:'both'},structureSemantics:{terrainMode,gradeSeparated:terrainMode!=='at_grade'}};
  const input={roads:[road],linearFeatures:[{...path('sidewalk'),pts:[{x:12,z:30},{x:48,z:30}]}]};
  const before=structuredClone(input);compile(input);assert.deepEqual(input,before);
  if(terrainMode!=='at_grade')assert.ok(covers(compile(input),25,30),'independent ground path survives a grade-separated road');
 }
});

test('mapped plazas own their paving instead of receiving concrete route overlays',()=>{
 const plaza={...building(10,5,50,15),type:'paved',tags:{'area:highway':'pedestrian',surface:'bricks'},presentationOwner:'mapped_geometry'};
 const input=streetSourceInput({linearFeatures:[path()],landuses:[plaza],METERS_PER_WORLD_UNIT:1});
 assert.equal(input.landuses[0].presentationOwner,'mapped_geometry');
 const triangles=compile(input);
 assert.ok(covers(triangles,5,10)&&covers(triangles,55,10),'paths continue outside the plaza');
 assert.ok(!covers(triangles,25,10),'the existing plaza material owns its interior');
 const withoutOwner={...plaza,presentationOwner:undefined};
 assert.ok(covers(compile({landuses:[withoutOwner]}),25,10),'raw area input can still be compiled when no renderer owns it');
});

test('coarse path clipping keeps plaza holes and the original sloping contact plane',()=>{
 const plaza={...building(10,5,50,15),tags:{'area:highway':'footway'},presentationOwner:'mapped_geometry',holeRings:[building(25,8,35,12).pts]};
 const clip=createMappedPavementClipper([plaza]);
 const positions=[0,0,9,64,6.4,9,64,6.4,11,0,0,11],indices=[0,2,1,0,3,2];
 const result=clip(positions,indices);
 const triangles=[];
 for(let i=0;i<result.indices.length;i+=3)triangles.push(result.indices.slice(i,i+3).map(j=>({x:result.positions[j*3],z:result.positions[j*3+2]})));
 assert.ok(Math.abs(area(triangles)-68)<.01,'subtract 40m of plaza but retain its 10m hole');
 assert.ok(covers(triangles,30,10)&&!covers(triangles,20,10));
 for(let i=0;i<result.positions.length;i+=3)assert.ok(Math.abs(result.positions[i+1]-result.positions[i]*.1)<1e-6);
 assert.equal(createMappedPavementClipper([{...plaza,tags:{...plaza.tags,bridge:'yes'}}]),null,'a pedestrian bridge cannot cut a ground path');
});

test('mapped plaza contact uses accepted world transforms and releases with its publication',async()=>{
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,1,0,10,2,0,0,1,10],3));
 const mesh=new THREE.Mesh(geometry);mesh.position.set(100,20,-100);mesh.userData.mappedPedestrianArea=true;
 const before=Array.from(geometry.attributes.position.array);
 const sources=await mappedPavementContactSources([mesh]);
 const index=createRoadContactIndex(sources,4,{bounds:{minX:100,maxX:110,minZ:-100,maxZ:-90}});
 assert.ok(Math.abs(index.sampleAt(102,-98)-21.2)<1e-5);assert.equal(index.sampleAt(2,2),null);
 assert.deepEqual(Array.from(geometry.attributes.position.array),before,'rendered geometry is not rewritten for collision');
 index.dispose();assert.equal(index.sampleAt(102,-98),null);
 await assert.rejects(mappedPavementContactSources([mesh],{current:()=>false}),/superseded/);
 geometry.dispose();mesh.material.dispose();
});

test('mapped footways share sidewalk area ownership and retain coarse coverage only outside the resident window',()=>{
 globalThis.THREE=THREE;
 for(const subtype of ['sidewalk','footway','pedestrian']){
  const feature=path(subtype);
  const source=streetSourceInput({linearFeatures:[feature],METERS_PER_WORLD_UNIT:1});
  assert.equal(source.linearFeatures.length,1);
  assert.ok(Math.abs(area(compile(source))-128)<.001,'the full 64m by 2m path is retained');
  const ctx={scene:new THREE.Scene(),linearFeatureMeshes:[],addEarthWorldObject(mesh){this.scene.add(mesh);}};
  publishLinearFeaturePresentation({appCtx:ctx,features:[feature],buildFeatureRibbonEdges,worldBaseTerrainY:()=>0,pavementBounds:bounds});
  assert.equal(ctx.linearFeatureMeshes.length,1);
  const mesh=ctx.linearFeatureMeshes[0],positions=mesh.geometry.attributes.position;
  for(let i=0;i<positions.count;i++)assert.ok(positions.getX(i)<=0||positions.getX(i)>=64,'no duplicate ribbon inside accepted pavement');
  assert.ok([...positions.array].every(Number.isFinite));
  mesh.geometry.dispose();mesh.material.dispose();
  assert.equal(feature.subtype,subtype,'do not relabel source features');
 }
 delete globalThis.THREE;
});

test('trails, steps, unpaved paths and structures retain their separate surface owner',()=>{
 const features=['path','steps','corridor'].map(path).concat([
  {...path(),sourceTags:{surface:'gravel'}},
  {...path(),sourceTags:{surface:'ground'}},
  {...path(),structureSemantics:{terrainMode:'elevated',gradeSeparated:true}},
  {...path(),isStructureConnector:true},
  {...path(),structureSemantics:{terrainMode:'at_grade',rampCandidate:true}}
 ]);
 assert.equal(streetSourceInput({linearFeatures:features}).linearFeatures.length,0);
 assert.equal(compile({linearFeatures:features}).length,0);
});

test('mapped park paths survive without paving the park or intersecting buildings and roads',()=>{
 const box=(x0,z0,x1,z1)=>({pts:[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}]});
 const result=compile({linearFeatures:[path()],landuses:[{...box(0,0,64,64),type:'park'}],buildings:[box(20,9,24,11)],
  roads:[{type:'residential',width:4,pts:[{x:40,z:0},{x:40,z:64}],tags:{sidewalk:'no'}}]});
 assert.ok(Math.abs(area(result)-112)<.001,'only the mapped path remains, excluding the 4m building and 4m road');
 for(const triangle of result){
  const x=triangle.reduce((s,p)=>s+p.x,0)/3,z=triangle.reduce((s,p)=>s+p.z,0)/3;
  assert.ok(z>=9&&z<=11);assert.ok(x<=20||x>=24);assert.ok(x<=38||x>=42);
 }
 assert.equal(compile({linearFeatures:[path()],landuses:[{...box(0,0,64,64),type:'water'}]}).length,0);
});

test('mapped and inferred pavement union once instead of painting a second strip',()=>{
 const road={type:'residential',width:8,pts:[{x:0,z:10},{x:64,z:10}],tags:{sidewalk:'both'}};
 const feature=path();feature.pts=[{x:0,z:15},{x:64,z:15}];
 const source=streetSourceInput({roads:[road],linearFeatures:[feature],METERS_PER_WORLD_UNIT:1});
 const actual=compile(source),reference=compile({...source,linearFeatures:[{...feature,subtype:'sidewalk'}]});
 assert.deepEqual(actual,reference);
 assert.ok(area(actual)>0);
});

test('fallback paved paths use resident concrete scale and release their texture on replacement',t=>{
 const prior=globalThis.THREE;globalThis.THREE=THREE;t.after(()=>{globalThis.THREE=prior;});
 const paved=path(),trail={...path(),sourceTags:{surface:'dirt'}};
 const ctx={scene:new THREE.Scene(),linearFeatureMeshes:[],METERS_PER_WORLD_UNIT:2,addEarthWorldObject(mesh){this.scene.add(mesh);}};
 publishLinearFeaturePresentation({appCtx:ctx,features:[paved,trail],buildFeatureRibbonEdges,worldBaseTerrainY:()=>0});
 const mesh=ctx.linearFeatureMeshes.find(m=>m.material.map),plain=ctx.linearFeatureMeshes.find(m=>!m.material.map);
 assert.ok(mesh&&plain,'unpaved trails keep their own material');
 const expected=createConcretePavementTexture(THREE);
 assert.deepEqual(mesh.material.map.image.data,expected.image.data);
 assert.equal(mesh.receiveShadow,true);
 const p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;
 for(let i=0;i<p.count;i++){
  assert.ok(Math.abs(uv.getX(i)-p.getX(i)*2/1.6)<1e-4);
  assert.ok(Math.abs(uv.getY(i)-p.getZ(i)*2/1.6)<1e-4);
 }
 let released=0;mesh.material.map.addEventListener('dispose',()=>released++);
 for(const m of ctx.linearFeatureMeshes){m.geometry.dispose();m.material.dispose();}
 assert.equal(released,1);expected.dispose();
});
