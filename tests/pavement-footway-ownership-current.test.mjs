import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {streetSourceInput} from '../app/js/world/street-source-input.js';
import {prepareStreetPavement,compilePavementTile,meshPavementTile} from '../app/js/world/compiler/street-pavement.js';
import {publishLinearFeaturePresentation} from '../app/js/world/linear-feature-presentation.js';
import {buildFeatureRibbonEdges} from '../app/js/structure-semantics.js?v=63';
import {createConcretePavementTexture} from '../app/js/world/pavement-texture.js';

const bounds={minX:0,maxX:64,minZ:0,maxZ:64};
const path=(subtype='footway')=>({kind:'footway',subtype,width:2,surfaceBias:.08,pts:[{x:-10,z:10},{x:74,z:10}],structureSemantics:{terrainMode:'at_grade'}});
const compile=input=>prepareStreetPavement({...input,coverageBounds:bounds,metersPerWorldUnit:1}).tiles.flatMap(tile=>{
 const result=compilePavementTile(tile,1);
 return meshPavementTile(tile,result.polygons,()=>0).triangles;
});
const area=triangles=>triangles.reduce((s,[a,b,c])=>s+Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/2,0);

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
